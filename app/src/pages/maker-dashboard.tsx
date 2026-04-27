/**
 * maker-dashboard.tsx — Nexum Market Maker Version Slot Engine
 *
 * Redesigned as a high-frequency trading terminal with visual pipeline.
 * Dark cyberpunk aesthetic matching settle-b.tsx.
 * Full i18n via useI18n(). Wired to real VersionSlotManager SDK.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAnchorContext } from "../context/WalletProvider";
import { useI18n } from "../context/I18nProvider";
import { PublicKey } from "@solana/web3.js";
import { useNavigate } from "react-router-dom";
import { VersionSlotManager, SlotInfo, findLedgerPDA, VSlotStatus } from "@nexum/sdk";
import {
  ArrowRightLeft, Cpu, Database, Hash, Loader2, CheckCircle2,
  XCircle, AlertTriangle, Zap, Activity, Timer, Layers,
  ChevronRight, Terminal, CircleDot, Gauge,
} from "lucide-react";

// ── Slot status visual config ────────────────────────────────────────

const SLOT_VISUAL: Record<string, { color: string; dot: string; label: string; glow: string }> = {
  Free:     { color: "text-yellow-400",     dot: "bg-yellow-400",     label: "FREE",     glow: "shadow-yellow-400/20" },
  Bound:    { color: "text-blue-400",        dot: "bg-blue-400",       label: "BOUND",    glow: "shadow-blue-400/20" },
  Done:     { color: "text-emerald-400",     dot: "bg-emerald-400",    label: "DONE",     glow: "shadow-emerald-400/20" },
  Expired:  { color: "text-slate-500",       dot: "bg-slate-500",      label: "EXPIRED",  glow: "" },
};

// ── Components ───────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl p-4 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-20 h-20 opacity-5 group-hover:opacity-10 transition-opacity">
        {icon}
      </div>
      <div className="relative">
        <div className="flex items-center gap-1.5 mb-2">
          <div className={`p-1 rounded-md ${color}/10 border border-current/10`}>
            {React.cloneElement(icon as React.ReactElement, { size: 11, className: color })}
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</span>
        </div>
        <div className={`text-2xl font-display font-black ${color} leading-none`}>{value}</div>
        {sub && <div className="text-[10px] text-slate-600 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function SlotPipelineBar({ slots, onRelease, loading }: {
  slots: SlotInfo[]; onRelease: (s: SlotInfo) => void; loading: boolean;
}) {
  const { t } = useI18n();
  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-600">
        <Layers size={36} className="mb-3 opacity-20" />
        <p className="text-xs">{t.maker.noSlots}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
      {slots.map((slot, i) => {
        const statusKey = VSlotStatus[slot.status] as string;
        const vis = SLOT_VISUAL[statusKey] || SLOT_VISUAL.Free;
        const canRelease = slot.status === VSlotStatus.Free || slot.status === VSlotStatus.Expired;

        return (
          <div
            key={slot.slot_index.toString()}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border transition-all
              ${canRelease ? "bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/30" : "bg-slate-800/20 border-slate-700/15"}`}
          >
            {/* Slot index */}
            <div className="w-8 text-center shrink-0">
              <span className="text-xs font-mono text-slate-500 font-bold">#{slot.slot_index.toString()}</span>
            </div>

            {/* Pipeline connector */}
            <div className="w-6 flex flex-col items-center shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${vis.dot} ${vis.glow ? `shadow-sm ${vis.glow}` : ""}`} />
              {i < slots.length - 1 && <div className="w-px h-4 bg-slate-700/40 mt-0.5" />}
            </div>

            {/* Version */}
            <div className="shrink-0 w-20">
              <span className="text-[10px] text-slate-500 uppercase block">v</span>
              <span className="text-xs font-mono text-white font-bold">{slot.slot_version.toString()}</span>
            </div>

            {/* Status badge */}
            <div className="shrink-0">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border
                ${statusKey === "Free" ? "bg-yellow-400/8 border-yellow-400/20 text-yellow-400" :
                  statusKey === "Bound" ? "bg-blue-400/8 border-blue-400/20 text-blue-400" :
                  statusKey === "Done" ? "bg-emerald-400/8 border-emerald-400/20 text-emerald-400" :
                  "bg-slate-800/40 border-slate-700/30 text-slate-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${vis.dot}`} />
                {vis.label}
              </span>
            </div>

            {/* PDA address */}
            <div className="flex-grow min-w-0 hidden sm:block">
              <code className="text-[10px] font-mono text-slate-600 truncate block">
                {slot.pda.toBase58().slice(0, 20)}...
              </code>
            </div>

            {/* Chain arrow */}
            <ChevronRight size={10} className="text-slate-700 shrink-0 hidden sm:block" />

            {/* Action */}
            <div className="shrink-0">
              {canRelease ? (
                <button
                  onClick={() => onRelease(slot)}
                  disabled={loading}
                  className="text-[10px] text-red-400/70 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10
                    px-2.5 py-1 rounded-md border border-red-400/15 transition-all cursor-pointer
                    disabled:opacity-30 disabled:cursor-not-allowed uppercase font-bold tracking-wider"
                >
                  {t.maker.release}
                </button>
              ) : (
                <span className="text-[10px] text-slate-700">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ slots }: { slots: SlotInfo[] }) {
  const total = slots.length || 1;
  const done = slots.filter(s => s.status === VSlotStatus.Done).length;
  const bound = slots.filter(s => s.status === VSlotStatus.Bound).length;
  const free = slots.filter(s => s.status === VSlotStatus.Free).length;
  const pct = (v: number) => `${(v / total) * 100}%`;

  return (
    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
      {done > 0 && <div className="bg-emerald-400/60 transition-all duration-500" style={{ width: pct(done) }} />}
      {bound > 0 && <div className="bg-blue-400/60 transition-all duration-500" style={{ width: pct(bound) }} />}
      {free > 0 && <div className="bg-yellow-400/40 transition-all duration-500" style={{ width: pct(free) }} />}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface Props { onBack: () => void; }

export default function MakerDashboard({ onBack }: Props) {
  const { program, wallet, publicKey } = useAnchorContext();
  const { t } = useI18n();

  const [mintAddress, setMintAddress] = useState("");
  const [reserveCount, setReserveCount] = useState(5);
  const [isInit, setIsInit] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vsm, setVsm] = useState<VersionSlotManager | null>(null);
  const [ledgerVersion, setLedgerVersion] = useState<bigint>(0n);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) =>
    setLogs((p) => [...p.slice(-80), `[${new Date().toLocaleTimeString().slice(0, 8)}] ${msg}`]),
  []);

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // Stats
  const total = slots.length;
  const bound = slots.filter(s => s.status === VSlotStatus.Bound).length;
  const free = slots.filter(s => s.status === VSlotStatus.Free).length;
  const done = slots.filter(s => s.status === VSlotStatus.Done).length;
  const throughput = total > 0 ? `${done}/${total} slots consumed` : "—";

  // ── Handlers ──

  const handleInit = async () => {
    if (!program || !wallet || !publicKey || !mintAddress) return;
    setLoading(true); setError(null);
    try {
      const mint = new PublicKey(mintAddress);
      const [ledgerPda] = findLedgerPDA(publicKey, mint, program.programId);
      addLog(`Fetching ledger: ${ledgerPda.toBase58().slice(0, 16)}...`);
      const ledger = await (program.account as any).userLedger.fetch(ledgerPda);
      const ver = BigInt(ledger.version.toString());
      setLedgerVersion(ver);
      addLog(`Ledger found. Version: ${ver}`);
      setVsm(new VersionSlotManager(program, wallet, ledgerPda, ver));
      setIsInit(true);
      addLog("VersionSlotManager initialized. Ready to reserve slots.");
    } catch (err: any) {
      setError(err.message?.slice(0, 120));
      addLog(`Error: ${err.message?.slice(0, 80)}`);
    } finally { setLoading(false); }
  };

  const handleReserve = async () => {
    if (!vsm) return;
    setLoading(true); setError(null);
    try {
      addLog(`Reserving ${reserveCount} version slots...`);
      const ns = await vsm.reserve(reserveCount);
      setSlots((p) => [...p, ...ns]);
      ns.forEach(s => addLog(`  Slot #${s.slot_index} → version ${s.slot_version} (${s.pda.toBase58().slice(0, 12)}...)`));
      addLog(`✓ ${ns.length} slots reserved. Pipeline ready.`);
    } catch (err: any) {
      setError(err.message?.slice(0, 120));
      addLog(`Error: ${err.message?.slice(0, 80)}`);
    } finally { setLoading(false); }
  };

  const handleRelease = async (slot: SlotInfo) => {
    if (!vsm) return;
    setLoading(true); setError(null);
    try {
      addLog(`Releasing slot #${slot.slot_index}...`);
      const sig = await vsm.release(slot.pda);
      addLog(`✓ Slot #${slot.slot_index} released. TX: ${sig.slice(0, 20)}...`);
      setSlots((p) => p.map(s => s.slot_index === slot.slot_index ? { ...s, status: VSlotStatus.Done } : s));
    } catch (err: any) {
      setError(err.message?.slice(0, 120));
      addLog(`Error: ${err.message?.slice(0, 80)}`);
    } finally { setLoading(false); }
  };

  // ── Init Screen ──
  if (!isInit) {
    return (
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300 p-4">
        <div className="w-full max-w-lg">
          <div className="border border-slate-700/40 bg-slate-800/30 backdrop-blur-xl rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500/5 to-blue-500/5 border-b border-slate-700/40 px-6 py-5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-400/10 border border-purple-400/20">
                <Cpu size={20} className="text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-display font-bold text-white tracking-widest uppercase">{t.maker.title}</h2>
                <p className="text-[10px] text-purple-400/50">{t.maker.subtitle}</p>
              </div>
            </div>

            {/* Form */}
            <div className="p-6 space-y-5">
              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-1.5 block tracking-wider font-bold">{t.maker.mintLabel}</label>
                <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-purple-400/40 rounded-lg transition-colors">
                  <div className="px-3 bg-slate-800/40 flex items-center border-r border-slate-700/40">
                    <Database size={13} className="text-purple-400/40" />
                  </div>
                  <input
                    type="text"
                    value={mintAddress}
                    onChange={e => setMintAddress(e.target.value)}
                    className="bg-transparent w-full text-sm px-3 py-3 outline-none text-amber-50 font-mono"
                    placeholder="Mint pubkey..."
                  />
                </div>
                <p className="text-[9px] text-slate-600 mt-1.5 leading-relaxed">{t.maker.mintHint}</p>
              </div>

              <button
                onClick={handleInit}
                disabled={!mintAddress || loading}
                className={`w-full py-3.5 text-xs uppercase font-bold tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2
                  ${mintAddress && !loading
                    ? "bg-purple-400/15 text-purple-400 border border-purple-400/40 hover:bg-purple-400/25 hover:shadow-lg hover:shadow-purple-500/10"
                    : "bg-slate-800/50 text-slate-600 border border-slate-700/40 cursor-not-allowed"}`}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                <span>{loading ? t.maker.loadingLedger : t.maker.connectLedger}</span>
              </button>

              {error && (
                <div className="p-3 bg-red-400/10 border border-red-400/25 rounded-lg text-red-400 text-xs flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="break-all">{error}</span>
                </div>
              )}
            </div>
          </div>

          <button onClick={onBack}
            className="mt-4 text-[10px] text-slate-600 hover:text-slate-400 uppercase tracking-widest cursor-pointer flex items-center gap-1 mx-auto transition-colors">
            <ArrowRightLeft size={10} />{t.maker.backBtn}
          </button>
        </div>
      </div>
    );
  }

  // ── Main Dashboard ──
  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={onBack}
            className="p-2 bg-slate-800/80 border border-slate-700/50 hover:bg-slate-700/80 rounded-lg text-slate-400 transition-colors cursor-pointer">
            <ArrowRightLeft size={15} />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold text-white tracking-widest uppercase">{t.maker.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400/60">ONLINE</span>
              <span className="text-[10px] text-slate-700">|</span>
              <span className="text-[10px] text-slate-500">v{ledgerVersion.toString()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {publicKey && (
            <span className="text-[10px] text-slate-600 font-mono hidden sm:block">{publicKey.toBase58().slice(0, 12)}...</span>
          )}
          <span className="text-[10px] border border-slate-700/50 bg-slate-800/80 px-3 py-1 rounded-md text-purple-400/60">MAKER</span>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-400/10 border border-red-400/25 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />
          <span className="break-all flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 cursor-pointer shrink-0">dismiss</button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<Layers size={28} />} label={t.maker.totalReserved} value={total} color="text-white" sub={`max 20 per ledger`} />
        <StatCard icon={<Zap size={28} />} label={t.maker.inUse} value={bound + free} color="text-blue-400" sub="active pipeline" />
        <StatCard icon={<CheckCircle2 size={28} />} label={t.maker.released} value={done} color="text-emerald-400" sub={throughput} />
        <StatCard icon={<Gauge size={28} />} label="Throughput" value={total > 0 ? `${((done / total) * 100).toFixed(0)}%` : "—"} color="text-amber-400" sub="slot utilization" />
      </div>

      {/* Progress bar */}
      {slots.length > 0 && <div className="mb-5"><ProgressBar slots={slots} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-grow">
        {/* Left: Reserve Controls + Slot Pipeline */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          {/* Reserve Controls */}
          <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl">
            <div className="bg-slate-900/60 border-b border-slate-700/40 px-4 py-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Cpu size={13} className="text-purple-400/60" />
                Reserve Engine
              </span>
              <span className="text-[10px] text-slate-600">Chain-of-Assumption: proof_i assumes slots 0..i-1 succeed</span>
            </div>
            <div className="p-4">
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-grow min-w-[160px]">
                  <label className="text-[10px] text-slate-500 uppercase mb-1.5 block tracking-wider font-bold">
                    {t.maker.slotsToReserve}
                  </label>
                  <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-purple-400/40 rounded-lg transition-colors">
                    <div className="px-3 bg-slate-800/40 flex items-center border-r border-slate-700/40">
                      <Hash size={11} className="text-purple-400/40" />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={reserveCount}
                      onChange={e => setReserveCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="bg-transparent w-full text-lg px-3 py-2.5 outline-none text-amber-50 text-right font-mono"
                    />
                    <div className="px-3 py-2.5 bg-slate-800/40 border-l border-slate-700/40 flex items-center text-xs font-bold text-slate-500">
                      SLOTS
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleReserve}
                  disabled={loading || total >= 20}
                  className={`px-6 py-3 text-[10px] uppercase font-bold tracking-widest rounded-lg transition-all cursor-pointer flex items-center gap-2 shrink-0
                    ${loading || total >= 20
                      ? "bg-slate-800/50 text-slate-600 border border-slate-700/40 cursor-not-allowed"
                      : "bg-purple-400/15 text-purple-400 border border-purple-400/40 hover:bg-purple-400/25 hover:shadow-lg hover:shadow-purple-500/10"}`}
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  <span>{loading ? t.maker.reserving : t.maker.reserveBtn}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Slot Pipeline */}
          <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl flex-grow flex flex-col">
            <div className="bg-slate-900/60 border-b border-slate-700/40 px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Activity size={13} className="text-amber-400/60" />
                {t.maker.registry}
              </span>
              {slots.length > 0 && (
                <span className="text-[10px] text-slate-600">
                  {done} consumed · {free} free · {bound} bound
                </span>
              )}
            </div>
            <div className="p-4 flex-grow">
              <SlotPipelineBar slots={slots} onRelease={handleRelease} loading={loading} />
            </div>
          </div>
        </div>

        {/* Right: Terminal */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="border border-slate-700/40 bg-[#0a0e18] flex flex-col h-full rounded-xl relative min-h-[400px]">
            {/* Terminal header */}
            <div className="bg-[#0d1420] border-b border-slate-700/30 px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs font-mono text-amber-600/60 flex items-center">
                <Terminal size={14} className="mr-2" />
                maker-version-slot-engine
              </span>
              <span className="text-[10px] font-mono text-slate-600">{logs.length} entries</span>
            </div>

            {/* Logs */}
            <div className="flex-grow p-4 overflow-y-auto font-mono text-xs leading-relaxed custom-scrollbar">
              <div className="space-y-1.5">
                {logs.length === 0 ? (
                  <span className="text-slate-600">Waiting for operations...</span>
                ) : logs.map((log, i) => (
                  <div key={i} className="flex space-x-3">
                    <span className="text-slate-700 shrink-0 text-[11px] w-20">
                      {log.slice(1, 9)}
                    </span>
                    <span className={
                      log.includes("✓") ? "text-emerald-400 font-bold" :
                      log.includes("Error") ? "text-red-400 font-bold" :
                      log.includes("Reserving") || log.includes("Releasing") ? "text-yellow-400/80" :
                      log.includes("Slot") && log.includes("→") ? "text-purple-400/80" :
                      "text-slate-400"
                    }>
                      {log.slice(11)}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* Bottom status */}
            <div className="bg-[#0d1420] border-t border-slate-700/30 px-4 py-2 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <CircleDot size={10} className={loading ? "text-amber-400 animate-pulse" : "text-emerald-400/40"} />
                <span className="text-[10px] text-slate-600">
                  {loading ? "Processing..." : "Idle"}
                </span>
              </div>
              <span className="text-[10px] text-slate-700">max 20 slots · ~4s proof/slot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
