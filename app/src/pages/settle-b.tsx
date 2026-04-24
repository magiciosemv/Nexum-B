/**
 * settle-b.tsx — Scheme B OTC Settlement Terminal
 *
 * Cyberpunk terminal design from example.html's TraderTerminal,
 * wired to real useSchemeB hook for actual on-chain interactions.
 *
 * Left panel: 3-step progress tracker + trade form + commitment/lock monitor
 * Right panel: real-time terminal log with colored output
 */

import React, { useEffect, useRef, useState } from "react";
import { useSchemeB } from "../hooks/useSchemeB";
import { useAnchorContext } from "../context/WalletProvider";
import type { InitiatorState } from "../hooks/useSchemeB";
import {
  ArrowRightLeft,
  Terminal,
  Loader2,
  Lock,
  Cpu,
  Database,
  Hash,
  CheckSquare,
  Link,
  Clock,
  Wallet,
} from "lucide-react";

// ── State → step mapping for the 3-step progress bar ─────────────────

const STEP_STATES: Record<string, { step: number; label: string }> = {
  IDLE: { step: 0, label: "Ready" },
  GENERATING_HASH: { step: 1, label: "Hashing..." },
  SUBMITTING_INITIATE: { step: 1, label: "Submitting..." },
  WAITING_ACCEPT: { step: 2, label: "Awaiting Accept" },
  BOTH_LOCKED: { step: 2, label: "Dual-Locked" },
  GENERATING_PROOF: { step: 3, label: "Proving..." },
  SUBMITTING_EXECUTE: { step: 3, label: "Executing..." },
  SETTLED: { step: 3, label: "Settled" },
  TIMEOUT_EXPIRED: { step: 0, label: "Timed Out" },
  CANCELLED: { step: 0, label: "Cancelled" },
  ERROR: { step: 0, label: "Error" },
};

// ── Lock status derived from initiator state ─────────────────────────

function getLockStatus(state: InitiatorState): "none" | "partyA" | "both" {
  if (state === "SETTLED" || state === "CANCELLED") return "none";
  if (
    state === "GENERATING_HASH" ||
    state === "SUBMITTING_INITIATE"
  )
    return "none";
  if (state === "WAITING_ACCEPT" || state === "TIMEOUT_EXPIRED")
    return "partyA";
  return "both"; // BOTH_LOCKED, GENERATING_PROOF, SUBMITTING_EXECUTE
}

// ── Main Component ───────────────────────────────────────────────────

interface SettleBPageProps {
  onBack: () => void;
}

export default function SettleBPage({ onBack }: SettleBPageProps) {
  const { program, wallet } = useAnchorContext();
  const schemeB = useSchemeB(program, wallet);

  const [counterparty, setCounterparty] = useState("");
  const [assetBMint, setAssetBMint] = useState("");
  const [amount, setAmount] = useState("");
  const [cpAmount, setCpAmount] = useState("");

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [schemeB.logs]);

  // Determine current step
  const stepInfo = STEP_STATES[schemeB.initiatorState] || { step: 0, label: "—" };
  const currentStep = stepInfo.step;
  const lockStatus = getLockStatus(schemeB.initiatorState);

  // Whether the form is interactive
  const formDisabled =
    schemeB.initiatorState !== "IDLE";

  // ── Handlers ─────────────────────────────────────────────────────

  const handleInitiate = () => {
    if (!counterparty || !assetBMint || !amount) return;
    schemeB.initiate(counterparty, assetBMint, BigInt(amount));
  };

  const handleAccept = () => {
    if (!cpAmount) return;
    schemeB.verifyAndAccept(BigInt(cpAmount));
  };

  const handleCancel = () => {
    schemeB.cancelInitiate();
  };

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      {/* Top status bar */}
      <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded-sm text-slate-400 transition-colors"
          >
            <ArrowRightLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-widest uppercase">
              OTC Settlement Node
            </h1>
            <p className="text-[10px] text-emerald-500/70">
              Scheme B Production Environment
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-[10px]">
          {schemeB.error && (
            <span className="text-red-400 border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-sm">
              ERROR
            </span>
          )}
          <span className="border border-slate-800 bg-[#05080C] px-3 py-1 rounded-sm text-slate-400">
            {stepInfo.label}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* ── Left: Controls & Monitoring ── */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* 3-step progress tracker */}
          <div className="border border-slate-800 bg-[#05080C] p-4 rounded-sm flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
            <div
              className={`flex flex-col items-center ${
                currentStep >= 1 ? "text-emerald-400" : "text-slate-600"
              }`}
            >
              <Hash size={16} className="mb-1" />
              <span>1. Initiate</span>
            </div>
            <div
              className={`h-px flex-grow mx-4 ${
                currentStep >= 2 ? "bg-emerald-500/50" : "bg-slate-800"
              }`}
            />
            <div
              className={`flex flex-col items-center ${
                currentStep >= 2 ? "text-emerald-400" : "text-slate-600"
              }`}
            >
              <Link size={16} className="mb-1" />
              <span>2. Dual-Lock</span>
            </div>
            <div
              className={`h-px flex-grow mx-4 ${
                currentStep >= 3 ? "bg-emerald-500/50" : "bg-slate-800"
              }`}
            />
            <div
              className={`flex flex-col items-center ${
                currentStep >= 3 ? "text-emerald-400" : "text-slate-600"
              }`}
            >
              <CheckSquare size={16} className="mb-1" />
              <span>3. Execute</span>
            </div>
          </div>

          {/* Trade intent form */}
          <div className="border border-slate-800 bg-[#05080C] rounded-sm flex flex-col relative overflow-hidden">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                Trade Intent
              </span>
              <span className="text-[9px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-sm">
                Scheme B Encrypted
              </span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-2 block">
                  Counterparty Address
                </label>
                <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-emerald-500/50 rounded-sm">
                  <div className="px-3 bg-slate-800/50 flex items-center justify-center border-r border-slate-700">
                    <Wallet size={12} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={counterparty}
                    onChange={(e) => setCounterparty(e.target.value)}
                    disabled={formDisabled}
                    className="bg-transparent w-full text-xs px-3 py-2 outline-none text-emerald-50 font-mono disabled:opacity-50"
                    placeholder="Solana Address..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-2 block">
                  Asset B Mint
                </label>
                <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-emerald-500/50 rounded-sm">
                  <input
                    type="text"
                    value={assetBMint}
                    onChange={(e) => setAssetBMint(e.target.value)}
                    disabled={formDisabled}
                    className="bg-transparent w-full text-xs px-3 py-2 outline-none text-emerald-50 font-mono disabled:opacity-50"
                    placeholder="Mint Pubkey..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-2 block">
                  Settlement Amount
                </label>
                <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-emerald-500/50 rounded-sm">
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={formDisabled}
                    className="bg-transparent w-full text-base px-3 py-2 outline-none text-emerald-50 text-right font-mono disabled:opacity-50"
                    placeholder="0"
                  />
                  <div className="px-3 py-2 bg-slate-800/50 border-l border-slate-700 flex items-center text-[10px] font-bold text-slate-400">
                    LAMPORTS
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-5 pt-0 flex space-x-3">
              <button
                onClick={handleInitiate}
                disabled={formDisabled || !counterparty || !assetBMint || !amount}
                className={`flex-grow py-3 px-4 uppercase tracking-widest text-[10px] font-bold transition-all border rounded-sm flex items-center justify-center space-x-2 ${
                  !formDisabled && counterparty && assetBMint && amount
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30"
                    : "bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed"
                }`}
              >
                <Hash size={14} />
                <span>Step 1: Initiate Commit</span>
              </button>

              {(schemeB.initiatorState === "WAITING_ACCEPT" ||
                schemeB.initiatorState === "TIMEOUT_EXPIRED") && (
                <button
                  onClick={handleCancel}
                  className="px-4 border border-red-900/50 bg-red-900/20 text-red-400 text-[10px] uppercase font-bold hover:bg-red-900/40 rounded-sm transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* Counterparty accept panel */}
          {schemeB.initiatorState === "BOTH_LOCKED" &&
            schemeB.counterpartyState === "GENERATING_PROOF" && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 p-4 rounded-sm space-y-3">
                <div className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold flex items-center">
                  <CheckSquare size={12} className="mr-2" />
                  Dual-Lock Confirmed
                </div>
                <p className="text-[10px] text-slate-400">
                  Generating ZK proof... This may take several seconds.
                </p>
              </div>
            )}

          {/* Commitment & Lock Monitor */}
          <div className="border border-slate-800 bg-[#05080C] rounded-sm p-5 flex-grow flex flex-col relative overflow-hidden">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center border-b border-slate-800 pb-2">
              <Lock size={14} className="mr-2" /> Commitment & Lock Status
            </h3>

            <div className="space-y-4 text-[10px] flex-grow">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">CommitSlot Hash:</span>
                <span
                  className={`font-bold ${
                    schemeB.commitmentHash
                      ? "text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-sm border border-purple-500/20"
                      : "text-slate-600"
                  }`}
                >
                  {schemeB.commitmentHash
                    ? `${schemeB.commitmentHash.slice(0, 16)}...`
                    : "AWAITING_INIT"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Party A (You) Ledger:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-sm border ${
                    lockStatus === "partyA" || lockStatus === "both"
                      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                      : "bg-slate-900 border-slate-800 text-slate-600"
                  }`}
                >
                  {lockStatus === "partyA" || lockStatus === "both"
                    ? "LOCKED (Pending)"
                    : "ACTIVE (Free)"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500">Party B (CP) Ledger:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-sm border ${
                    lockStatus === "both"
                      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                      : "bg-slate-900 border-slate-800 text-slate-600"
                  }`}
                >
                  {lockStatus === "both"
                    ? "LOCKED (Pending)"
                    : "ACTIVE (Free)"}
                </span>
              </div>

              {/* Countdown */}
              {schemeB.initiatorState === "WAITING_ACCEPT" && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Timeout Countdown:</span>
                  <span className="font-bold text-orange-400">
                    {schemeB.countdown}s
                  </span>
                </div>
              )}
            </div>

            {lockStatus === "both" && (
              <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-400 text-[9px] uppercase tracking-wider text-center animate-pulse">
                Symmetric Dual-Lock Engaged. Zero Free Option.
              </div>
            )}
            {lockStatus === "partyA" && (
              <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/30 rounded-sm text-orange-400 text-[9px] uppercase tracking-wider text-center flex items-center justify-center">
                <Clock size={10} className="mr-1 animate-spin" /> Awaiting
                Counterparty ({schemeB.countdown}s)...
              </div>
            )}

            {/* Hash validation result */}
            {schemeB.hashValid === true && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-sm text-emerald-400 text-[10px]">
                Hash verified — amount matches on-chain commitment.
              </div>
            )}
            {schemeB.hashValid === false && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-[10px]">
                Hash MISMATCH — committed amount differs. Do NOT accept.
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Terminal Log ── */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="border border-slate-800 bg-[#020305] flex flex-col h-full rounded-sm relative shadow-[0_0_30px_rgba(20,241,149,0.02)] min-h-[500px]">
            {/* Terminal header */}
            <div className="bg-[#0b140e] border-b border-[#1a2f23] px-4 py-2 flex justify-between items-center">
              <span className="text-xs font-mono text-emerald-600/70 flex items-center">
                <Terminal size={14} className="mr-2" /> nexum-crypto-engine —
                scheme-b
              </span>

              <div className="flex items-center space-x-2 text-[10px] font-mono">
                {schemeB.initiatorState === "GENERATING_HASH" && (
                  <>
                    <span className="text-purple-500 animate-pulse">●</span>
                    <span className="text-purple-400">Hashing Payload...</span>
                  </>
                )}
                {schemeB.initiatorState === "SUBMITTING_INITIATE" && (
                  <>
                    <span className="text-blue-500 animate-pulse">●</span>
                    <span className="text-blue-400">Submitting TX...</span>
                  </>
                )}
                {schemeB.initiatorState === "WAITING_ACCEPT" && (
                  <>
                    <span className="text-orange-500 animate-pulse">●</span>
                    <span className="text-orange-400">Awaiting Accept...</span>
                  </>
                )}
                {schemeB.initiatorState === "GENERATING_PROOF" && (
                  <>
                    <span className="text-blue-500 animate-pulse">●</span>
                    <span className="text-blue-400">ZK Prover Active</span>
                  </>
                )}
                {schemeB.initiatorState === "SUBMITTING_EXECUTE" && (
                  <>
                    <span className="text-yellow-500 animate-pulse">●</span>
                    <span className="text-yellow-400">Submitting TX...</span>
                  </>
                )}
                {schemeB.initiatorState === "SETTLED" && (
                  <>
                    <span className="text-emerald-500">●</span>
                    <span className="text-emerald-400">Settled</span>
                  </>
                )}
              </div>
            </div>

            {/* Log output */}
            <div className="flex-grow p-5 overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar">
              <div className="space-y-1.5">
                {schemeB.logs.length === 0 ? (
                  <span className="text-slate-600">
                    Waiting for events...
                  </span>
                ) : (
                  schemeB.logs.map((log, i) => (
                    <div key={i} className="flex space-x-3">
                      <span className="text-slate-600 shrink-0 text-[10px]">
                        [{new Date().toLocaleTimeString().slice(0, 8)}]
                      </span>
                      <span
                        className={
                          log.includes("✓") || log.includes("verified")
                            ? "text-emerald-400 font-bold"
                            : log.includes("Error") ||
                              log.includes("MISMATCH")
                            ? "text-red-400"
                            : log.includes("Hash") ||
                              log.includes("Submitting") ||
                              log.includes("Dual-Lock")
                            ? "text-yellow-400/80"
                            : log.includes("Computing") ||
                              log.includes("Generating") ||
                              log.includes("Waiting")
                            ? "text-blue-400/80"
                            : "text-slate-400"
                        }
                      >
                        {log}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Success overlay */}
            <div
              className={`absolute bottom-0 left-0 right-0 bg-[#141002] border-t-2 border-yellow-500/60 transition-all duration-500 overflow-hidden shadow-[0_-10px_40px_rgba(234,179,8,0.1)] ${
                schemeB.initiatorState === "SETTLED"
                  ? "h-[120px] opacity-100"
                  : "h-0 opacity-0"
              }`}
            >
              <div className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center space-x-2 text-yellow-500 mb-2">
                  <CheckSquare size={16} />
                  <span className="font-bold tracking-widest uppercase text-sm">
                    Atomic Settlement Executed
                  </span>
                </div>
                <div className="text-[9px] text-yellow-600/50 uppercase">
                  CommitSlot Closed & Dual-Lock Released
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
