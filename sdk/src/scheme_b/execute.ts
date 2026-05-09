/**
 * executeSettle() — Scheme B Step 3 (Private Circuit)
 *
 * Three transactions:
 * 1. createProofData — creates ProofData PDA (nonce only, arrays zero-filled)
 * 2. writeProofData × 4 — writes proof/ciphertext chunks (256 or 512 bytes each)
 * 3. executeSettleB — verifies ZK proofs via CPI, commitment hash as public input
 *
 * All balance/amount values are PRIVATE in the ZK circuit.
 * Only commitment_hash_lo/hi are public inputs to the proof.
 *
 * SPL Token transfers happen atomically with settlement:
 * - Party A sends transfer_amount_a of asset_a to Party B
 * - Party B sends transfer_amount_b of asset_b to Party A (via delegate PDA)
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { findLedgerPDA, findConfigPDA, findSettlementPDA, findProofDataPDA, splitAmount } from "./index";
import { encrypt as elgamalEncrypt, serializeCiphertext, Point } from "../crypto/elgamal";
import { Groth16Proof, createPrivateCircuitInputs, splitHashToLimbs } from "../workers/prover";
import { computeCommitment } from "../crypto/commitment";

// ── SPL Token constants ─────────────────────────────────────────────
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Derive associated token account address (no @solana/spl-token dependency). */
export function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

/** Derive delegate PDA for Party B's token authority. */
export function findDelegatePDA(commitSlotKey: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), commitSlotKey.toBuffer()],
    programId
  );
}

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
  transfer_amount_a: bigint;  // A→B amount (asset_a_mint)
  transfer_amount_b: bigint;  // B→A amount (asset_b_mint)
  proof_a: ZKProofData;
  proof_b: ZKProofData;
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

  const ct_lo = elgamalEncrypt(BigInt(new_lo), encryptPublicKey);
  const ct_hi = elgamalEncrypt(BigInt(new_hi), encryptPublicKey);
  const audit_lo = elgamalEncrypt(BigInt(old_lo), encryptPublicKey);
  const audit_hi = elgamalEncrypt(BigInt(old_hi), encryptPublicKey);

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

  // ── Derive SPL token accounts ──────────────────────────────────────
  const initiatorPk = new PublicKey(slot.initiator);
  const counterpartyPk = new PublicKey(slot.counterparty);
  const assetAMint = new PublicKey(slot.assetAMint);
  const assetBMint = new PublicKey(slot.assetBMint);

  const partyATokenA = findAssociatedTokenAddress(initiatorPk, assetAMint);
  const partyBTokenA = findAssociatedTokenAddress(counterpartyPk, assetAMint);
  const partyBTokenB = findAssociatedTokenAddress(counterpartyPk, assetBMint);
  const partyATokenB = findAssociatedTokenAddress(initiatorPk, assetBMint);

  const [delegatePda] = findDelegatePDA(params.commit_slot_id, program.programId);

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

  // ── Step 3: Execute settlement with SPL token transfers ────────────
  if (!params.proof_a || !params.proof_b) {
    throw new Error("Real ZK proofs are required for execute (proof_a and proof_b must be provided)");
  }

  const sig2 = await program.methods
    .executeSettleB({
      nonce: new anchor.BN(nonce.toString()),
      commitmentHashLo: new anchor.BN(params.proof_a.commitment_hash_lo.toString()),
      commitmentHashHi: new anchor.BN(params.proof_a.commitment_hash_hi.toString()),
      settlementNonce: new anchor.BN(settlementNonce.toString()),
      transferAmountA: new anchor.BN(params.transfer_amount_a.toString()),
      transferAmountB: new anchor.BN(params.transfer_amount_b.toString()),
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
      zkVerifierProgram: new PublicKey("6X4MCKGaZHVUpzVKJSmgZgUcK5ZTvxPixK4f3ARNfPyN"),
      partyATokenA: partyATokenA,
      partyBTokenA: partyBTokenA,
      partyBTokenB: partyBTokenB,
      partyATokenB: partyATokenB,
      delegate: delegatePda,
      tokenProgram: TOKEN_PROGRAM_ID,
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
