/**
 * useSchemeB — React Hook for Scheme B Settlement Flow (Vault Model)
 *
 * Manages the full three-step state machine:
 * IDLE → INITIATING → WAITING_ACCEPT → BOTH_LOCKED → GENERATING_PROOF → SUBMITTING_EXECUTE → SETTLED
 *
 * Step 3 generates REAL ZK proofs in the browser via snarkjs WASM.
 * Vault model: settlement only updates encrypted balances (no SPL transfers).
 * Users must deposit tokens into vaults before settlement, withdraw after.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { computeCommitment, verifyCommitment } from "@nexum/sdk";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  findTreasuryVaultPDA,
  splitAmount,
} from "@nexum/sdk";
import { initiateCommit } from "@nexum/sdk";
import { acceptCommit } from "@nexum/sdk";
import { initializeVault } from "@nexum/sdk";
import { deposit } from "@nexum/sdk";
import { withdraw } from "@nexum/sdk";
import { cancelInitiate as sdkCancelInitiate, cancelMutual as sdkCancelMutual } from "@nexum/sdk";
import {
  generateKeypair,
  derivePublicKey,
  elgamalEncrypt,
  serializeCiphertext,
  deserializeCiphertext,
  elgamalDecryptU32,
  sendAndConfirmPolling,
  unpackRegulatorPubkey,
} from "@nexum/sdk";

// ── Browser-compatible ZK proof helpers ──────────────────────────────

const BN254_P = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

function fieldToBytes32(fieldStr: string): number[] {
  const cleaned = fieldStr.replace(/"/g, "").trim();
  let value = BigInt(cleaned);
  if (value < 0n) value = value + BN254_P;
  const bytes: number[] = [];
  let v = value;
  for (let i = 0; i < 32; i++) {
    bytes.unshift(Number(v & 0xFFn));
    v >>= 8n;
  }
  return bytes;
}

function serializeProofBrowser(
  pi_a: string[], pi_b: string[][], pi_c: string[]
): number[] {
  const a_x = fieldToBytes32(pi_a[0]);
  const a_y = fieldToBytes32(pi_a[1]);
  const b_x_c0 = fieldToBytes32(pi_b[0][0]);
  const b_x_c1 = fieldToBytes32(pi_b[0][1]);
  const b_y_c0 = fieldToBytes32(pi_b[1][0]);
  const b_y_c1 = fieldToBytes32(pi_b[1][1]);
  const c_x = fieldToBytes32(pi_c[0]);
  const c_y = fieldToBytes32(pi_c[1]);
  return [...a_x, ...a_y, ...b_x_c1, ...b_x_c0, ...b_y_c1, ...b_y_c0, ...c_x, ...c_y];
}

function toBits64(val: bigint | number): string[] {
  const v = BigInt(val);
  return Array.from({ length: 64 }, (_, i) => String(Number((v >> BigInt(i)) & 1n)));
}

/** Convert a bigint randomness to a 31-byte array (little-endian) for on-chain use. */
function randomnessToBytes(r: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 31; i++) {
    bytes.push(Number(r & 0xFFn));
    r >>= 8n;
  }
  return bytes;
}

async function browserGenerateProof(inputs: {
  old_balance_lo: number; old_balance_hi: number;
  new_balance_lo: number; new_balance_hi: number;
  swap_amount_lo: number; swap_amount_hi: number;
  transfer_lo: number; transfer_hi: number;
  transfer_b_lo: number; transfer_b_hi: number;
  nonce: bigint;
  asset_a_mint: Uint8Array;
  asset_b_mint: Uint8Array;
  counterparty: Uint8Array;
  expiry: number;
}, wasmUrl: string, zkeyUrl: string): Promise<{ proofBytes: number[]; publicSignals: string[] }> {
  const snarkjs = await import("snarkjs");

  // Build 128-byte commitment hash preimage (v3.1 two-way swap layout)
  const preimage = new Uint8Array(128);
  const dv = new DataView(preimage.buffer);
  dv.setBigUint64(0, inputs.nonce, true);           // nonce LE
  dv.setUint32(8, inputs.transfer_lo, true);        // transfer_a_lo LE
  dv.setUint32(12, inputs.transfer_hi, true);       // transfer_a_hi LE
  dv.setUint32(16, inputs.transfer_b_lo, true);     // transfer_b_lo LE
  dv.setUint32(20, inputs.transfer_b_hi, true);     // transfer_b_hi LE
  preimage.set(inputs.asset_a_mint, 24);
  preimage.set(inputs.asset_b_mint, 56);
  preimage.set(inputs.counterparty, 88);
  dv.setInt32(120, inputs.expiry & 0xFFFFFFFF, true);
  dv.setInt32(124, Math.floor(inputs.expiry / 0x100000000), true);

  const hashBuf = await crypto.subtle.digest("SHA-256", preimage);
  const hash = new Uint8Array(hashBuf);
  const hashHi = BigInt("0x" + Array.from(hash.subarray(0, 16)).map(b => b.toString(16).padStart(2, "0")).join(""));
  const hashLo = BigInt("0x" + Array.from(hash.subarray(16, 32)).map(b => b.toString(16).padStart(2, "0")).join(""));

  const circuitInputs = {
    old_balance_lo: String(inputs.old_balance_lo),
    old_balance_hi: String(inputs.old_balance_hi),
    new_balance_lo: String(inputs.new_balance_lo),
    new_balance_hi: String(inputs.new_balance_hi),
    swap_amount_lo: String(inputs.swap_amount_lo),
    swap_amount_hi: String(inputs.swap_amount_hi),
    transfer_lo: String(inputs.transfer_lo),
    transfer_hi: String(inputs.transfer_hi),
    transfer_b_lo: String(inputs.transfer_b_lo),
    transfer_b_hi: String(inputs.transfer_b_hi),
    nonce_bits: toBits64(inputs.nonce),
    asset_a_mint_bytes: Array.from(inputs.asset_a_mint).map(String),
    asset_b_mint_bytes: Array.from(inputs.asset_b_mint).map(String),
    counterparty_bytes: Array.from(inputs.counterparty).map(String),
    expiry_bits: toBits64(inputs.expiry),
    commitment_hash_lo: hashLo.toString(),
    commitment_hash_hi: hashHi.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(circuitInputs, wasmUrl, zkeyUrl);
  const proofBytes = serializeProofBrowser(proof.pi_a, proof.pi_b, proof.pi_c);
  return { proofBytes, publicSignals: publicSignals.map((s: any) => String(s)) };
}

// ── Withdraw proof generation ─────────────────────────────────────────

interface WithdrawProofResult {
  proofBytes: number[];
  newCtLo: number[];
  newCtHi: number[];
  newRLo: number[];
  newRHi: number[];
}

/**
 * Generate a ZK proof for balance sufficiency during withdrawal.
 *
 * Flow:
 * 1. Fetch UserLedger from chain → get ciphertext + randomness
 * 2. Decrypt balance via ElGamal BSGS (private key from sessionStorage)
 * 3. Compute new balance = old_balance - amount
 * 4. Generate ZK proof that old_balance = new_balance + amount
 * 5. Encrypt new balance with fresh randomness
 *
 * The circuit hashes the full 128-byte ciphertexts inside the circuit (SHA-256),
 * matching the on-chain contract which computes SHA256(balance_ct_lo/hi).
 */
async function browserGenerateWithdrawProof(
  program: anchor.Program,
  owner: PublicKey,
  mint: PublicKey,
  amount: bigint,
): Promise<WithdrawProofResult> {
  const WASM_URL = "/circuits/withdraw_balance_check.wasm";
  const ZKEY_URL = "/circuits/withdraw_balance_check_final.zkey";

  // ── Step 1: Fetch ledger from chain ───────────────────────────────
  const [ledgerPda] = findLedgerPDA(owner, mint, program.programId);
  const ledgerInfo = await program.provider.connection.getAccountInfo(ledgerPda);
  if (!ledgerInfo) throw new Error("Ledger not found — deposit first");

  // Parse raw account data (skip 8-byte Anchor discriminator)
  const data = ledgerInfo.data;
  const CT_LO_OFFSET = 72;   // 8 (disc) + 32 (owner) + 32 (mint)
  const CT_HI_OFFSET = 200;  // CT_LO_OFFSET + 128
  const R_LO_OFFSET = 970;   // after regulator_ct_hi (see user_ledger.rs layout)
  const R_HI_OFFSET = 1001;  // R_LO_OFFSET + 31

  const ctLoBytes = data.slice(CT_LO_OFFSET, CT_LO_OFFSET + 128);
  const ctHiBytes = data.slice(CT_HI_OFFSET, CT_HI_OFFSET + 128);
  const rLoBytes = data.slice(R_LO_OFFSET, R_LO_OFFSET + 31);
  const rHiBytes = data.slice(R_HI_OFFSET, R_HI_OFFSET + 31);

  // ── Step 2: Decrypt balance via ElGamal ───────────────────────────
  const keysRaw = sessionStorage.getItem('nexum_elgamal_keys');
  if (!keysRaw) throw new Error("No ElGamal keys in session — settle first to generate keys");
  const keys = JSON.parse(keysRaw);
  const privateKey = BigInt(keys.keyA);

  const ctLo = deserializeCiphertext(new Uint8Array(ctLoBytes));
  const ctHi = deserializeCiphertext(new Uint8Array(ctHiBytes));
  const oldBalanceLo = elgamalDecryptU32(ctLo, privateKey);
  const oldBalanceHi = elgamalDecryptU32(ctHi, privateKey);

  // ── Step 3: Compute new balance ───────────────────────────────────
  const oldBalance = BigInt(oldBalanceLo) + (BigInt(oldBalanceHi) << 32n);
  if (oldBalance < amount) throw new Error(`Insufficient balance: have ${oldBalance}, want ${amount}`);
  const newBalance = oldBalance - amount;
  const newBalanceLo = Number(newBalance & 0xFFFFFFFFn);
  const newBalanceHi = Number(newBalance >> 32n);
  const amountLo = Number(amount & 0xFFFFFFFFn);
  const amountHi = Number(amount >> 32n);

  // ── Step 4: Compute SHA-256 of old ciphertexts (for public inputs) ─
  const hashLoBuf = await crypto.subtle.digest("SHA-256", ctLoBytes);
  const hashHiBuf = await crypto.subtle.digest("SHA-256", ctHiBytes);
  const hashLoArr = new Uint8Array(hashLoBuf);
  const hashHiArr = new Uint8Array(hashHiBuf);
  // Upper 128 bits = first 16 bytes of SHA-256 (matches contract: u128::from_be_bytes(hash[0..16]))
  const hashLo = BigInt("0x" + Array.from(hashLoArr.subarray(0, 16)).map(b => b.toString(16).padStart(2, "0")).join(""));
  const hashHi = BigInt("0x" + Array.from(hashHiArr.subarray(0, 16)).map(b => b.toString(16).padStart(2, "0")).join(""));

  // ── Step 5: Build circuit inputs ──────────────────────────────────
  // Circuit expects byte values as strings, array indices as "name[i]"
  const circuitInputs: Record<string, string> = {};
  for (let i = 0; i < 128; i++) {
    circuitInputs[`old_ct_lo_bytes[${i}]`] = String(ctLoBytes[i]);
    circuitInputs[`old_ct_hi_bytes[${i}]`] = String(ctHiBytes[i]);
  }
  circuitInputs["old_balance_lo"] = String(oldBalanceLo);
  circuitInputs["old_balance_hi"] = String(oldBalanceHi);
  circuitInputs["new_balance_lo"] = String(newBalanceLo);
  circuitInputs["new_balance_hi"] = String(newBalanceHi);
  circuitInputs["amount_lo"] = String(amountLo);
  circuitInputs["amount_hi"] = String(amountHi);
  circuitInputs["old_ct_hash_lo"] = hashLo.toString();
  circuitInputs["old_ct_hash_hi"] = hashHi.toString();

  // ── Step 6: Generate ZK proof ─────────────────────────────────────
  const snarkjs = await import("snarkjs");
  const { proof } = await snarkjs.groth16.fullProve(circuitInputs, WASM_URL, ZKEY_URL);
  const proofBytes = serializeProofBrowser(proof.pi_a, proof.pi_b, proof.pi_c);

  // ── Step 7: Encrypt new balance with fresh randomness ─────────────
  // Derive the SAME public key from the stored private key (must match original encryption)
  const pubKey = derivePublicKey(privateKey);
  const { ciphertext: newCtLoObj, randomness: newRLo } = elgamalEncrypt(BigInt(newBalanceLo), pubKey);
  const { ciphertext: newCtHiObj, randomness: newRHi } = elgamalEncrypt(BigInt(newBalanceHi), pubKey);

  return {
    proofBytes,
    newCtLo: Array.from(serializeCiphertext(newCtLoObj)),
    newCtHi: Array.from(serializeCiphertext(newCtHiObj)),
    newRLo: randomnessToBytes(newRLo),
    newRHi: randomnessToBytes(newRHi),
  };
}

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

export interface SettlementTxs {
  txInitiate: string;
  txCreateProof: string;
  txsWriteProof: string[];
  txExecute: string;
  settlementRecord: string;
}

export interface SchemeBState {
  initiatorState: InitiatorState;
  countdown: number;
  commitSlotId: string;
  commitmentHash: string;
  nonce: string;
  logs: string[];
  counterpartyState: CounterpartyState;
  hashValid: boolean | null;
  lastTxHash: string;
  settlementTxs: SettlementTxs | null;
  initiate: (counterparty: string, assetBMint: string, amountA: bigint, amountB: bigint, assetAMint?: string) => Promise<void>;
  verifyAndAccept: (amountA: bigint, amountB: bigint) => Promise<void>;
  executeSettlement: () => Promise<void>;
  cancelInitiate: () => Promise<void>;
  cancelMutual: () => Promise<void>;
  forceCancel: (mintA?: string) => Promise<void>;
  ensureVault: (mint: string) => Promise<string>;
  depositToVault: (mint: string, amount: bigint) => Promise<string>;
  withdrawFromVault: (mint: string, amount: bigint) => Promise<string>;
  error: string | null;
}

const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");

export function useSchemeB(
  program: anchor.Program | null,
  wallet: anchor.Wallet | null
): SchemeBState {
  const [initiatorState, setInitiatorState] = useState<InitiatorState>("IDLE");
  const [counterpartyState, setCounterpartyState] = useState<CounterpartyState>("IDLE");
  const [countdown, setCountdown] = useState(60);
  const [commitSlotId, setCommitSlotId] = useState("");
  const [commitmentHash, setCommitmentHash] = useState("");
  const [nonce, setNonce] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [hashValid, setHashValid] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState("");
  const initiateTxRef = useRef<string>("");
  const [settlementTxs, setSettlementTxs] = useState<SettlementTxs | null>(null);

  const pendingParams = useRef<{
    ledgerA: PublicKey;
    commitSlotId: PublicKey;
    counterparty: PublicKey;
    assetAMint: PublicKey;
    assetBMint: PublicKey;
    amountA: bigint;
    amountB: bigint;
    nonce: bigint;
    expiry: number;
  } | null>(null);

  const executeSettlementRef = useRef<(() => Promise<void>) | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const log = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-80), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

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
    amountA: bigint,
    amountB: bigint,
    assetAMint?: string,
  ) => {
    if (!program || !wallet) return;
    setError(null);
    setInitiatorState("GENERATING_HASH");
    log(`Program ID: ${program.programId.toBase58()}`);
    log(`Wallet: ${wallet.publicKey.toBase58()}`);
    log("Computing commitment hash (two-way swap)...");

    try {
      const cpPubkey = new PublicKey(counterparty);
      const mintBPubkey = new PublicKey(assetBMint);
      const mintAPubkey = assetAMint
        ? new PublicKey(assetAMint)
        : new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

      const [ledgerA] = findLedgerPDA(wallet.publicKey, mintAPubkey, program.programId);
      const ledgerInfo = await program.provider.connection.getAccountInfo(ledgerA);
      if (!ledgerInfo) {
        log("Creating Ledger A (first time for this mint)...");
        const [configPda] = findConfigPDA(program.programId);
        const ledgerTx = await program.methods
          .createUserLedger()
          .accounts({
            owner: wallet.publicKey,
            ledger: ledgerA,
            mint: mintAPubkey,
            config: configPda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        await sendAndConfirmPolling(program.provider.connection, wallet, ledgerTx);
        log("✓ Ledger A created");
      }

      setInitiatorState("SUBMITTING_INITIATE");
      log(`Submitting initiate_commit (A→B: ${amountA}, B→A: ${amountB})...`);

      let result;
      try {
        result = await initiateCommit(program, wallet, {
          counterparty: cpPubkey,
          asset_a_mint: mintAPubkey,
          asset_b_mint: mintBPubkey,
          transfer_amount_a: amountA,
          transfer_amount_b: amountB,
          expiry_seconds: 50,
        });
      } catch (err: any) {
        if (err.message?.includes("already been processed")) {
          log("Transaction submitted (confirming on-chain)...");
          await new Promise(r => setTimeout(r, 2000));
          const [ledgerA] = findLedgerPDA(wallet.publicKey, mintAPubkey, program.programId);
          const ledgerAccountInfo = await program.provider.connection.getAccountInfo(ledgerA);
          const rawNonce = ledgerAccountInfo!.data.readBigUInt64LE(730);
          const [csPda] = findCommitSlotPDA(ledgerA, rawNonce, program.programId);

          let txHash = "pending";
          try {
            const sigs = await program.provider.connection.getSignaturesForAddress(csPda, { limit: 1 });
            if (sigs && sigs.length > 0) txHash = sigs[0].signature;
          } catch { /* ignore */ }

          log(`✓ Initiate committed — TX: ${txHash}`);
          setLastTxHash(txHash);
          initiateTxRef.current = txHash;
          setCommitSlotId(csPda.toBase58());
          setNonce(rawNonce.toString());
          pendingParams.current = {
            ledgerA,
            commitSlotId: csPda,
            counterparty: cpPubkey,
            assetAMint: mintAPubkey,
            assetBMint: mintBPubkey,
            amountA,
            amountB,
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
              log("Initiate window expired.");
            }
          }, 1000);
          const pollInterval = setInterval(async () => {
            try {
              const slotInfo = await (program.account as any).commitSlot.fetch(csPda);
              const slotStatus = (slotInfo as any).status as any;
              if (slotStatus?.bothLocked !== undefined) {
                clearInterval(pollInterval);
                clearInterval(countdownRef.current);
                setInitiatorState("BOTH_LOCKED");
                try {
                  const sigs = await program.provider.connection.getSignaturesForAddress(csPda, { limit: 1 });
                  const acceptTx = sigs && sigs.length > 0 ? sigs[0].signature : "";
                  log(`✓ Dual-lock confirmed — Accept TX: ${acceptTx}`);
                  if (acceptTx) setLastTxHash(acceptTx);
                } catch {
                  log("✓ Dual-lock confirmed — both ledgers secured.");
                }
                // Auto-execute: Party A must sign the A→B transfer
                log("Auto-triggering settlement execution...");
                setTimeout(() => executeSettlementRef.current?.(), 1000);
              }
            } catch { /* retry */ }
          }, 3000);
          setTimeout(() => clearInterval(pollInterval), 70000);
          return;
        }
        throw err;
      }

      const hexHash = Array.from(result.commitment_hash).map(b => b.toString(16).padStart(2, "0")).join("");
      log(`✓ Initiate committed — TX: ${result.tx_signature}`);
      setLastTxHash(result.tx_signature);
      setCommitmentHash(hexHash);
      setCommitSlotId(result.commit_slot_id.toBase58());
      setNonce(result.nonce.toString());
      pendingParams.current = {
        ledgerA: result.ledger_a,
        commitSlotId: result.commit_slot_id,
        counterparty: cpPubkey,
        assetAMint: mintAPubkey,
        assetBMint: mintBPubkey,
        amountA,
        amountB,
        nonce: result.nonce,
        expiry: result.expiry,
      };
      setInitiatorState("WAITING_ACCEPT");
      setCountdown(50);
      log("Waiting for counterparty to accept (55s countdown)...");

      let remaining = 55;
      countdownRef.current = setInterval(() => {
        remaining--;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownRef.current);
          setInitiatorState("TIMEOUT_EXPIRED");
          log("Initiate window expired.");
        }
      }, 1000);

      const slotPda = result.commit_slot_id;
      const pollInterval = setInterval(async () => {
        try {
          const slotInfo = await (program.account as any).commitSlot.fetch(slotPda);
          const slotStatus = (slotInfo as any).status as any;
          if (slotStatus?.bothLocked !== undefined) {
            clearInterval(pollInterval);
            clearInterval(countdownRef.current);
            setInitiatorState("BOTH_LOCKED");
            log("Counterparty accepted! Both ledgers locked.");
            // Auto-execute: Party A must sign the A→B transfer
            log("Auto-triggering settlement execution...");
            setTimeout(() => executeSettlementRef.current?.(), 1000);
          }
        } catch { /* retry */ }
      }, 3000);
      setTimeout(() => clearInterval(pollInterval), 70000);
    } catch (err: any) {
      setError(err.message);
      setInitiatorState("ERROR");
      log(`Error: ${err.message}`);
    }
  }, [program, wallet, log]);

  // ── Verify & Accept action (counterparty) ─────────────────────────
  const verifyAndAccept = useCallback(async (amountA: bigint, amountB: bigint) => {
    if (!program || !wallet || !pendingParams.current) return;
    setError(null);
    setCounterpartyState("VERIFYING_HASH");
    log("Verifying commitment hash locally (both amounts)...");

    try {
      const p = pendingParams.current;
      const { lo: a_lo, hi: a_hi } = splitAmount(amountA);
      const { lo: b_lo, hi: b_hi } = splitAmount(amountB);

      const valid = await verifyCommitment(
        hexToBytes(commitmentHash),
        {
          nonce: p.nonce,
          transfer_a_lo: a_lo,
          transfer_a_hi: a_hi,
          transfer_b_lo: b_lo,
          transfer_b_hi: b_hi,
          asset_a_mint: p.assetAMint.toBytes(),
          asset_b_mint: p.assetBMint.toBytes(),
          counterparty: p.counterparty.toBytes(),
          expiry_timestamp: p.expiry,
        }
      );

      setHashValid(valid);

      if (!valid) {
        log("Hash MISMATCH — the committed amounts differ from agreed.");
        return;
      }

      log("Hash verified. Submitting accept_commit...");
      setCounterpartyState("SUBMITTING_ACCEPT");

      await acceptCommit(program, wallet, {
        commit_slot_id: p.commitSlotId,
        transfer_amount_a: amountA,
        transfer_amount_b: amountB,
      });

      clearInterval(countdownRef.current);
      setInitiatorState("BOTH_LOCKED");
      log("Both locked. Ready for ZK proof execution (encrypted balance update).");
    } catch (err: any) {
      setError(err.message);
      setCounterpartyState("ERROR");
      log(`Error: ${err.message}`);
    }
  }, [program, wallet, commitmentHash, log]);

  // ── Execute Settlement (Step 3 — ZK proofs + SPL token transfers) ──
  const executeSettlement = useCallback(async () => {
    if (!program || !wallet || !pendingParams.current) return;
    setError(null);
    setInitiatorState("GENERATING_PROOF");

    try {
      const p = pendingParams.current;
      const { lo: transfer_lo, hi: transfer_hi } = splitAmount(p.amountA);
      const tLo = Number(transfer_lo);
      const tHi = Number(transfer_hi);

      // ── Phase 1: ZK Proof Generation ──────────────────────────────
      log("Loading snarkjs WASM prover (private circuit, ~95K constraints)...");
      const WASM_URL = "/circuits/balance_transition_private.wasm";
      const ZKEY_URL = "/circuits/balance_transition_private_final.zkey";

      const slotData = await (program.account as any).commitSlot.fetch(p.commitSlotId);
      const slotNonce = BigInt((slotData.nonce as anchor.BN).toString());
      const slotExpiry = (slotData.expiryInit as anchor.BN).toNumber();
      const slotMintA = (slotData.assetAMint as any).toBytes ? (slotData.assetAMint as any).toBytes() : new Uint8Array(slotData.assetAMint as Uint8Array);
      const slotMintB = (slotData.assetBMint as any).toBytes ? (slotData.assetBMint as any).toBytes() : new Uint8Array(slotData.assetBMint as Uint8Array);
      const slotCounterparty = (slotData.counterparty as any).toBytes ? (slotData.counterparty as any).toBytes() : new Uint8Array(slotData.counterparty as Uint8Array);

      const commitmentPreimage = {
        nonce: slotNonce,
        asset_a_mint: new Uint8Array(slotMintA),
        asset_b_mint: new Uint8Array(slotMintB),
        counterparty: new Uint8Array(slotCounterparty),
        expiry: slotExpiry,
      };

      log("Generating ElGamal encryption keys...");
      // Reuse deposit keypair if available (so withdraw can decrypt later)
      const existingKeysRaw = sessionStorage.getItem('nexum_elgamal_keys');
      let keypairA;
      if (existingKeysRaw) {
        try {
          const existingKeys = JSON.parse(existingKeysRaw);
          if (existingKeys.keyA) {
            const sk = BigInt(existingKeys.keyA);
            keypairA = { privateKey: sk, publicKey: derivePublicKey(sk) };
            log("✓ Reusing existing ElGamal keypair A (from deposit)");
          }
        } catch { /* fall through */ }
      }
      if (!keypairA) {
        keypairA = generateKeypair();
        log("✓ New ElGamal keypair A generated");
      }
      const keypairB = generateKeypair();

      // Save private keys to sessionStorage so regulator can decrypt during this session
      const elgamalKeys = {
        keyA: keypairA.privateKey.toString(),
        keyB: keypairB.privateKey.toString(),
        partyA: wallet.publicKey.toBase58(),
        partyB: p.counterparty.toBase58(),
        mintA: p.assetAMint.toBase58(),
        mintB: p.assetBMint.toBase58(),
        savedAt: new Date().toISOString(),
      };
      sessionStorage.setItem('nexum_elgamal_keys', JSON.stringify(elgamalKeys));
      log("✓ ElGamal private keys saved to session storage (cleared when tab closes)");

      const { lo: b_lo, hi: b_hi } = splitAmount(p.amountB);

      log("Generating ZK proof for Party A (private circuit)...");
      const proofA = await browserGenerateProof({
        old_balance_lo: tLo, old_balance_hi: tHi,
        new_balance_lo: 0, new_balance_hi: 0,
        swap_amount_lo: tLo, swap_amount_hi: tHi,
        transfer_lo: tLo, transfer_hi: tHi,
        transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
        ...commitmentPreimage,
      }, WASM_URL, ZKEY_URL);
      log(`✓ Proof A: ${proofA.proofBytes.length} bytes`);

      log("Generating ZK proof for Party B (private circuit)...");
      const proofB = await browserGenerateProof({
        old_balance_lo: Number(b_lo), old_balance_hi: Number(b_hi),
        new_balance_lo: 0, new_balance_hi: 0,
        swap_amount_lo: Number(b_lo), swap_amount_hi: Number(b_hi),
        transfer_lo: tLo, transfer_hi: tHi,
        transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
        ...commitmentPreimage,
      }, WASM_URL, ZKEY_URL);
      log(`✓ Proof B: ${proofB.proofBytes.length} bytes`);

      log("Encrypting balances with ElGamal...");
      const { ciphertext: ct_a_lo, randomness: r_a_lo } = elgamalEncrypt(0n, keypairA.publicKey);
      const { ciphertext: ct_a_hi, randomness: r_a_hi } = elgamalEncrypt(0n, keypairA.publicKey);
      const { ciphertext: audit_a_lo } = elgamalEncrypt(BigInt(tLo), keypairA.publicKey);
      const { ciphertext: audit_a_hi } = elgamalEncrypt(BigInt(tHi), keypairA.publicKey);
      const { ciphertext: ct_b_lo, randomness: r_b_lo } = elgamalEncrypt(BigInt(b_lo), keypairB.publicKey);
      const { ciphertext: ct_b_hi, randomness: r_b_hi } = elgamalEncrypt(BigInt(b_hi), keypairB.publicKey);
      const { ciphertext: audit_b_lo } = elgamalEncrypt(0n, keypairB.publicKey);
      const { ciphertext: audit_b_hi } = elgamalEncrypt(0n, keypairB.publicKey);
      log("✓ 8 ciphertexts generated");

      const chunk0 = proofA.proofBytes;
      const chunk1 = [
        ...Array.from(serializeCiphertext(ct_a_lo)),
        ...Array.from(serializeCiphertext(ct_a_hi)),
        ...Array.from(serializeCiphertext(audit_a_lo)),
        ...Array.from(serializeCiphertext(audit_a_hi)),
      ];
      const chunk2 = proofB.proofBytes;
      const chunk3 = [
        ...Array.from(serializeCiphertext(ct_b_lo)),
        ...Array.from(serializeCiphertext(ct_b_hi)),
        ...Array.from(serializeCiphertext(audit_b_lo)),
        ...Array.from(serializeCiphertext(audit_b_hi)),
      ];

      // ── Regulator ciphertexts (chunks 4-5) ───────────────────────
      let chunk4: number[] | null = null;
      let chunk5: number[] | null = null;
      try {
        const [configPdaForReg] = findConfigPDA(program.programId);
        const configInfo = await program.provider.connection.getAccountInfo(configPdaForReg);
        if (configInfo && configInfo.data.length > 171) {
          const regPubkeyBytes = configInfo.data.slice(107, 171); // 64 bytes at offset 107
          const isZero = regPubkeyBytes.every((b: number) => b === 0);
          if (!isZero) {
            log("Encrypting amounts for regulator...");
            const regPoint = unpackRegulatorPubkey(new Uint8Array(regPubkeyBytes));
            const { ciphertext: reg_ct_a_lo } = elgamalEncrypt(BigInt(tLo), regPoint);
            const { ciphertext: reg_ct_a_hi } = elgamalEncrypt(BigInt(tHi), regPoint);
            const { ciphertext: reg_ct_b_lo } = elgamalEncrypt(BigInt(b_lo), regPoint);
            const { ciphertext: reg_ct_b_hi } = elgamalEncrypt(BigInt(b_hi), regPoint);
            chunk4 = [
              ...Array.from(serializeCiphertext(reg_ct_a_lo)),
              ...Array.from(serializeCiphertext(reg_ct_a_hi)),
            ];
            chunk5 = [
              ...Array.from(serializeCiphertext(reg_ct_b_lo)),
              ...Array.from(serializeCiphertext(reg_ct_b_hi)),
            ];
            log("✓ Regulator ciphertexts generated (chunks 4-5)");
          } else {
            log("No regulator registered — skipping regulator ciphertexts");
          }
        }
      } catch (e: any) {
        log(`Warning: regulator CT generation failed: ${e.message}`);
      }

      // ── Phase 2: On-chain submission ──────────────────────────────
      setInitiatorState("SUBMITTING_EXECUTE");

      const [ledgerA] = findLedgerPDA(slotData.initiator, slotData.assetAMint, program.programId);
      const [ledgerB] = findLedgerPDA(slotData.counterparty, slotData.assetBMint, program.programId);
      const [configPda] = findConfigPDA(program.programId);
      const [proofDataPda] = findProofDataPDA(slotNonce, program.programId);

      log("Creating ProofData account on-chain...");
      let sig3a: string;
      const existingPD = await program.provider.connection.getAccountInfo(proofDataPda);
      if (existingPD) {
        sig3a = "already-exists";
        log("ProofData already exists (from script), reusing...");
      } else {
        const tx1 = await program.methods
          .createProofData({ nonce: new anchor.BN(slotNonce.toString()) })
          .accounts({
            proofData: proofDataPda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        sig3a = await sendAndConfirmPolling(program.provider.connection, wallet, tx1);
      }
      log(`✓ ProofData ready — TX: ${sig3a}`);

      const chunks: number[][] = [chunk0, chunk1, chunk2, chunk3];
      if (chunk4) chunks.push(chunk4);
      if (chunk5) chunks.push(chunk5);
      const chunkSigs: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        log(`Writing proof chunk ${i}/${chunks.length - 1} (${chunks[i].length} bytes)...`);
        const tx = await program.methods
          .writeProofData({
            nonce: new anchor.BN(slotNonce.toString()),
            chunkIndex: i,
            data: Buffer.from(chunks[i]),
          })
          .accounts({
            proofData: proofDataPda,
            commitSlot: p.commitSlotId,
            authority: wallet.publicKey,
          })
          .transaction();
        const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
        chunkSigs.push(sig);
        log(`✓ Chunk ${i}/${chunks.length - 1} written — TX: ${sig}`);
      }

      // Step 3c: Execute settlement (vault model — encrypted balance update only)
      log("Executing settlement (ZK verification + encrypted balance update, 400K CU)...");
      const settlementNonce = BigInt(Date.now());
      const [settlementPda] = findSettlementPDA(p.commitSlotId, settlementNonce, program.programId);

      const tx2 = await program.methods
        .executeSettleB({
          nonce: new anchor.BN(slotNonce.toString()),
          commitmentHashLo: new anchor.BN(proofA.publicSignals[0]),
          commitmentHashHi: new anchor.BN(proofA.publicSignals[1]),
          settlementNonce: new anchor.BN(settlementNonce.toString()),
          newRALo: randomnessToBytes(r_a_lo),
          newRAHi: randomnessToBytes(r_a_hi),
          newRBLo: randomnessToBytes(r_b_lo),
          newRBHi: randomnessToBytes(r_b_hi),
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        ])
        .accounts({
          ledgerA: ledgerA,
          ledgerB: ledgerB,
          commitSlot: p.commitSlotId,
          proofData: proofDataPda,
          settlementRecord: settlementPda,
          config: configPda,
          feePayer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          zkVerifierProgram: ZK_VERIFIER_ID,
        })
        .transaction();
      const sig3c = await sendAndConfirmPolling(program.provider.connection, wallet, tx2);

      log(`✓ SETTLEMENT EXECUTED — TX: ${sig3c}`);
      log(`  Encrypted balances updated. Amounts are private (visible only to key holders).`);
      setLastTxHash(sig3c);
      setSettlementTxs({
        txInitiate: initiateTxRef.current,
        txCreateProof: sig3a,
        txsWriteProof: chunkSigs,
        txExecute: sig3c,
        settlementRecord: settlementPda.toBase58(),
      });
      setInitiatorState("SETTLED");
      log("Settlement complete! Both ledgers returned to Active. Vault balances updated.");

    } catch (err: any) {
      setError(err.message);
      setInitiatorState("ERROR");
      log(`Error: ${err.message}`);
    }
  }, [program, wallet, log]);

  // ── Force cancel ──────────────────────────────────────────────────
  const forceCancel = useCallback(async (mintA?: string) => {
    if (!program || !wallet) return;
    try {
      log("Reading ledger state from chain...");
      const mintAPubkey = new PublicKey(mintA || "DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
      const [ledgerA] = findLedgerPDA(wallet.publicKey, mintAPubkey, program.programId);
      const info = await program.provider.connection.getAccountInfo(ledgerA);
      if (!info) { setError("Ledger not found on chain"); return; }
      const status = info.data[592];
      if (status === 0) { log("Ledger already Active."); setInitiatorState("IDLE"); return; }
      log(`Ledger status: ${status}. Reading pending nonce...`);
      const nonce = info.data.readBigUInt64LE(730);
      try {
        await sdkCancelInitiate(program, wallet, { ledger_a: ledgerA, pending_nonce: BigInt(nonce) });
      } catch (err: any) {
        if (err.message?.includes("already been processed")) {
          log("Transaction submitted, verifying...");
        } else {
          throw err;
        }
      }
      await new Promise(r => setTimeout(r, 2000));
      const info2 = await program.provider.connection.getAccountInfo(ledgerA);
      if (info2 && info2.data[592] === 0) {
        setInitiatorState("IDLE");
        log("Ledger unlocked successfully.");
      } else {
        log("Ledger still locked. May need to wait for window expiry.");
        setError("Ledger still locked after cancel attempt.");
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [program, wallet, log]);

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

  // ── Vault Management ───────────────────────────────────────────────

  const ensureVault = useCallback(async (mintStr: string): Promise<string> => {
    if (!program || !wallet) throw new Error("Wallet not connected");
    const mint = new PublicKey(mintStr);
    const [vaultPda] = findTreasuryVaultPDA(mint, program.programId);
    const existing = await program.provider.connection.getAccountInfo(vaultPda);
    if (existing) {
      log(`Vault already exists: ${vaultPda.toBase58().slice(0, 8)}...`);
      return vaultPda.toBase58();
    }
    log("Initializing shared treasury vault...");
    const result = await initializeVault(program, wallet, { mint });
    log(`✓ Vault created — TX: ${result.tx_signature}`);
    return result.vault.toBase58();
  }, [program, wallet, log]);

  const depositToVault = useCallback(async (mintStr: string, amount: bigint): Promise<string> => {
    if (!program || !wallet) throw new Error("Wallet not connected");
    const mint = new PublicKey(mintStr);
    // Auto-create vault if it doesn't exist
    const [vaultPda] = findTreasuryVaultPDA(mint, program.programId);
    const existing = await program.provider.connection.getAccountInfo(vaultPda);
    if (!existing) {
      log("Creating vault for this mint (first time)...");
      try {
        await initializeVault(program, wallet, { mint });
        log("✓ Vault created");
      } catch (e: any) {
        log(`Vault creation failed: ${e.message}`);
        throw e;
      }
    }
    log(`Depositing ${amount} tokens to vault...`);
    // Generate ElGamal keypair for encrypting the deposit amount
    const depositKeypair = generateKeypair();
    const { ciphertext: depCtLo, randomness: depRLo } = elgamalEncrypt(
      amount & 0xFFFFFFFFn, depositKeypair.publicKey
    );
    const { ciphertext: depCtHi, randomness: depRHi } = elgamalEncrypt(
      amount >> 32n, depositKeypair.publicKey
    );
    const depResult = await deposit(program, wallet, {
      mint,
      amount,
      initialCtLo: Array.from(serializeCiphertext(depCtLo)),
      initialCtHi: Array.from(serializeCiphertext(depCtHi)),
      initialRLo: randomnessToBytes(depRLo),
      initialRHi: randomnessToBytes(depRHi),
    });
    // Save keypair to sessionStorage so withdraw can decrypt later
    const depositKeys = {
      keyA: depositKeypair.privateKey.toString(),
      partyA: wallet.publicKey.toBase58(),
      mintA: mint.toBase58(),
      savedAt: new Date().toISOString(),
    };
    sessionStorage.setItem('nexum_elgamal_keys', JSON.stringify(depositKeys));
    log(`✓ Deposited — TX: ${depResult.tx_signature}`);
    return depResult.tx_signature;
  }, [program, wallet, log]);

  const withdrawFromVault = useCallback(async (mintStr: string, amount: bigint): Promise<string> => {
    if (!program || !wallet) throw new Error("Wallet not connected");
    const mint = new PublicKey(mintStr);
    log(`Generating withdraw ZK proof (decrypting balance + proving sufficiency)...`);
    try {
      const proofResult = await browserGenerateWithdrawProof(program, wallet.publicKey, mint, amount);
      log(`✓ Withdraw proof generated (${proofResult.proofBytes.length} bytes)`);
      log(`Submitting withdraw TX...`);
      const result = await withdraw(program, wallet, {
        mint, amount,
        proof: proofResult.proofBytes,
        newCtLo: proofResult.newCtLo,
        newCtHi: proofResult.newCtHi,
        newRLo: proofResult.newRLo,
        newRHi: proofResult.newRHi,
      });
      log(`✓ Withdrawn — TX: ${result.tx_signature}`);
      return result.tx_signature;
    } catch (e: any) {
      log(`Withdraw failed: ${e.message}`);
      throw e;
    }
  }, [program, wallet, log]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Keep ref in sync for auto-execute from polling callback
  useEffect(() => {
    executeSettlementRef.current = executeSettlement;
  }, [executeSettlement]);

  return {
    initiatorState,
    countdown,
    commitSlotId,
    commitmentHash,
    nonce,
    logs,
    counterpartyState,
    hashValid,
    lastTxHash,
    settlementTxs,
    initiate,
    verifyAndAccept,
    executeSettlement,
    cancelInitiate: cancelInitiateAction,
    cancelMutual: cancelMutualAction,
    forceCancel,
    ensureVault,
    depositToVault,
    withdrawFromVault,
    error,
  };
}
