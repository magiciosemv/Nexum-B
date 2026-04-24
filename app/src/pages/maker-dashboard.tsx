/**
 * maker-dashboard.tsx — Market Maker Version Slot Dashboard
 *
 * Dark cyberpunk theme matching the settlement terminal.
 * Shows version slot utilization, reserve/release controls,
 * and parallel proof generation progress.
 */

import React, { useState } from "react";
import { useAnchorContext } from "../context/WalletProvider";
import {
  ArrowRightLeft,
  Cpu,
  Database,
  Hash,
  Loader2,
  CheckSquare,
  XCircle,
} from "lucide-react";

interface SlotRow {
  index: number;
  version: number;
  status: "Free" | "Bound" | "Done" | "Expired";
  boundTo: string;
}

interface MakerDashboardProps {
  onBack: () => void;
}

export default function MakerDashboard({ onBack }: MakerDashboardProps) {
  const { publicKey } = useAnchorContext();
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [reserveCount, setReserveCount] = useState(5);
  const [proofProgress, setProofProgress] = useState(0);
  const [isProving, setIsProving] = useState(false);

  const handleReserve = () => {
    const newSlots: SlotRow[] = [];
    const baseVersion =
      slots.length > 0 ? slots[slots.length - 1].version + 1 : 1;
    for (let i = 0; i < reserveCount; i++) {
      newSlots.push({
        index: slots.length + i,
        version: baseVersion + i,
        status: "Free",
        boundTo: "",
      });
    }
    setSlots([...slots, ...newSlots]);
  };

  const handleRelease = (index: number) => {
    setSlots(
      slots.map((s) =>
        s.index === index ? { ...s, status: "Done" as const } : s
      )
    );
  };

  const handleGenerateProofs = () => {
    setIsProving(true);
    setProofProgress(0);
    const interval = setInterval(() => {
      setProofProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProving(false);
          return 100;
        }
        return prev + 10;
      });
    }, 400);
  };

  const statusConfig: Record<
    string,
    { color: string; icon: React.ReactNode }
  > = {
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

  const totalSlots = slots.length;
  const usedSlots = slots.filter((s) => s.status === "Bound").length;
  const doneSlots = slots.filter((s) => s.status === "Done").length;

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
          <div className="text-2xl font-black text-blue-400">{usedSlots}</div>
        </div>
        <div className="border border-slate-800 bg-[#05080C] p-4 rounded-sm">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
            Completed
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
            <div className="flex bg-[#0A0F16] border border-slate-700 focus-within:border-purple-500/50 rounded-sm">
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
            className="px-4 py-2.5 bg-purple-500/20 border border-purple-500/50 text-purple-400 text-[10px] uppercase font-bold tracking-widest rounded-sm hover:bg-purple-500/30 transition-all"
          >
            Reserve Slots
          </button>
          <button
            onClick={handleGenerateProofs}
            disabled={slots.length === 0 || isProving}
            className="px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] uppercase font-bold tracking-widest rounded-sm hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center space-x-2"
          >
            {isProving ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>Proving...</span>
              </>
            ) : (
              <span>Generate Proofs</span>
            )}
          </button>
        </div>

        {/* Progress bar */}
        {isProving && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>ZK Proof Generation Progress</span>
              <span>{proofProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5">
              <div
                className="bg-emerald-500/80 rounded-full h-1.5 transition-all duration-300"
                style={{ width: `${proofProgress}%` }}
              />
            </div>
            <div className="mt-2 text-emerald-500 text-[11px] font-mono">
              {"█".repeat(Math.floor(proofProgress / 4))}
              {"░".repeat(25 - Math.floor(proofProgress / 4))} {proofProgress}%
            </div>
          </div>
        )}
      </div>

      {/* Slot Table */}
      <div className="border border-slate-800 bg-[#05080C] rounded-sm overflow-hidden flex-grow">
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
                Bound To
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
                const cfg = statusConfig[slot.status];
                return (
                  <tr
                    key={slot.index}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      {slot.index}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-white">
                      {slot.version}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-sm text-[10px] font-bold border ${cfg.color}`}
                      >
                        {cfg.icon}
                        <span>{slot.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 truncate max-w-32">
                      {slot.boundTo || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {slot.status === "Free" || slot.status === "Expired" ? (
                        <button
                          onClick={() => handleRelease(slot.index)}
                          className="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold tracking-widest"
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
    </div>
  );
}
