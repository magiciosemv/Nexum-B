/**
 * executeSettle() — Scheme B Step 3
 *
 * Three transactions:
 * 1. createProofData — creates ProofData PDA (nonce only, arrays zero-filled)
 * 2. writeProofData × 4 — writes proof/ciphertext chunks (256 or 512 bytes each)
 * 3. executeSettleB — verifies ZK proofs via CPI + commitment hash, applies balance updates
 *
 * Real ZK proofs and ElGamal ciphertexts are required.
 * Use buildProofData() to assemble ZKProofData from prover output + ElGamal encryption.
 *
 * ~220,000 CU total for execute_settle_b (plus ~300K for ZK CPI verification).
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { findLedgerPDA, findConfigPDA, findSettlementPDA, findProofDataPDA, splitAmount } from "./index";
import { encrypt as elgamalEncrypt, serializeCiphertext, Point } from "../crypto/elgamal";
import { Groth16Proof, createCircuitInputs } from "../workers/prover";

// ── Proof data structure ─────────────────────────────────────────────

export interface ZKProofData {
  proof: number[];         // 256 bytes Groth16 proof
  new_ct_lo: number[];     // 128 bytes new balance ciphertext low
  new_ct_hi: number[];     // 128 bytes new balance ciphertext high
  audit_ct_lo: number[];   // 128 bytes audit ciphertext low
  audit_ct_hi: number[];   // 128 bytes audit ciphertext high
  // Public signals for on-chain ZK proof verification
  old_lo: number;          // u32 old balance low limb
  old_hi: number;          // u32 old balance high limb
  new_lo: number;          // u32 new balance low limb
  new_hi: number;          // u32 new balance high limb
}

export interface ExecuteParams {
  commit_slot_id: PublicKey;
  transfer_amount: bigint;
  proof_a: ZKProofData;  // Party A's ZK proof + ciphertexts + public signals
  proof_b: ZKProofData;  // Party B's ZK proof + ciphertexts + public signals
}

export interface ExecuteResult {
  settlement_id: PublicKey;
  proof_data_id: PublicKey;
  tx_create_proof: string;
  txs_write_proof: string[];    // 0 or 4 transaction signatures
  tx_execute: string;
}

// ── Chunk layout (must match Rust write_proof_data.rs) ──────────────
// Chunk 0: proof_a (256 bytes)
// Chunk 1: new_ct_a_lo(128) + new_ct_a_hi(128) + audit_ct_a_lo(128) + audit_ct_a_hi(128) = 512 bytes
// Chunk 2: proof_b (256 bytes)
// Chunk 3: new_ct_b_lo(128) + new_ct_b_hi(128) + audit_ct_b_lo(128) + audit_ct_b_hi(128) = 512 bytes

function buildChunks(proofA: ZKProofData, proofB: ZKProofData): number[][] {
  const chunks: number[][] = [];

  // Chunk 0: proof_a (256 bytes)
  chunks.push(proofA.proof);

  // Chunk 1: ct_a (512 bytes) = new_lo + new_hi + audit_lo + audit_hi
  chunks.push([
    ...proofA.new_ct_lo,
    ...proofA.new_ct_hi,
    ...proofA.audit_ct_lo,
    ...proofA.audit_ct_hi,
  ]);

  // Chunk 2: proof_b (256 bytes)
  chunks.push(proofB.proof);

  // Chunk 3: ct_b (512 bytes) = new_lo + new_hi + audit_lo + audit_hi
  chunks.push([
    ...proofB.new_ct_lo,
    ...proofB.new_ct_hi,
    ...proofB.audit_ct_lo,
    ...proofB.audit_ct_hi,
  ]);

  return chunks;
}

// ── Helper: assemble ZKProofData from proof + ElGamal encryption ────

export interface BuildProofDataParams {
  /** Groth16 proof from ProverManager.generateProof() */
  proof: Groth16Proof;
  /** Public key for ElGamal encryption (recipient's Baby Jubjub point) */
  encryptPublicKey: Point;
  /** Old balance low limb (u32) */
  old_lo: number;
  /** Old balance high limb (u32) */
  old_hi: number;
  /** New balance low limb (u32) */
  new_lo: number;
  /** New balance high limb (u32) */
  new_hi: number;
}

/**
 * Assemble a complete ZKProofData from a Groth16 proof and ElGamal encryption.
 *
 * This combines:
 * 1. The serialized 256-byte proof
 * 2. ElGamal encryption of the new balance (lo/hi limbs) under the recipient's public key
 * 3. Audit ciphertexts (same values encrypted, for audit trail)
 * 4. Public signals for on-chain ZK verification
 *
 * Usage:
 * ```ts
 * const proofData = buildProofData({
 *   proof: groth16Proof,
 *   encryptPublicKey: partyPublicKey,
 *   old_lo: 1000000, old_hi: 0,
 *   new_lo: 500000, new_hi: 0,
 * });
 * ```
 */
export function buildProofData(params: BuildProofDataParams): ZKProofData {
  const { proof, encryptPublicKey, old_lo, old_hi, new_lo, new_hi } = params;

  // Encrypt new balance lo/hi with recipient's public key
  const ct_lo = elgamalEncrypt(BigInt(new_lo), encryptPublicKey);
  const ct_hi = elgamalEncrypt(BigInt(new_hi), encryptPublicKey);

  // Audit ciphertexts — encrypt old balance for audit trail
  const audit_lo = elgamalEncrypt(BigInt(old_lo), encryptPublicKey);
  const audit_hi = elgamalEncrypt(BigInt(old_hi), encryptPublicKey);

  return {
    proof: proof.proof_a,
    new_ct_lo: Array.from(serializeCiphertext(ct_lo)),
    new_ct_hi: Array.from(serializeCiphertext(ct_hi)),
    audit_ct_lo: Array.from(serializeCiphertext(audit_lo)),
    audit_ct_hi: Array.from(serializeCiphertext(audit_hi)),
    old_lo,
    old_hi,
    new_lo,
    new_hi,
  };
}

export async function executeSettle(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: ExecuteParams
): Promise<ExecuteResult> {
  // ── Fetch on-chain state ───────────────────────────────────────────
  const slot = await (program.account as any).commitSlot.fetch(params.commit_slot_id);

  const slotStatus = (slot.status as any);
  if (slotStatus.bothLocked === undefined && slotStatus !== 1) {
    throw new Error("CommitSlot is not in BothLocked state");
  }

  const now = Math.floor(Date.now() / 1000);
  const executeExpiry = (slot.executeExpiry as anchor.BN).toNumber();
  if (now > executeExpiry + 5) {
    throw new Error("Execute window has expired. Call cancelMutual instead.");
  }

  // ── Derive account addresses ───────────────────────────────────────
  const nonce = BigInt((slot.nonce as anchor.BN).toString());
  const [ledgerA] = findLedgerPDA(slot.initiator, slot.assetAMint, program.programId);
  const [ledgerB] = findLedgerPDA(slot.counterparty, slot.assetBMint, program.programId);
  const [configPda] = findConfigPDA(program.programId);
  const [proofDataPda] = findProofDataPDA(nonce, program.programId);

  const settlementNonce = BigInt(Date.now());
  const [settlementPda] = findSettlementPDA(
    params.commit_slot_id,
    settlementNonce,
    program.programId
  );

  const { lo: transfer_lo, hi: transfer_hi } = splitAmount(params.transfer_amount);

  // ── Step 1: Create ProofData account ───────────────────────────────
  const sig1 = await program.methods
    .createProofData({
      nonce: new anchor.BN(nonce.toString()),
    })
    .accounts({
      proofData: proofDataPda,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  // ── Step 2: Write proof chunks ────────────────────────────────────
  const chunks = buildChunks(params.proof_a, params.proof_b);

  const writeSigs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const sig = await program.methods
      .writeProofData({
        nonce: new anchor.BN(nonce.toString()),
        chunkIndex: i,
        data: Buffer.from(chunks[i]),
      })
      .accounts({
        proofData: proofDataPda,
        authority: wallet.publicKey,
      })
      .rpc({ commitment: "confirmed" });

    writeSigs.push(sig);
  }

  // ── Step 3: Execute settlement ─────────────────────────────────────
  // Validate that proof data is present
  if (!params.proof_a || !params.proof_b) {
    throw new Error("Real ZK proofs are required for execute (proof_a and proof_b must be provided)");
  }

  const sig2 = await program.methods
    .executeSettleB({
      nonce: new anchor.BN(nonce.toString()),
      transferLo: transfer_lo,
      transferHi: transfer_hi,
      settlementNonce: new anchor.BN(settlementNonce.toString()),
      // Party A public balance values (for ZK proof CPI)
      oldALo: params.proof_a.old_lo,
      oldAHi: params.proof_a.old_hi,
      newALo: params.proof_a.new_lo,
      newAHi: params.proof_a.new_hi,
      // Party B public balance values (for ZK proof CPI)
      oldBLo: params.proof_b.old_lo,
      oldBHi: params.proof_b.old_hi,
      newBLo: params.proof_b.new_lo,
      newBHi: params.proof_b.new_hi,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ])
    .accounts({
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: params.commit_slot_id,
      proofData: proofDataPda,
      settlementRecord: settlementPda,
      config: configPda,
      feePayer: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      zkVerifierProgram: new PublicKey("AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi"),
    })
    .rpc({ commitment: "confirmed" });

  return {
    settlement_id: settlementPda,
    proof_data_id: proofDataPda,
    tx_create_proof: sig1,
    txs_write_proof: writeSigs,
    tx_execute: sig2,
  };
}
