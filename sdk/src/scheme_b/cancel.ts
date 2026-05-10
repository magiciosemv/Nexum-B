/**
 * cancelInitiate / cancelMutual — Scheme B Timeout Recovery
 *
 * cancelInitiate: Party A only, after initiate window expires (>60s).
 * cancelMutual: Either party, after execute window expires (>120s after dual-lock).
 *
 * Both close the CommitSlot and refund rent.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findLedgerPDA, findConfigPDA } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

// ── cancelInitiate ───────────────────────────────────────────────────

export interface CancelInitiateParams {
  ledger_a: PublicKey;      // Party A's ledger pubkey
  pending_nonce: bigint;    // From the ledger's pending_nonce field
}

export async function cancelInitiate(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: CancelInitiateParams
): Promise<string> {
  // Derive CommitSlot PDA from ledger_a key + pending_nonce
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeUInt32LE(Number(params.pending_nonce & 0xFFFFFFFFn), 0);
  nonceBuf.writeUInt32LE(Number(params.pending_nonce >> 32n), 4);
  const [commitSlot] = PublicKey.findProgramAddressSync(
    [Buffer.from("cslot"), params.ledger_a.toBuffer(), nonceBuf],
    program.programId
  );

  const [configPda] = findConfigPDA(program.programId);

  const tx = await program.methods
    .cancelInitiate()
    .accounts({
      s: wallet.publicKey,
      ledgerA: params.ledger_a,
      commitSlot: commitSlot,
      config: configPda,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return sig;
}

// ── cancelMutual ─────────────────────────────────────────────────────

export interface CancelMutualParams {
  commit_slot_id: PublicKey;
}

export async function cancelMutual(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: CancelMutualParams
): Promise<string> {
  const slot = await (program.account as any).commitSlot.fetch(params.commit_slot_id);

  const [ledgerA] = findLedgerPDA(slot.initiator, slot.assetAMint, program.programId);
  const [ledgerB] = findLedgerPDA(slot.counterparty, slot.assetBMint, program.programId);
  const [configPda] = findConfigPDA(program.programId);

  const tx = await program.methods
    .cancelMutual()
    .accounts({
      caller: wallet.publicKey,
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: params.commit_slot_id,
      config: configPda,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return sig;
}
