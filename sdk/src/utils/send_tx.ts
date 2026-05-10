/**
 * sendAndConfirmPolling — Browser-friendly transaction confirmation
 *
 * Sends a signed transaction and confirms via polling getSignatureStatuses,
 * bypassing WebSocket subscriptions which fail in some browser environments.
 */

import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Wallet } from "@coral-xyz/anchor";

export async function sendAndConfirmPolling(
  connection: Connection,
  wallet: Wallet,
  tx: Transaction,
  opts?: { timeout?: number; pollInterval?: number }
): Promise<string> {
  const timeout = opts?.timeout ?? 90_000;
  const pollInterval = opts?.pollInterval ?? 3_000;

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;

  // Sign via wallet
  const signed = await wallet.signTransaction(tx);
  const raw = signed.serialize();

  // Send with skipPreflight to avoid extra RPC round-trip
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: true,
    maxRetries: 3,
  });

  // Poll for confirmation
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    const status = await connection.getSignatureStatuses([sig], {
      searchTransactionHistory: false,
    });

    const s = status.value[0];
    if (s) {
      if (s.err) throw new Error(`Transaction failed: ${JSON.stringify(s.err)}`);
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") {
        return sig;
      }
    }

    // Also check if blockhash expired
    const bh = await connection.getBlockHeight("confirmed");
    if (bh > lastValidBlockHeight + 150) {
      throw new Error("Transaction expired (blockhash too old)");
    }
  }

  // Final check — TX might have landed but status not updated
  const finalStatus = await connection.getSignatureStatuses([sig]);
  if (finalStatus.value[0]?.confirmationStatus) {
    return sig;
  }

  throw new Error(`Transaction not confirmed in ${timeout / 1000}s. Signature: ${sig}`);
}
