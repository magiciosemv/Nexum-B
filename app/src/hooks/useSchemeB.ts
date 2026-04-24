/**
 * useSchemeB — React Hook for Scheme B Settlement Flow
 *
 * Manages the full three-step state machine:
 * IDLE → INITIATING → WAITING_ACCEPT → BOTH_LOCKED → GENERATING_PROOF → EXECUTING → SETTLED
 *
 * Also handles timeout branches: TIMEOUT_EXPIRED, CANCELLED
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { computeCommitment, verifyCommitment } from "@nexum/sdk";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  splitAmount,
} from "@nexum/sdk";
import { initiateCommit } from "@nexum/sdk";
import { acceptCommit } from "@nexum/sdk";
import { executeSettle } from "@nexum/sdk";
import { cancelInitiate as sdkCancelInitiate, cancelMutual as sdkCancelMutual } from "@nexum/sdk";

// ── State Machine ────────────────────────────────────────────────────

export type InitiatorState =
  | "IDLE"
  | "GENERATING_HASH"
  | "SUBMITTING_INITIATE"
  | "WAITING_ACCEPT"
  | "BOTH_LOCKED"
  | "GENERATING_PROOF"
  | "SUBMITTING_EXECUTE"
  | "SETTLED"
  | "TIMEOUT_EXPIRED"
  | "CANCELLED"
  | "ERROR";

export type CounterpartyState =
  | "IDLE"
  | "INCOMING_REQUEST"
  | "VERIFYING_HASH"
  | "SUBMITTING_ACCEPT"
  | "GENERATING_PROOF"
  | "SUBMITTING_EXECUTE"
  | "SETTLED"
  | "ERROR";

// ── Hook Return Type ─────────────────────────────────────────────────

export interface SchemeBState {
  initiatorState: InitiatorState;
  countdown: number;
  commitSlotId: string;
  commitmentHash: string;
  logs: string[];
  counterpartyState: CounterpartyState;
  hashValid: boolean | null;
  lastTxHash: string;
  initiate: (counterparty: string, assetBMint: string, amount: bigint, assetAMint?: string) => Promise<void>;
  verifyAndAccept: (amount: bigint) => Promise<void>;
  cancelInitiate: () => Promise<void>;
  cancelMutual: () => Promise<void>;
  error: string | null;
}

// ── Hook Implementation ─────────────────────────────────────────────

export function useSchemeB(
  program: anchor.Program | null,
  wallet: anchor.Wallet | null
): SchemeBState {
  const [initiatorState, setInitiatorState] = useState<InitiatorState>("IDLE");
  const [counterpartyState, setCounterpartyState] = useState<CounterpartyState>("IDLE");
  const [countdown, setCountdown] = useState(60);
  const [commitSlotId, setCommitSlotId] = useState("");
  const [commitmentHash, setCommitmentHash] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState("");

  // Store params for execute/cancel steps
  const pendingParams = useRef<{
    ledgerA: PublicKey;
    commitSlotId: PublicKey;
    counterparty: PublicKey;
    assetAMint: PublicKey;
    assetBMint: PublicKey;
    amount: bigint;
    nonce: bigint;
    expiry: number;
  } | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const log = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Browser-safe hex → Uint8Array
  const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };

  // ── Initiate action ───────────────────────────────────────────────
  const initiate = useCallback(async (
    counterparty: string,
    assetBMint: string,
    amount: bigint,
    assetAMint?: string,
  ) => {
    if (!program || !wallet) return;
    setError(null);
    setInitiatorState("GENERATING_HASH");
    log("Computing commitment hash...");

    try {
      const cpPubkey = new PublicKey(counterparty);
      const mintBPubkey = new PublicKey(assetBMint);
      const mintAPubkey = assetAMint
        ? new PublicKey(assetAMint)
        : new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // devnet USDC

      setInitiatorState("SUBMITTING_INITIATE");
      log("Submitting initiate_commit (hash computed inside SDK)...");

      // SDK handles chain time + commitment hash internally.
      // No duplicate hash computation here.
      let result;
      try {
        result = await initiateCommit(program, wallet, {
          counterparty: cpPubkey,
          asset_a_mint: mintAPubkey,
          asset_b_mint: mintBPubkey,
          transfer_amount: amount,
          expiry_seconds: 55, // 55+5=60s = max window, gives counterparty max time to accept
        });
      } catch (err: any) {
        // "already been processed" = tx succeeded but RPC returned duplicate error.
        // Treat as success — the ledger is now locked.
        if (err.message?.includes("already been processed")) {
          log("Transaction submitted (confirming on-chain)...");
          // Wait briefly then check ledger state to confirm
          await new Promise(r => setTimeout(r, 2000));
          const [ledgerA] = findLedgerPDA(wallet.publicKey, mintAPubkey, program.programId);
          const ledgerInfo = await program.account.userLedger.fetch(ledgerA);
          const status = (ledgerInfo as any).status as any;
          if (status?.pendingInitiator !== undefined) {
            // Read pending_nonce from raw on-chain data (offset 730 in UserLedger account)
            const ledgerAccountInfo = await program.provider.connection.getAccountInfo(ledgerA);
            const rawNonce = ledgerAccountInfo!.data.readBigUInt64LE(730);
            const [csPda] = findCommitSlotPDA(ledgerA, rawNonce, program.programId);

            // Fetch TX hash from CommitSlot's on-chain signature history
            let txHash = "pending";
            try {
              const sigs = await program.provider.connection.getSignaturesForAddress(csPda, { limit: 1 });
              if (sigs && sigs.length > 0) txHash = sigs[0].signature;
            } catch { /* ignore */ }

            log(`✓ Initiate committed — TX: ${txHash}`);
            setLastTxHash(txHash);
            setCommitSlotId(csPda.toBase58());
            pendingParams.current = {
              ledgerA,
              commitSlotId: csPda,
              counterparty: cpPubkey,
              assetAMint: mintAPubkey,
              assetBMint: mintBPubkey,
              amount,
              nonce: rawNonce,
              expiry: 0,
            };
            setInitiatorState("WAITING_ACCEPT");
            setCountdown(55);
            let remaining = 55;
            countdownRef.current = setInterval(() => {
              remaining--;
              setCountdown(remaining);
              if (remaining <= 0) {
                clearInterval(countdownRef.current);
                setInitiatorState("TIMEOUT_EXPIRED");
                log("Initiate window expired. Call cancelInitiate to unlock.");
              }
            }, 1000);
            // Poll CommitSlot for counterparty accept
            const pollInterval = setInterval(async () => {
              try {
                const slotInfo = await program.account.commitSlot.fetch(csPda);
                const slotStatus = (slotInfo as any).status as any;
                if (slotStatus?.bothLocked !== undefined) {
                  clearInterval(pollInterval);
                  clearInterval(countdownRef.current);
                  setInitiatorState("BOTH_LOCKED");
                  // Fetch accept TX from CommitSlot signature history
                  try {
                    const sigs = await program.provider.connection.getSignaturesForAddress(csPda, { limit: 1 });
                    const acceptTx = sigs && sigs.length > 0 ? sigs[0].signature : "";
                    log(`✓ Dual-lock confirmed — Accept TX: ${acceptTx}`);
                    if (acceptTx) setLastTxHash(acceptTx);
                  } catch {
                    log("✓ Dual-lock confirmed — both ledgers secured.");
                  }
                }
              } catch { /* retry */ }
            }, 3000);
            setTimeout(() => clearInterval(pollInterval), 70000);
            return;
          }
        }
        throw err; // Re-throw if not "already processed"
      }

      const hexHash = Array.from(result.commitment_hash).map(b => b.toString(16).padStart(2, "0")).join("");
      log(`✓ Initiate committed — TX: ${result.tx_signature}`);
      setLastTxHash(result.tx_signature);
      setCommitmentHash(hexHash);

      setCommitSlotId(result.commit_slot_id.toBase58());
      pendingParams.current = {
        ledgerA: result.ledger_a,
        commitSlotId: result.commit_slot_id,
        counterparty: cpPubkey,
        assetAMint: mintAPubkey,
        assetBMint: mintBPubkey,
        amount,
        nonce: result.nonce,
        expiry: result.expiry,
      };

      setInitiatorState("WAITING_ACCEPT");
      setCountdown(55);
      log("Waiting for counterparty to accept (55s countdown)...");

      let remaining = 55;
      countdownRef.current = setInterval(() => {
        remaining--;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownRef.current);
          setInitiatorState("TIMEOUT_EXPIRED");
          log("Initiate window expired. Call cancelInitiate to unlock.");
        }
      }, 1000);

      // Poll CommitSlot status to detect counterparty accept
      const slotPda = result.commit_slot_id;
      const pollInterval = setInterval(async () => {
        try {
          const slotInfo = await program.account.commitSlot.fetch(slotPda);
          const slotStatus = (slotInfo as any).status as any;
          if (slotStatus?.bothLocked !== undefined) {
            clearInterval(pollInterval);
            clearInterval(countdownRef.current);
            setInitiatorState("BOTH_LOCKED");
            log("Counterparty accepted! Both ledgers locked (BothLocked).");
          }
        } catch { /* ignore fetch errors, will retry */ }
      }, 3000);
      // Auto-stop polling after 70 seconds
      setTimeout(() => clearInterval(pollInterval), 70000);
    } catch (err: any) {
      setError(err.message);
      setInitiatorState("ERROR");
      log(`Error: ${err.message}`);
    }
  }, [program, wallet, log]);

  // ── Verify & Accept action (counterparty) ─────────────────────────
  const verifyAndAccept = useCallback(async (amount: bigint) => {
    if (!program || !wallet || !pendingParams.current) return;
    setError(null);
    setCounterpartyState("VERIFYING_HASH");
    log("Verifying commitment hash locally...");

    try {
      const p = pendingParams.current;
      const { lo, hi } = splitAmount(amount);

      const valid = await verifyCommitment(
        hexToBytes(commitmentHash),
        {
          nonce: p.nonce,
          transfer_amount_lo: lo,
          transfer_amount_hi: hi,
          asset_a_mint: p.assetAMint.toBytes(),
          asset_b_mint: p.assetBMint.toBytes(),
          counterparty: p.counterparty.toBytes(),
          expiry_timestamp: p.expiry,
        }
      );

      setHashValid(valid);

      if (!valid) {
        log("Hash MISMATCH — the committed amount differs from agreed. Do NOT accept.");
        return;
      }

      log("Hash verified. Submitting accept_commit...");
      setCounterpartyState("SUBMITTING_ACCEPT");

      await acceptCommit(program, wallet, {
        commit_slot_id: p.commitSlotId,
        transfer_amount: amount,
      });

      clearInterval(countdownRef.current);
      setInitiatorState("BOTH_LOCKED");
      setCounterpartyState("GENERATING_PROOF");
      log("Both locked. Generating ZK proof...");
    } catch (err: any) {
      setError(err.message);
      setCounterpartyState("ERROR");
      log(`Error: ${err.message}`);
    }
  }, [program, wallet, commitmentHash, log]);

  // ── Cancel actions ────────────────────────────────────────────────
  const cancelInitiateAction = useCallback(async () => {
    if (!program || !wallet || !pendingParams.current) return;
    try {
      clearInterval(countdownRef.current);
      await sdkCancelInitiate(program, wallet, {
        ledger_a: pendingParams.current.ledgerA,
        pending_nonce: pendingParams.current.nonce,
      });
      setInitiatorState("CANCELLED");
      log("Initiate cancelled. Balance unlocked.");
    } catch (err: any) {
      setError(err.message);
    }
  }, [program, wallet, log]);

  const cancelMutualAction = useCallback(async () => {
    if (!program || !wallet || !pendingParams.current) return;
    try {
      await sdkCancelMutual(program, wallet, {
        commit_slot_id: pendingParams.current.commitSlotId,
      });
      setInitiatorState("CANCELLED");
      log("Mutual cancel. Both balances unlocked.");
    } catch (err: any) {
      setError(err.message);
    }
  }, [program, wallet, log]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return {
    initiatorState,
    countdown,
    commitSlotId,
    commitmentHash,
    logs,
    counterpartyState,
    hashValid,
    lastTxHash,
    initiate,
    verifyAndAccept,
    cancelInitiate: cancelInitiateAction,
    cancelMutual: cancelMutualAction,
    error,
  };
}
