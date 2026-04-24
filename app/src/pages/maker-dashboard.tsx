/**
 * maker-dashboard.tsx — Nexum Market Maker Version Slot Dashboard
 *
 * Wired to real VersionSlotManager SDK. Full i18n via useI18n().
 * Orbitron headers, JetBrains Mono data, amber/purple accent on navy.
 */

import React, { useState, useCallback } from "react";
import { useAnchorContext } from "../context/WalletProvider";
import { useI18n } from "../context/I18nProvider";
import { PublicKey } from "@solana/web3.js";
import { VersionSlotManager, SlotInfo, findLedgerPDA, VSlotStatus } from "@nexum/sdk";
import { ArrowRightLeft, Cpu, Database, Hash, Loader2, CheckSquare, XCircle, AlertTriangle } from "lucide-react";

const statusCfg: Record<string, { color: string; icon: React.ReactNode }> = {
  Free: { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: <Hash size={10} /> },
  Bound: { color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: <Database size={10} /> },
  Done: { color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: <CheckSquare size={10} /> },
  Expired: { color: "text-slate-500 bg-slate-800 border-slate-700/50", icon: <XCircle size={10} /> },
};

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

  const addLog = useCallback((msg: string) => setLogs((p) => [...p.slice(-50), `[${new Date().toLocaleTimeString().slice(0,8)}] ${msg}`]), []);

  const handleInit = async () => {
    if (!program || !wallet || !publicKey || !mintAddress) return;
    setLoading(true); setError(null);
    try {
      const mint = new PublicKey(mintAddress);
      const [ledgerPda] = findLedgerPDA(publicKey, mint, program.programId);
      addLog(`Fetching ledger: ${ledgerPda.toBase58().slice(0, 16)}...`);
      const ledger = await (program.account as any).userLedger.fetch(ledgerPda);
      const ver = BigInt(ledger.version.toString());
      addLog(`Ledger found. Version: ${ver}`);
      setVsm(new VersionSlotManager(program, wallet, ledgerPda, ver));
      setIsInit(true);
      addLog("VersionSlotManager initialized.");
    } catch (err: any) { setError(err.message); addLog(`Error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const handleReserve = async () => {
    if (!vsm) return;
    setLoading(true); setError(null);
    try {
      addLog(`Reserving ${reserveCount} slots...`);
      const ns = await vsm.reserve(reserveCount);
      setSlots((p) => [...p, ...ns]);
      ns.forEach((s) => addLog(`Slot ${s.slot_index}: v=${s.slot_version}`));
      addLog(`✓ ${ns.length} slots reserved.`);
    } catch (err: any) { setError(err.message); addLog(`Error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const handleRelease = async (slot: SlotInfo) => {
    if (!vsm) return;
    setLoading(true); setError(null);
    try {
      addLog(`Releasing slot ${slot.slot_index}...`);
      const sig = await vsm.release(slot.pda);
      addLog(`✓ Slot ${slot.slot_index} released. TX: ${sig.slice(0, 16)}...`);
      setSlots((p) => p.map((s) => s.slot_index === slot.slot_index ? { ...s, status: VSlotStatus.Done } : s));
    } catch (err: any) { setError(err.message); addLog(`Error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const total = slots.length;
  const bound = slots.filter((s) => s.status === VSlotStatus.Bound).length;
  const done = slots.filter((s) => s.status === VSlotStatus.Done).length;

  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      <header className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 bg-slate-800/80 border border-slate-700/50 hover:bg-slate-700/80 rounded-lg text-slate-400 transition-colors cursor-pointer">
            <ArrowRightLeft size={15} />
          </button>
          <div>
            <h1 className="text-lg font-display font-bold text-white tracking-widest uppercase">{t.maker.title}</h1>
            <p className="text-[10px] text-purple-400/60 font-mono">{t.maker.subtitle}</p>
          </div>
        </div>
        {publicKey && <span className="text-[10px] text-slate-500 font-mono">{publicKey.toBase58().slice(0, 8)}...</span>}
      </header>

      {!isInit ? (
        <div className="max-w-lg mx-auto mt-10">
          <div className="border border-slate-700/40 bg-slate-800/30 p-6 rounded-xl">
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-5 flex items-center">
              <Database size={13} className="mr-2 text-purple-400/60" />{t.maker.initTitle}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-1.5 block">{t.maker.mintLabel}</label>
                <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-purple-400/40 rounded-lg">
                  <div className="px-2.5 bg-slate-800/40 flex items-center border-r border-slate-700/40"><Database size={11} className="text-slate-500" /></div>
                  <input type="text" value={mintAddress} onChange={(e) => setMintAddress(e.target.value)}
                    className="bg-transparent w-full text-xs px-3 py-2 outline-none text-amber-50 font-mono" placeholder="Mint pubkey..." />
                </div>
                <p className="text-[9px] text-slate-600 mt-1">{t.maker.mintHint}</p>
              </div>
              <button onClick={handleInit} disabled={!mintAddress || loading}
                className="w-full py-3 bg-purple-400/15 border border-purple-400/35 text-purple-300 text-[10px] uppercase font-bold tracking-widest rounded-lg hover:bg-purple-400/25 disabled:opacity-30 transition-all cursor-pointer flex items-center justify-center space-x-2">
                {loading ? <><Loader2 size={12} className="animate-spin" /><span>{t.maker.loadingLedger}</span></> : <span>{t.maker.connectLedger}</span>}
              </button>
              {error && <div className="p-2.5 bg-red-400/10 border border-red-400/25 rounded-lg text-red-400 text-[10px]"><AlertTriangle size={10} className="inline mr-1" />{error}</div>}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[{ label: t.maker.totalReserved, val: total, cls: "text-white" },
              { label: t.maker.inUse, val: bound, cls: "text-blue-400" },
              { label: t.maker.released, val: done, cls: "text-emerald-400" },
            ].map(({ label, val, cls }) => (
              <div key={label} className="border border-slate-700/40 bg-slate-800/30 p-3.5 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</div>
                <div className={`text-2xl font-display font-black ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          <div className="border border-slate-700/40 bg-slate-800/30 p-4 rounded-xl mb-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">{t.maker.slotsToReserve}</label>
                <div className="flex bg-slate-900/50 border border-slate-700/50 focus-within:border-amber-400/40 rounded-lg">
                  <div className="px-2.5 bg-slate-800/40 flex items-center border-r border-slate-700/40"><Database size={11} className="text-slate-500" /></div>
                  <input type="number" min={1} max={20} value={reserveCount}
                    onChange={(e) => setReserveCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="bg-transparent w-full text-sm px-3 py-2 outline-none text-amber-50 font-mono" />
                </div>
              </div>
              <button onClick={handleReserve} disabled={loading}
                className="px-4 py-2.5 bg-amber-400/15 border border-amber-400/35 text-amber-400 text-[10px] uppercase font-bold tracking-widest rounded-lg hover:bg-amber-400/25 disabled:opacity-30 transition-all cursor-pointer">
                {loading ? t.maker.reserving : t.maker.reserveBtn}
              </button>
            </div>
          </div>

          <div className="border border-slate-700/40 bg-slate-800/30 rounded-xl overflow-hidden flex-grow mb-5">
            <div className="bg-slate-900/60 border-b border-slate-700/40 px-4 py-2.5">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{t.maker.registry}</span>
            </div>
            <table className="w-full">
              <thead className="bg-slate-900/40">
                <tr className="border-b border-slate-700/40">
                  {[t.maker.index, t.maker.version, t.maker.status, t.maker.pda, t.maker.action].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-600 text-xs"><Database size={20} className="mx-auto mb-2 opacity-25" />{t.maker.noSlots}</td></tr>
                ) : slots.map((slot) => {
                  const cfg = statusCfg[VSlotStatus[slot.status] as string] || statusCfg.Free;
                  return (
                    <tr key={slot.slot_index.toString()} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-400">{slot.slot_index.toString()}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-white">{slot.slot_version.toString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${cfg.color}`}>{cfg.icon}<span>{VSlotStatus[slot.status]}</span></span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-600 truncate max-w-32">{slot.pda.toBase58().slice(0, 16)}...</td>
                      <td className="px-4 py-2.5">
                        {(slot.status === VSlotStatus.Free || slot.status === VSlotStatus.Expired) && (
                          <button onClick={() => handleRelease(slot)} disabled={loading} className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold tracking-widest disabled:opacity-30 cursor-pointer">{t.maker.release}</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border border-slate-700/40 bg-[#0a0e18] rounded-xl overflow-hidden">
            <div className="bg-[#0d1420] border-b border-slate-700/30 px-4 py-2"><span className="text-[11px] font-mono text-amber-600/60">maker-version-slot-engine</span></div>
            <div className="p-3.5 max-h-36 overflow-y-auto font-mono text-[11px] custom-scrollbar space-y-1">
              {logs.length === 0 ? <span className="text-slate-600">Waiting for operations...</span> :
                logs.map((log, i) => <div key={i} className={log.includes("✓") ? "text-emerald-400" : log.includes("Error") ? "text-red-400" : "text-slate-400"}>{log}</div>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
