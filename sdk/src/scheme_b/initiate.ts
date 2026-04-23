/**
 * initiateCommit() — Scheme B Step 1
 *
 * Initiator computes commitment hash off-chain, then submits initiate_commit
 * transaction to lock their ledger and create a CommitSlot PDA.
 *
 * ~50,000 CU, no ZK verification.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { computeCommitment } from "../crypto/commitment";
import { findCommitSlotPDA, findLedgerPDA, findConfigPDA, splitAmount } from "./index";

export interface InitiateParams {
  counterparty: PublicKey;
  asset_a_mint: PublicKey;
  asset_b_mint: PublicKey;
  transfer_amount: bigint;   // Full-precision amount (smallest unit)
  expiry_seconds: number;     // 30-60 seconds
}

export interface InitiateResult {
  commit_slot_id: PublicKey;
  commitment_hash: Uint8Array;
  nonce: bigint;
  expiry: number;
  tx_signature: string;
}

export async function initiateCommit(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: InitiateParams
): Promise<InitiateResult> {
  // ── Parameter validation ───────────────────────────────────────────
  if (params.expiry_seconds < 30 || params.expiry_seconds > 60) {
    throw new Error(`expiry_seconds must be 30-60, got ${params.expiry_seconds}`);
  }
  if (params.transfer_amount <= 0n) {
    throw new Error("transfer_amount must be positive");
  }

  // ── Compute commitment hash (< 1ms off-chain) ─────────────────────
  const nonce = BigInt(Date.now()); // millisecond timestamp, sufficient for uniqueness
  const expiry = Math.floor(Date.now() / 1000) + params.expiry_seconds;
  const { lo: transfer_lo, hi: transfer_hi } = splitAmount(params.transfer_amount);

  const commitment_hash = await computeCommitment({
    nonce,
    transfer_amount_lo: transfer_lo,
    transfer_amount_hi: transfer_hi,
    asset_a_mint: params.asset_a_mint.toBytes(),
    asset_b_mint: params.asset_b_mint.toBytes(),
    counterparty: params.counterparty.toBytes(),
    expiry_timestamp: expiry,
  });

  // ── Derive PDAs ────────────────────────────────────────────────────
  const [ledgerA] = findLedgerPDA(wallet.publicKey, params.asset_a_mint, program.programId);
  const [commitSlot] = findCommitSlotPDA(ledgerA, nonce, program.programId);
  const [configPda] = findConfigPDA(program.programId);

  // ── Submit transaction ─────────────────────────────────────────────
  const nonceBN = new anchor.BN(nonce.toString());
  const expiryBN = new anchor.BN(expiry);

  const sig = await program.methods
    .initiateCommit({
      nonce: nonceBN,
      counterparty: params.counterparty,
      assetBMint: params.asset_b_mint,
      commitmentHash: Array.from(commitment_hash),
      expiryInit: expiryBN,
    })
    .accounts({
      s: wallet.publicKey,
      ledgerA: ledgerA,
      commitSlot: commitSlot,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  return {
    commit_slot_id: commitSlot,
    commitment_hash,
    nonce,
    expiry,
    tx_signature: sig,
  };
}
