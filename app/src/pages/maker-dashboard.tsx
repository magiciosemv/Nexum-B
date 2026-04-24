/**
 * maker-dashboard.tsx — Market Maker Version Slot Dashboard
 *
 * Wired to real VersionSlotManager SDK for on-chain slot operations.
 * Requires wallet connection + existing UserLedger on-chain.
 */

import React, { useState, useCallback } from "react";
import { useAnchorContext } from "../context/WalletProvider";
import { PublicKey } from "@solana/web3.js";
import {
  VersionSlotManager,
  SlotInfo,
  findLedgerPDA,
  VSlotStatus,
} from "@nexum/sdk";
import {
  ArrowRightLeft,
  Cpu,
  Database,
  Hash,
  Loader2,
  CheckSquare,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ── Status badge config ───────────────────────────────────────────────

const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
  Free: {
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    icon: <Hash size={10} />,
  },
  Bound: {
    color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    icon: <Database size={10} />,
  },
  Done: {
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    icon: <CheckSquare size={10} />,
  },
  Expired: {
    color: "text-slate-500 bg-slate-800 border-slate-700",
    icon: <XCircle size={10} />,
  },
};

// ── Props ─────────────────────────────────────────────────────────────

interface MakerDashboardProps {
  onBack: () => void;
}

export default function MakerDashboard({ onBack }: MakerDashboardProps) {
  const { program, wallet, publicKey } = useAnchorContext();

  // Form state
  const [mintAddress, setMintAddress] = useState("");
  const [reserveCount, setReserveCount] = useState(5);
  const [isInitialized, setIsInitialized] = useState(false);

  // Slot state from SDK
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VersionSlotManager instance
  const [vsm, setVsm] = useState<VersionSlotManager | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // ── Initialize VersionSlotManager ─────────────────────────────────

  const handleInitialize = async () => {
    if (!program || !wallet || !publicKey || !mintAddress) return;
    setLoading(true);
    setError(null);

    try {
      const mint = new PublicKey(mintAddress);
      const [ledgerPda] = findLedgerPDA(publicKey, mint, program.programId);

      addLog(`Fetching ledger: ${ledgerPda.toBase58().slice(0, 16)}...`);

      // Fetch on-chain ledger to get current version
      const ledger = await (program.account as any).userLedger.fetch(ledgerPda);
      const currentVersion = BigInt(ledger.version.toString());

      addLog(`Ledger found. Version: ${currentVersion}`);

      const manager = new VersionSlotManager(program, wallet, ledgerPda, currentVersion);
      setVsm(manager);
      setIsInitialized(true);
      addLog("VersionSlotManager initialized.");
    } catch (err: any) {
      setError(err.message);
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Reserve slots on-chain ────────────────────────────────────────

  const handleReserve = async () => {
    if (!vsm) return;
    setLoading(true);
    setError(null);

    try {
      addLog(`Reserving ${reserveCount} version slots...`);
      const newSlots = await vsm.reserve(reserveCount);

      setSlots((prev) => [...prev, ...newSlots]);
      newSlots.forEach((s) => {
        addLog(`Slot ${s.slot_index}: version=${s.slot_version} pda=${s.pda.toBase58().slice(0, 16)}...`);
      });
      addLog(`✓ ${newSlots.length} slots reserved.`);
    } catch (err: any) {
      setError(err.message);
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Release slot on-chain ─────────────────────────────────────────

  const handleRelease = async (slot: SlotInfo) => {
    if (!vsm) return;
    setLoading(true);
    setError(null);

    try {
      addLog(`Releasing slot ${slot.slot_index}...`);
      const sig = await vsm.release(slot.pda);
      addLog(`✓ Slot ${slot.slot_index} released. TX: ${sig.slice(0, 16)}...`);

      setSlots((prev) =>
        prev.map((s) =>
          s.slot_index === slot.slot_index ? { ...s, status: VSlotStatus.Done } : s
        )
      );
    } catch (err: any) {
      setError(err.message);
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────

  const totalSlots = slots.length;
  const boundSlots = slots.filter((s) => s.status === VSlotStatus.Bound).length;
  const doneSlots = slots.filter((s) => s.status === VSlotStatus.Done).length;

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      {/* Header */}
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
              Maker Dashboard
            </h1>
            <p className="text-[10px] text-purple-400/70">
              Version Slot Concurrency Engine
            </p>
          </div>
        </div>

        {publicKey && (
          <div className="flex items-center space-x-2 text-[10px] text-slate-500">
            <Cpu size={12} className="text-purple-400/50" />
            <span className="font-mono">{publicKey.toBase58().slice(0, 8)}...</span>
          </div>
        )}
      </header>

      {!isInitialized ? (
        /* ── Setup Panel ── */
        <div className="max-w-lg mx-auto mt-12">
          <div className="border border-slate-800 bg-[#05080C] p-6 rounded-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center">
              <Database size={14} className="mr-2" /> Initialize Version Slot Manager
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 uppercase mb-2 block">
                  Asset Mint Address
                </label>
                <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-purple-500/50 rounded-sm">
                  <div className="px-3 bg-slate-800/50 flex items-center justify-center border-r border-slate-700">
                    <Database size={12} className="text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={mintAddress}
                    onChange={(e) => setMintAddress(e.target.value)}
                    className="bg-transparent w-full text-xs px-3 py-2 outline-none text-emerald-50 font-mono"
                    placeholder="Mint pubkey for your ledger..."
                  />
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  The mint of the asset in your UserLedger. Used to derive the ledger PDA.
                </p>
              </div>

              <button
                onClick={handleInitialize}
                disabled={!mintAddress || loading}
                className="w-full py-3 px-4 bg-purple-500/20 border border-purple-500/50 text-purple-400 text-[10px] uppercase font-bold tracking-widest rounded-sm hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Loading Ledger...</span>
                  </>
                ) : (
                  <span>Connect Ledger</span>
                )}
              </button>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-[10px]">
                  <AlertTriangle size={10} className="inline mr-1" />
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border border-slate-800 bg-[#05080C] p-4 rounded-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                Total Reserved
              </div>
              <div className="text-2xl font-black text-white">{totalSlots}</div>
            </div>
            <div className="border border-slate-800 bg-[#05080C] p-4 rounded-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                In Use
              </div>
              <div className="text-2xl font-black text-blue-400">{boundSlots}</div>
            </div>
            <div className="border border-slate-800 bg-[#05080C] p-4 rounded-sm">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                Released
              </div>
              <div className="text-2xl font-black text-emerald-400">{doneSlots}</div>
            </div>
          </div>

          {/* Controls */}
          <div className="border border-slate-800 bg-[#05080C] p-5 rounded-sm mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[10px] text-slate-500 uppercase mb-2">
                  Slots to Reserve (max 20)
                </label>
                <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-emerald-500/50 rounded-sm">
                  <div className="px-3 bg-slate-800/50 flex items-center justify-center border-r border-slate-700">
                    <Database size={12} className="text-slate-400" />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={reserveCount}
                    onChange={(e) =>
                      setReserveCount(
                        Math.min(20, Math.max(1, parseInt(e.target.value) || 1))
                      )
                    }
                    className="bg-transparent w-full text-sm px-3 py-2 outline-none text-emerald-50 font-mono"
                  />
                </div>
              </div>
              <button
                onClick={handleReserve}
                disabled={loading}
                className="px-4 py-2.5 bg-purple-500/20 border border-purple-500/50 text-purple-400 text-[10px] uppercase font-bold tracking-widest rounded-sm hover:bg-purple-500/30 disabled:opacity-30 transition-all"
              >
                {loading ? "Reserving..." : "Reserve Slots"}
              </button>
            </div>
          </div>

          {/* Slot Table */}
          <div className="border border-slate-800 bg-[#05080C] rounded-sm overflow-hidden flex-grow mb-6">
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                Version Slot Registry
              </span>
            </div>
            <table className="w-full">
              <thead className="bg-[#0A0F16]">
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Index
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    PDA
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {slots.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-600 text-xs"
                    >
                      <Database size={24} className="mx-auto mb-2 opacity-30" />
                      No version slots reserved. Click "Reserve Slots" to start.
                    </td>
                  </tr>
                ) : (
                  slots.map((slot) => {
                    const cfg = statusConfig[VSlotStatus[slot.status] as string] || statusConfig.Free;
                    return (
                      <tr
                        key={slot.slot_index.toString()}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs font-mono text-slate-400">
                          {slot.slot_index.toString()}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white">
                          {slot.slot_version.toString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border ${cfg.color}`}
                          >
                            {cfg.icon}
                            <span>{VSlotStatus[slot.status]}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600 truncate max-w-32">
                          {slot.pda.toBase58().slice(0, 16)}...
                        </td>
                        <td className="px-4 py-3">
                          {slot.status === VSlotStatus.Free ||
                          slot.status === VSlotStatus.Expired ? (
                            <button
                              onClick={() => handleRelease(slot)}
                              disabled={loading}
                              className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold tracking-widest disabled:opacity-30"
                            >
                              Release
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Terminal Log */}
          <div className="border border-slate-800 bg-[#020305] rounded-sm overflow-hidden">
            <div className="bg-[#0b140e] border-b border-[#1a2f23] px-4 py-2 flex items-center">
              <span className="text-xs font-mono text-emerald-600/70">
                maker-version-slot-engine
              </span>
            </div>
            <div className="p-4 max-h-40 overflow-y-auto font-mono text-[11px] custom-scrollbar space-y-1">
              {logs.length === 0 ? (
                <span className="text-slate-600">Waiting for operations...</span>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.includes("✓")
                        ? "text-emerald-400"
                        : log.includes("Error")
                        ? "text-red-400"
                        : "text-slate-400"
                    }
                  >
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
