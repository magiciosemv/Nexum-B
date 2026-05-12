/**
 * executeSettle() — Scheme B Step 3 (Private Circuit, Vault Model)
 *
 * Three transactions:
 * 1. createProofData — creates ProofData PDA (nonce only, arrays zero-filled)
 * 2. writeProofData × 4 — writes proof/ciphertext chunks (256 or 512 bytes each)
 * 3. executeSettleB — verifies ZK proofs via CPI, updates encrypted balances only
 *
 * All balance/amount values are PRIVATE in the ZK circuit.
 * Only commitment_hash_lo/hi are public inputs to the proof.
 *
 * Vault model: tokens are held in vault PDAs, not user wallets.
 * Settlement only updates ElGamal encrypted balances — no SPL token transfers.
 * Users must deposit tokens into vaults before settlement, and withdraw after.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { findLedgerPDA, findConfigPDA, findSettlementPDA, findProofDataPDA } from "./index";
import { encrypt as elgamalEncrypt, serializeCiphertext, Point } from "../crypto/elgamal";
import { Groth16Proof } from "../workers/prover";
import { sendAndConfirmPolling } from "../utils/send_tx";

// ── Proof data structure ─────────────────────────────────────────────

export interface ZKProofData {
  proof: number[];         // 256 bytes Groth16 proof
  new_ct_lo: number[];     // 128 bytes new balance ciphertext low
  new_ct_hi: number[];     // 128 bytes new balance ciphertext high
  audit_ct_lo: number[];   // 128 bytes audit ciphertext low
  audit_ct_hi: number[];   // 128 bytes audit ciphertext high
  commitment_hash_lo: bigint;  // 128-bit lower half of commitment hash
  commitment_hash_hi: bigint;  // 128-bit upper half of commitment hash
}

export interface ExecuteParams {
  commit_slot_id: PublicKey;
  proof_a: ZKProofData;
  proof_b: ZKProofData;
  /** Party A's new encryption randomness for lo limb (31 bytes) */
  new_r_a_lo: Uint8Array;
  /** Party A's new encryption randomness for hi limb (31 bytes) */
  new_r_a_hi: Uint8Array;
  /** Party B's new encryption randomness for lo limb (31 bytes) */
  new_r_b_lo: Uint8Array;
  /** Party B's new encryption randomness for hi limb (31 bytes) */
  new_r_b_hi: Uint8Array;
}

export interface ExecuteResult {
  settlement_id: PublicKey;
  proof_data_id: PublicKey;
  tx_create_proof: string;
  txs_write_proof: string[];
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
 */
export function buildProofData(params: BuildProofDataParams): ZKProofData {
  const { proof, encryptPublicKey, old_lo, old_hi, new_lo, new_hi } = params;

  const { ciphertext: ct_lo } = elgamalEncrypt(BigInt(new_lo), encryptPublicKey);
  const { ciphertext: ct_hi } = elgamalEncrypt(BigInt(new_hi), encryptPublicKey);
  const { ciphertext: audit_lo } = elgamalEncrypt(BigInt(old_lo), encryptPublicKey);
  const { ciphertext: audit_hi } = elgamalEncrypt(BigInt(old_hi), encryptPublicKey);

  // Extract commitment hash from public signals
  const hashLo = BigInt(proof.public_signals[0]);
  const hashHi = BigInt(proof.public_signals[1]);

  return {
    proof: proof.proof_a,
    new_ct_lo: Array.from(serializeCiphertext(ct_lo)),
    new_ct_hi: Array.from(serializeCiphertext(ct_hi)),
    audit_ct_lo: Array.from(serializeCiphertext(audit_lo)),
    audit_ct_hi: Array.from(serializeCiphertext(audit_hi)),
    commitment_hash_lo: hashLo,
    commitment_hash_hi: hashHi,
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

  // ── Step 1: Create ProofData account ───────────────────────────────
  const tx1 = await program.methods
    .createProofData({
      nonce: new anchor.BN(nonce.toString()),
    })
    .accounts({
      proofData: proofDataPda,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  const sig1 = await sendAndConfirmPolling(program.provider.connection, wallet, tx1);

  // ── Step 2: Write proof chunks ────────────────────────────────────
  const chunks = buildChunks(params.proof_a, params.proof_b);

  const writeSigs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const tx = await program.methods
      .writeProofData({
        nonce: new anchor.BN(nonce.toString()),
        chunkIndex: i,
        data: Buffer.from(chunks[i]),
      })
      .accounts({
        proofData: proofDataPda,
        commitSlot: params.commit_slot_id,
        authority: wallet.publicKey,
      })
      .transaction();
    const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
    writeSigs.push(sig);
  }

  // ── Step 3: Execute settlement with SPL token transfers ────────────
  if (!params.proof_a || !params.proof_b) {
    throw new Error("Real ZK proofs are required for execute (proof_a and proof_b must be provided)");
  }

  const tx2 = await program.methods
    .executeSettleB({
      nonce: new anchor.BN(nonce.toString()),
      commitmentHashLo: new anchor.BN(params.proof_a.commitment_hash_lo.toString()),
      commitmentHashHi: new anchor.BN(params.proof_a.commitment_hash_hi.toString()),
      settlementNonce: new anchor.BN(settlementNonce.toString()),
      newRALo: Array.from(params.new_r_a_lo),
      newRAHi: Array.from(params.new_r_a_hi),
      newRBLo: Array.from(params.new_r_b_lo),
      newRBHi: Array.from(params.new_r_b_hi),
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
      zkVerifierProgram: new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA"),
    })
    .transaction();
  const sig2 = await sendAndConfirmPolling(program.provider.connection, wallet, tx2);

  return {
    settlement_id: settlementPda,
    proof_data_id: proofDataPda,
    tx_create_proof: sig1,
    txs_write_proof: writeSigs,
    tx_execute: sig2,
  };
}
