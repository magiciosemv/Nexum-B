/**
 * maker-dashboard.tsx — Market Maker Version Slot Dashboard
 *
 * Shows version slot utilization, reserve/release controls,
 * and parallel proof generation progress.
 */

import React, { useState } from "react";

interface SlotRow {
  index: number;
  version: number;
  status: "Free" | "Bound" | "Done" | "Expired";
  boundTo: string;
}

export default function MakerDashboard() {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [reserveCount, setReserveCount] = useState(5);
  const [proofProgress, setProofProgress] = useState(0);

  const handleReserve = () => {
    const newSlots: SlotRow[] = [];
    const baseVersion = slots.length > 0 ? slots[slots.length - 1].version + 1 : 1;
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
    setSlots(slots.map(s =>
      s.index === index ? { ...s, status: "Done" as const } : s
    ));
  };

  const handleGenerateProofs = () => {
    setProofProgress(0);
    const interval = setInterval(() => {
      setProofProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 400);
  };

  const statusColors: Record<string, string> = {
    Free: "bg-yellow-100 text-yellow-800",
    Bound: "bg-blue-100 text-blue-800",
    Done: "bg-green-100 text-green-800",
    Expired: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Maker Dashboard — Version Slots
        </h1>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slots to Reserve (max 20)
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={reserveCount}
                onChange={e => setReserveCount(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                className="w-32 px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <button
              onClick={handleReserve}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Reserve Slots
            </button>
            <button
              onClick={handleGenerateProofs}
              disabled={slots.length === 0 || proofProgress > 0}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              Generate Proofs
            </button>
          </div>

          {/* Progress bar */}
          {proofProgress > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Proof Generation Progress</span>
                <span>{proofProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 rounded-full h-2 transition-all duration-300"
                  style={{ width: `${proofProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Slot Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Index</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bound To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No version slots reserved. Click "Reserve Slots" to start.
                  </td>
                </tr>
              ) : (
                slots.map(slot => (
                  <tr key={slot.index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{slot.index}</td>
                    <td className="px-4 py-3 text-sm font-mono">{slot.version}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[slot.status]}`}>
                        {slot.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-400 truncate max-w-32">
                      {slot.boundTo || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {slot.status === "Free" || slot.status === "Expired" ? (
                        <button
                          onClick={() => handleRelease(slot.index)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Release
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
