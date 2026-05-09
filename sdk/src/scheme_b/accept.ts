/**
 * acceptCommit() — Scheme B Step 2
 *
 * Counterparty fetches on-chain CommitSlot, locally verifies the commitment hash
 * matches both agreed amounts, then submits accept_commit to:
 * 1. Approve delegate PDA on Party B's token account (for B→A transfer)
 * 2. Symmetrically lock both balances
 *
 * ~50,000 CU, no ZK verification.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { verifyCommitment } from "../crypto/commitment";
import { findLedgerPDA, findConfigPDA, findDelegatePDA, findAssociatedTokenAddress, splitAmount } from "./index";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface AcceptParams {
  commit_slot_id: PublicKey;
  transfer_amount_a: bigint;  // A→B amount (for hash verification)
  transfer_amount_b: bigint;  // B→A amount (for hash verification)
}

export interface AcceptResult {
  commit_slot_id: PublicKey;
  tx_signature: string;
}

export async function acceptCommit(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: AcceptParams
): Promise<AcceptResult> {
  // ── Fetch on-chain CommitSlot ──────────────────────────────────────
  const slot = await (program.account as any).commitSlot.fetch(params.commit_slot_id);

  // ── Identity verification ──────────────────────────────────────────
  if (!slot.counterparty.equals(wallet.publicKey)) {
    throw new Error("This commit slot is not addressed to you");
  }

  // ── Expiry check ──────────────────────────────────────────────────
  const now = Math.floor(Date.now() / 1000);
  const expiryTs = (slot.expiryInit as anchor.BN).toNumber();
  if (now > expiryTs + 5) {
    throw new Error(`Commit has expired (expiry=${expiryTs}, now=${now})`);
  }

  // ── CRITICAL: Local commitment hash verification ───────────────────
  const { lo: a_lo, hi: a_hi } = splitAmount(params.transfer_amount_a);
  const { lo: b_lo, hi: b_hi } = splitAmount(params.transfer_amount_b);

  const isValid = await verifyCommitment(
    new Uint8Array(slot.commitmentHash),
    {
      nonce: BigInt((slot.nonce as anchor.BN).toString()),
      transfer_a_lo: a_lo,
      transfer_a_hi: a_hi,
      transfer_b_lo: b_lo,
      transfer_b_hi: b_hi,
      asset_a_mint: slot.assetAMint.toBytes(),
      asset_b_mint: slot.assetBMint.toBytes(),
      counterparty: wallet.publicKey.toBytes(),
      expiry_timestamp: expiryTs,
    }
  );

  if (!isValid) {
    throw new Error(
      "Commitment hash verification failed: the on-chain commitment does not match the agreed amounts. " +
      "Please confirm both amounts with the initiator via off-chain channel."
    );
  }

  // ── Derive account addresses ───────────────────────────────────────
  const [ledgerA] = findLedgerPDA(slot.initiator, slot.assetAMint, program.programId);
  const [ledgerB] = findLedgerPDA(wallet.publicKey, slot.assetBMint, program.programId);
  const [configPda] = findConfigPDA(program.programId);

  // SPL token accounts for delegate approval
  const partyBToken = findAssociatedTokenAddress(wallet.publicKey, new PublicKey(slot.assetBMint));
  const [delegatePda] = findDelegatePDA(params.commit_slot_id, program.programId);

  // ── Submit accept_commit transaction ───────────────────────────────
  const sig = await program.methods
    .acceptCommit()
    .accounts({
      s: wallet.publicKey,
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: params.commit_slot_id,
      config: configPda,
      partyBToken: partyBToken,
      delegate: delegatePda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });

  return { commit_slot_id: params.commit_slot_id, tx_signature: sig };
}
