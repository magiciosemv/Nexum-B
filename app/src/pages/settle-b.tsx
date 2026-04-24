/**
 * settle-b.tsx — Nexum OTC Settlement Terminal
 *
 * Original design: Orbitron display headers, JetBrains Mono data,
 * gold/amber accent, deep navy base. Full i18n via useI18n().
 * All real SDK hooks preserved.
 */

import React, { useEffect, useRef, useState } from "react";
import { useSchemeB } from "../hooks/useSchemeB";
import { useAnchorContext } from "../context/WalletProvider";
import { useI18n } from "../context/I18nProvider";
import type { InitiatorState } from "../hooks/useSchemeB";
import {
  ArrowRightLeft, Terminal, Loader2, Lock, Hash,
  CheckSquare, Link, Clock, Wallet, Database,
} from "lucide-react";

const STEP_MAP: Record<string, number> = {
  IDLE: 0, GENERATING_HASH: 1, SUBMITTING_INITIATE: 1,
  WAITING_ACCEPT: 2, BOTH_LOCKED: 2, TIMEOUT_EXPIRED: 0,
  GENERATING_PROOF: 3, SUBMITTING_EXECUTE: 3, SETTLED: 3,
  CANCELLED: 0, ERROR: 0,
};

function getLock(s: InitiatorState): "none" | "partyA" | "both" {
  if (["SETTLED", "CANCELLED", "IDLE", "GENERATING_HASH", "SUBMITTING_INITIATE", "ERROR"].includes(s)) return "none";
  if (s === "WAITING_ACCEPT" || s === "TIMEOUT_EXPIRED") return "partyA";
  return "both";
}

interface Props { onBack: () => void; }

export default function SettleBPage({ onBack }: Props) {
  const { program, wallet } = useAnchorContext();
  const schemeB = useSchemeB(program, wallet);
  const { t } = useI18n();

  const [counterparty, setCounterparty] = useState("");
  const [assetAMint, setAssetAMint] = useState("");
  const [assetBMint, setAssetBMint] = useState("");
  const [amount, setAmount] = useState("");
  const [cpAmount, setCpAmount] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [schemeB.logs]);

  const step = STEP_MAP[schemeB.initiatorState] ?? 0;
  const lock = getLock(schemeB.initiatorState);
  const formOff = schemeB.initiatorState !== "IDLE";

  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 bg-slate-800/80 border border-slate-700/50 hover:bg-slate-700/80 rounded-lg text-slate-400 transition-colors cursor-pointer">
            <ArrowRightLeft size={15} />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-white tracking-widest uppercase">{t.trader.title}</h1>
            <p className="text-[10px] text-amber-400/60 font-mono">{t.trader.schemeLabel}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {schemeB.error && <span className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-md">ERROR</span>}
          <span className="text-[10px] border border-slate-700/50 bg-slate-800/80 px-3 py-1 rounded-md text-slate-400">{t.trader.step1.replace("1. ","")} → {t.trader.step2.replace("2. ","")} → {t.trader.step3.replace("3. ","")}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow">
        {/* Left */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* 3-step */}
          <div className="border border-slate-700/40 bg-slate-800/30 p-3.5 rounded-xl flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
            {[
              { n: 1, label: t.trader.step1, Icon: Hash },
              { n: 2, label: t.trader.step2, Icon: Link },
              { n: 3, label: t.trader.step3, Icon: CheckSquare },
            ].map(({ n, label, Icon }, i, arr) => (
              <React.Fragment key={n}>
                <div className={`flex flex-col items-center ${step >= n ? "text-amber-400" : "text-slate-600"}`}>
                  <Icon size={15} className="mb-1" />
                  <span>{label}</span>
                </div>
                {i < arr.length - 1 && <div className={`h-px flex-grow mx-3 ${step > n ? "bg-amber-400/40" : "bg-slate-700/40"}`} />}
              </React.Fragment>
            ))}
          </div>

          {/* Form */}
          <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl flex flex-col relative overflow-hidden">
            {schemeB.initiatorState === "IDLE" ? null : (
              <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <Loader2 size={20} className="animate-spin text-amber-400" />
              </div>
            )}
            <div className="bg-slate-900/60 border-b border-slate-700/40 px-4 py-2.5 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{t.trader.tradeIntent}</span>
              <span className="text-[9px] text-amber-400 border border-amber-400/20 bg-amber-400/5 px-2 py-0.5 rounded-md">{t.trader.encrypted}</span>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: t.trader.counterparty, value: counterparty, set: setCounterparty, icon: <Wallet size={11} className="text-slate-500" />, placeholder: "Solana..." },
                { label: t.trader.assetA, value: assetAMint, set: setAssetAMint, icon: <Database size={11} className="text-slate-500" />, placeholder: t.trader.assetAHint },
                { label: t.trader.assetB, value: assetBMint, set: setAssetBMint, icon: <Database size={11} className="text-slate-500" />, placeholder: "Mint..." },
              ].map(({ label, value, set, icon, placeholder }) => (
                <div key={label}>
                  <label className="text-[10px] text-slate-500 uppercase mb-1.5 block">{label}</label>
                  <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-amber-400/40 rounded-lg transition-colors">
                    <div className="px-2.5 bg-slate-800/40 flex items-center justify-center border-r border-slate-700/40">{icon}</div>
                    <input type="text" value={value} onChange={(e) => set(e.target.value)} disabled={formOff}
                      className="bg-transparent w-full text-xs px-3 py-2 outline-none text-amber-50 font-mono disabled:opacity-40" placeholder={placeholder} />
                  </div>
                </div>
              ))}
              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-1.5 block">{t.trader.amount}</label>
                <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-amber-400/40 rounded-lg transition-colors">
                  <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={formOff}
                    className="bg-transparent w-full text-base px-3 py-2 outline-none text-amber-50 text-right font-mono disabled:opacity-40" placeholder="0" />
                  <div className="px-3 py-2 bg-slate-800/40 border-l border-slate-700/40 flex items-center text-[10px] font-bold text-slate-500">LAMPORTS</div>
                </div>
              </div>
            </div>
            <div className="p-5 pt-0 flex space-x-3">
              <button
                onClick={() => { if (counterparty && assetBMint && amount) schemeB.initiate(counterparty, assetBMint, BigInt(amount), assetAMint || undefined); }}
                disabled={formOff || !counterparty || !assetBMint || !amount}
                className={`flex-grow py-3 uppercase tracking-widest text-[10px] font-bold transition-all border rounded-lg flex items-center justify-center space-x-2 cursor-pointer
                  ${!formOff && counterparty && assetBMint && amount ? "bg-amber-400/15 text-amber-400 border-amber-400/40 hover:bg-amber-400/25" : "bg-slate-800/50 text-slate-600 border-slate-700/40 cursor-not-allowed"}`}
              >
                <Hash size={13} /><span>{t.trader.initiateBtn}</span>
              </button>
              {(schemeB.initiatorState === "WAITING_ACCEPT" || schemeB.initiatorState === "TIMEOUT_EXPIRED") && (
                <button onClick={() => schemeB.cancelInitiate()} className="px-4 border border-red-400/30 bg-red-400/10 text-red-400 text-[10px] uppercase font-bold hover:bg-red-400/20 rounded-lg transition-colors cursor-pointer">{t.trader.cancelBtn}</button>
              )}
            </div>
          </div>

          {/* Lock monitor */}
          <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl p-4 flex-grow flex flex-col">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center border-b border-slate-700/30 pb-2">
              <Lock size={12} className="mr-2 text-amber-400/60" />{t.trader.hashLabel}
            </h3>
            <div className="space-y-3 text-[10px] flex-grow">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">CommitSlot Hash:</span>
                <span className={schemeB.commitmentHash ? "font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-md border border-purple-400/20" : "text-slate-600"}>
                  {schemeB.commitmentHash ? `${schemeB.commitmentHash.slice(0, 16)}...` : "AWAITING_INIT"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t.trader.ledgerA}:</span>
                <span className={`font-bold px-2 py-0.5 rounded-md border ${lock === "partyA" || lock === "both" ? "bg-yellow-400/10 border-yellow-400/30 text-yellow-400" : "bg-slate-800 border-slate-700/40 text-slate-600"}`}>
                  {lock === "partyA" || lock === "both" ? "LOCKED" : "ACTIVE"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t.trader.ledgerB}:</span>
                <span className={`font-bold px-2 py-0.5 rounded-md border ${lock === "both" ? "bg-yellow-400/10 border-yellow-400/30 text-yellow-400" : "bg-slate-800 border-slate-700/40 text-slate-600"}`}>
                  {lock === "both" ? "LOCKED" : "ACTIVE"}
                </span>
              </div>
              {schemeB.initiatorState === "WAITING_ACCEPT" && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">{t.trader.countdown}:</span>
                  <span className="font-bold text-orange-400">{schemeB.countdown}s</span>
                </div>
              )}
            </div>
            {lock === "both" && <div className="mt-3 p-2.5 bg-amber-400/10 border border-amber-400/25 rounded-lg text-amber-400 text-[9px] uppercase tracking-wider text-center animate-pulse">{t.trader.dualLockMsg}</div>}
            {lock === "partyA" && <div className="mt-3 p-2.5 bg-orange-400/10 border border-orange-400/25 rounded-lg text-orange-400 text-[9px] uppercase tracking-wider text-center flex items-center justify-center"><Clock size={10} className="mr-1 animate-spin" />{t.trader.awaitingMsg.replace("{s}", String(schemeB.countdown))}</div>}
            {schemeB.hashValid === true && <div className="mt-2 p-2.5 bg-emerald-400/10 border border-emerald-400/25 rounded-lg text-emerald-400 text-[10px]">{t.trader.hashVerified}</div>}
            {schemeB.hashValid === false && <div className="mt-2 p-2.5 bg-red-400/10 border border-red-400/25 rounded-lg text-red-400 text-[10px]">{t.trader.hashMismatch}</div>}
          </div>
        </div>

        {/* Right: Terminal */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="border border-slate-700/40 bg-[#0a0e18] flex flex-col h-full rounded-xl relative min-h-[500px]">
            <div className="bg-[#0d1420] border-b border-slate-700/30 px-4 py-2 flex justify-between items-center">
              <span className="text-[11px] font-mono text-amber-600/60 flex items-center"><Terminal size={13} className="mr-2" />{t.trader.terminalTitle}</span>
              <div className="text-[10px] font-mono">
                {schemeB.initiatorState === "GENERATING_HASH" && <span className="text-purple-400 animate-pulse">● Hashing...</span>}
                {schemeB.initiatorState === "SUBMITTING_INITIATE" && <span className="text-blue-400 animate-pulse">● Submitting...</span>}
                {schemeB.initiatorState === "WAITING_ACCEPT" && <span className="text-orange-400 animate-pulse">● Awaiting...</span>}
                {schemeB.initiatorState === "GENERATING_PROOF" && <span className="text-blue-400 animate-pulse">● Proving...</span>}
                {schemeB.initiatorState === "SUBMITTING_EXECUTE" && <span className="text-yellow-400 animate-pulse">● Executing...</span>}
                {schemeB.initiatorState === "SETTLED" && <span className="text-emerald-400">● Settled</span>}
              </div>
            </div>
            <div className="flex-grow p-4 overflow-y-auto font-mono text-[11px] leading-relaxed custom-scrollbar">
              <div className="space-y-1">
                {schemeB.logs.length === 0 ? <span className="text-slate-600">Waiting for events...</span> :
                  schemeB.logs.map((log, i) => (
                    <div key={i} className="flex space-x-3">
                      <span className="text-slate-700 shrink-0 text-[10px]">[{new Date().toLocaleTimeString().slice(0, 8)}]</span>
                      <span className={
                        log.includes("✓") || log.includes("verified") ? "text-emerald-400 font-bold" :
                        log.includes("Error") || log.includes("MISMATCH") ? "text-red-400" :
                        log.includes("Hash") || log.includes("Submitting") ? "text-yellow-400/80" :
                        log.includes("Computing") || log.includes("Generating") ? "text-blue-400/80" : "text-slate-400"
                      }>{log}</span>
                    </div>
                  ))}
                <div ref={logsEndRef} />
              </div>
            </div>
            {/* Success */}
            <div className={`absolute bottom-0 left-0 right-0 bg-[#141002] border-t-2 border-amber-400/50 transition-all duration-500 overflow-hidden ${schemeB.initiatorState === "SETTLED" ? "h-[100px] opacity-100" : "h-0 opacity-0"}`}>
              <div className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center space-x-2 text-amber-400">
                  <CheckSquare size={16} />
                  <span className="font-display font-bold tracking-widest uppercase text-sm">{t.trader.successTitle}</span>
                </div>
                <div className="text-[9px] text-amber-600/50 uppercase">{t.trader.successDetail}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
