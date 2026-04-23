/**
 * acceptCommit() — Scheme B Step 2
 *
 * Counterparty fetches the on-chain CommitSlot, locally verifies the commitment
 * hash matches the agreed amount, then submits accept_commit to symmetrically
 * lock both balances.
 *
 * ~50,000 CU, no ZK verification.
 *
 * CRITICAL: The local hash verification BEFORE submitting is the client-side
 * defense against a malicious initiator who commits a different amount than agreed.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { verifyCommitment } from "../crypto/commitment";
import { findLedgerPDA, findConfigPDA, splitAmount } from "./index";

export interface AcceptParams {
  commit_slot_id: PublicKey;
  transfer_amount: bigint;  // Counterparty confirms the amount (must match initiator's)
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
  if (now > expiryTs + 5) { // 5-second tolerance
    throw new Error(`Commit has expired (expiry=${expiryTs}, now=${now})`);
  }

  // ── CRITICAL: Local commitment hash verification ───────────────────
  const { lo: transfer_lo, hi: transfer_hi } = splitAmount(params.transfer_amount);

  const isValid = await verifyCommitment(
    new Uint8Array(slot.commitmentHash),
    {
      nonce: BigInt((slot.nonce as anchor.BN).toString()),
      transfer_amount_lo: transfer_lo,
      transfer_amount_hi: transfer_hi,
      asset_a_mint: slot.assetAMint.toBytes(),
      asset_b_mint: slot.assetBMint.toBytes(),
      counterparty: wallet.publicKey.toBytes(),
      expiry_timestamp: expiryTs,
    }
  );

  if (!isValid) {
    throw new Error(
      "Commitment hash verification failed: the on-chain commitment does not match the agreed amount. " +
      "Please confirm the exact amount with the initiator via off-chain channel."
    );
  }

  // ── Derive account addresses ───────────────────────────────────────
  const [ledgerA] = findLedgerPDA(slot.initiator, slot.assetAMint, program.programId);
  const [ledgerB] = findLedgerPDA(wallet.publicKey, slot.assetBMint, program.programId);
  const [configPda] = findConfigPDA(program.programId);

  // ── Submit accept_commit transaction ───────────────────────────────
  const sig = await program.methods
    .acceptCommit()
    .accounts({
      s: wallet.publicKey,
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: params.commit_slot_id,
      config: configPda,
    })
    .rpc({ commitment: "confirmed" });

  return { commit_slot_id: params.commit_slot_id, tx_signature: sig };
}
