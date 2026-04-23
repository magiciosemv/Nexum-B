/**
 * settle-b.tsx — Scheme B OTC Settlement Page
 *
 * Two-panel layout: Initiator (left) + Counterparty (right).
 * Initiator sees 60s countdown badge and initiates settlement.
 * Counterparty sees incoming requests with hash verification.
 */

import React, { useState } from "react";
import { useSchemeB } from "../hooks/useSchemeB";
import { useAnchorContext } from "../context/WalletProvider";
import type { InitiatorState, CounterpartyState } from "../hooks/useSchemeB";

// ── Status Badge Component ──────────────────────────────────────────

function StatusBadge({ state, countdown }: { state: InitiatorState; countdown: number }) {
  const colors: Record<string, string> = {
    IDLE: "bg-gray-200 text-gray-700",
    GENERATING_HASH: "bg-blue-100 text-blue-700",
    SUBMITTING_INITIATE: "bg-blue-100 text-blue-700",
    WAITING_ACCEPT: "bg-amber-100 text-amber-700",
    BOTH_LOCKED: "bg-purple-100 text-purple-700",
    GENERATING_PROOF: "bg-indigo-100 text-indigo-700",
    SUBMITTING_EXECUTE: "bg-indigo-100 text-indigo-700",
    SETTLED: "bg-green-100 text-green-700",
    TIMEOUT_EXPIRED: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-200 text-gray-500",
    ERROR: "bg-red-100 text-red-700",
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${colors[state] || "bg-gray-200"}`}>
      <span>{state.replace(/_/g, " ")}</span>
      {state === "WAITING_ACCEPT" && (
        <span className="font-mono font-bold">{countdown}s</span>
      )}
    </div>
  );
}

// ── Terminal Window Component ────────────────────────────────────────

function TerminalWindow({ logs }: { logs: string[] }) {
  return (
    <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
      {logs.length === 0 ? (
        <span className="text-gray-600">Waiting for events...</span>
      ) : (
        logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap">{log}</div>
        ))
      )}
    </div>
  );
}

// ── Initiator Form ──────────────────────────────────────────────────

function InitiateForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (cp: string, mint: string, amount: bigint) => void;
  disabled: boolean;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [assetBMint, setAssetBMint] = useState("");
  const [amount, setAmount] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(counterparty, assetBMint, BigInt(amount));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty</label>
        <input
          type="text"
          value={counterparty}
          onChange={e => setCounterparty(e.target.value)}
          placeholder="Pubkey..."
          disabled={disabled}
          className="w-full px-3 py-2 border rounded-md text-sm disabled:opacity-50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Asset B Mint</label>
        <input
          type="text"
          value={assetBMint}
          onChange={e => setAssetBMint(e.target.value)}
          placeholder="Pubkey..."
          disabled={disabled}
          className="w-full px-3 py-2 border rounded-md text-sm disabled:opacity-50"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Amount</label>
        <input
          type="text"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount in smallest unit"
          disabled={disabled}
          className="w-full px-3 py-2 border rounded-md text-sm disabled:opacity-50"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || !counterparty || !assetBMint || !amount}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Initiate Commit
      </button>
    </form>
  );
}

// ── Initiator Panel ─────────────────────────────────────────────────

export function InitiatorPanel({
  state,
  countdown,
  logs,
  initiate,
  cancelInitiate,
}: {
  state: ReturnType<typeof useSchemeB>;
  countdown: number;
  logs: string[];
  initiate: (cp: string, mint: string, amount: bigint) => Promise<void>;
  cancelInitiate: () => Promise<void>;
}) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">OTC Settlement — Initiator</h2>
        <StatusBadge state={state.initiatorState} countdown={countdown} />
      </div>

      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm">
          {state.error}
        </div>
      )}

      <InitiateForm
        onSubmit={initiate}
        disabled={state.initiatorState !== "IDLE"}
      />

      {state.initiatorState === "TIMEOUT_EXPIRED" && (
        <button
          onClick={cancelInitiate}
          className="w-full py-2 px-4 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
        >
          Cancel Initiate (Unlock Balance)
        </button>
      )}

      <TerminalWindow logs={logs} />
    </div>
  );
}

// ── Counterparty Panel ──────────────────────────────────────────────

export function CounterpartyPanel({
  state,
  verifyAndAccept,
}: {
  state: ReturnType<typeof useSchemeB>;
  verifyAndAccept: (amount: bigint) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">OTC Settlement — Counterparty</h2>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          state.counterpartyState === "IDLE"
            ? "bg-gray-200 text-gray-700"
            : state.counterpartyState === "SETTLED"
            ? "bg-green-100 text-green-700"
            : "bg-blue-100 text-blue-700"
        }`}>
          {state.counterpartyState.replace(/_/g, " ")}
        </span>
      </div>

      {state.counterpartyState === "INCOMING_REQUEST" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="text-sm text-amber-800 font-medium">Incoming Settlement Request</p>
            <p className="text-xs text-amber-600 mt-1">Verify the commitment hash matches the agreed amount before accepting.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Amount</label>
            <input
              type="text"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter agreed amount"
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <button
            onClick={() => amount && verifyAndAccept(BigInt(amount))}
            disabled={!amount}
            className="w-full py-2 px-4 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            Verify Hash & Accept
          </button>
        </div>
      )}

      {state.hashValid === true && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
          Hash verified — amount matches the on-chain commitment.
        </div>
      )}

      {state.hashValid === false && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          Hash mismatch — the committed amount differs from what was agreed. Do NOT accept.
        </div>
      )}

      <TerminalWindow logs={state.logs} />
    </div>
  );
}

// ── Main Page Component ─────────────────────────────────────────────

export default function SettleBPage() {
  const { program, wallet } = useAnchorContext();
  const schemeB = useSchemeB(program, wallet);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Nexum Protocol — Scheme B Settlement
        </h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InitiatorPanel
            state={schemeB}
            countdown={schemeB.countdown}
            logs={schemeB.logs}
            initiate={schemeB.initiate}
            cancelInitiate={schemeB.cancelInitiate}
          />
          <CounterpartyPanel
            state={schemeB}
            verifyAndAccept={schemeB.verifyAndAccept}
          />
        </div>
      </div>
    </div>
  );
}
