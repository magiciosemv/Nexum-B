/**
 * Nexum Protocol — Scheme B SDK: PDA Helpers, Types, and Enums
 *
 * All PDA seed derivations MUST match the Rust on-chain program exactly.
 * Any mismatch = transaction failure.
 */

import { PublicKey } from "@solana/web3.js";

// ── SlotStatus enum (mirrors Rust SlotStatus) ────────────────────────

export enum SlotStatus {
  WaitingAccept = 0,
  BothLocked = 1,
  Settled = 2,
  Cancelled = 3,
}

// ── LedgerStatus enum (mirrors Rust LedgerStatus) ────────────────────

export enum LedgerStatus {
  Active = 0,
  PendingInitiator = 1,
  BothPending = 2,
  PendingCounterparty = 3,
  Emergency = 4,
}

// ── VSlotStatus enum (mirrors Rust VSlotStatus) ──────────────────────

export enum VSlotStatus {
  Free = 0,
  Bound = 1,
  Done = 2,
  Expired = 3,
}

// ── SettlementScheme enum ───────────────────────────────────────────

export enum SettlementScheme {
  SchemeA = 0,
  SchemeB = 1,
}

// ── CommitSlot on-chain account shape ────────────────────────────────

export interface CommitSlotAccount {
  initiator: PublicKey;
  counterparty: PublicKey;
  asset_a_mint: PublicKey;
  asset_b_mint: PublicKey;
  commitment_hash: Uint8Array; // 32 bytes
  expiry_init: number;         // i64
  execute_expiry: number;      // i64 (filled on accept)
  nonce: bigint;               // u64
  both_locked_at: number;      // i64 (filled on accept)
  status: SlotStatus;
  bump: number;
}

// ── UserLedger on-chain account shape ────────────────────────────────

export interface UserLedgerAccount {
  owner: PublicKey;
  mint: PublicKey;
  balance_ct_lo: Uint8Array;   // 128 bytes
  balance_ct_hi: Uint8Array;   // 128 bytes
  audit_ct_lo: Uint8Array;     // 128 bytes
  audit_ct_hi: Uint8Array;     // 128 bytes
  version: bigint;             // u64
  status: LedgerStatus;
  last_settlement_id: Uint8Array; // 32 bytes
  bump: number;
  // Scheme B pending fields
  pending_commitment: Uint8Array; // 32 bytes
  pending_expiry: number;        // i64
  pending_counterparty: PublicKey;
  pending_asset_b_mint: PublicKey;
  pending_nonce: bigint;          // u64
}

// ── VersionSlot on-chain account shape ───────────────────────────────

export interface VersionSlotAccount {
  ledger: PublicKey;
  slot_version: bigint; // u64
  slot_index: bigint;   // u64
  status: VSlotStatus;
  bound_to: Uint8Array; // 32 bytes (CommitSlot pubkey when Bound)
  expires_at: number;   // i64
  bump: number;
}

// ── PDA Derivation Helpers ───────────────────────────────────────────
// Seeds MUST match the Rust program's `seeds = [...]` constraints exactly.

/**
 * Derive CommitSlot PDA.
 * Rust seeds: ["cslot", ledger_a_key.as_ref(), &nonce.to_le_bytes()]
 */
export function findCommitSlotPDA(
  ledgerAKey: PublicKey,
  nonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  // Write u64 LE — two writeUInt32LE calls equivalent to Rust u64::to_le_bytes()
  nonceBuffer.writeUInt32LE(Number(nonce & 0xFFFFFFFFn), 0);
  nonceBuffer.writeUInt32LE(Number(nonce >> 32n), 4);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("cslot"), ledgerAKey.toBuffer(), nonceBuffer],
    programId
  );
}

/**
 * Derive VersionSlot PDA.
 * Rust seeds: ["vslot", ledger_key.as_ref(), &slot_index.to_le_bytes()]
 */
export function findVersionSlotPDA(
  ledgerKey: PublicKey,
  slotIndex: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const idxBuffer = Buffer.alloc(8);
  idxBuffer.writeUInt32LE(Number(slotIndex & 0xFFFFFFFFn), 0);
  idxBuffer.writeUInt32LE(Number(slotIndex >> 32n), 4);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("vslot"), ledgerKey.toBuffer(), idxBuffer],
    programId
  );
}

/**
 * Derive UserLedger PDA.
 * Rust seeds: ["ledger", owner.as_ref(), mint.as_ref()]
 */
export function findLedgerPDA(
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Derive ProtocolConfig PDA.
 * Rust seeds: ["nexum_config"]
 */
export function findConfigPDA(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nexum_config")],
    programId
  );
}

/**
 * Derive SettlementRecord PDA.
 * Rust seeds: ["settlement", commit_slot_key.as_ref(), &settlement_nonce.to_le_bytes()]
 */
export function findSettlementPDA(
  commitSlotKey: PublicKey,
  settlementNonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeUInt32LE(Number(settlementNonce & 0xFFFFFFFFn), 0);
  nonceBuffer.writeUInt32LE(Number(settlementNonce >> 32n), 4);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("settlement"), commitSlotKey.toBuffer(), nonceBuffer],
    programId
  );
}

/**
 * Derive ProofData PDA.
 * Rust seeds: ["proofs", &nonce.to_le_bytes()]
 */
export function findProofDataPDA(
  nonce: bigint,
  programId: PublicKey
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeUInt32LE(Number(nonce & 0xFFFFFFFFn), 0);
  nonceBuffer.writeUInt32LE(Number(nonce >> 32n), 4);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("proofs"), nonceBuffer],
    programId
  );
}

// ── SPL Token helpers ────────────────────────────────────────────────

const TOKEN_PROGRAM_ID_CONST = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID_CONST = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Derive associated token account address. */
export function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID_CONST.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID_CONST
  );
  return ata;
}

/** Derive delegate PDA for Party B's token authority. Seeds: ["delegate", commit_slot_key]. */
export function findDelegatePDA(commitSlotKey: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegate"), commitSlotKey.toBuffer()],
    programId
  );
}

// ── Helper: split bigint amount into lo/hi u32 ──────────────────────

export function splitAmount(amount: bigint): { lo: number; hi: number } {
  return {
    lo: Number(amount & 0xFFFFFFFFn),
    hi: Number(amount >> 32n),
  };
}

// ── Helper: bigInt LE bytes ─────────────────────────────────────────

export function bigIntToLeBytes(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(Number(n & 0xFFFFFFFFn), 0);
  buf.writeUInt32LE(Number(n >> 32n), 4);
  return buf;
}
