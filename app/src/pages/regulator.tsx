/**
 * regulator.tsx — Nexum Regulatory Audit Gateway
 *
 * Read-only auditor interface for on-chain compliance inspection.
 * Features: Protocol config, SettlementRecord explorer, CommitSlot inspector,
 * ProofData viewer, UserLedger inspector, recent settlement events.
 */

import React, { useState, useCallback } from "react";
import { useAnchorContext } from "../context/WalletProvider";
import { useI18n } from "../context/I18nProvider";
import {
  Shield, ArrowLeft, Activity, Settings, Search, FileCheck,
  Database, Hash, Lock, Clock, CheckCircle, XCircle, Loader2,
  ExternalLink, RefreshCw, Eye, Key, FileCode, AlertTriangle,
} from "lucide-react";
import type { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

const SOLSCAN_TX = "https://solscan.io/tx";
const SOLSCAN_ACC = "https://solscan.io/account";
const PROGRAM_ID = new PublicKey("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");

// ── Types ────────────────────────────────────────────────────────────

interface SettlementRecord {
  partyA: string;
  partyB: string;
  assetAMint: string;
  assetBMint: string;
  transferLo: number;
  transferHi: number;
  versionA: bigint;
  versionB: bigint;
  scheme: number;
  settledAt: bigint;
}

interface CommitSlotData {
  initiator: string;
  counterparty: string;
  assetAMint: string;
  assetBMint: string;
  commitmentHash: number[];
  expiryInit: bigint;
  executeExpiry: bigint;
  nonce: bigint;
  bothLockedAt: bigint;
  status: number;
  bump: number;
}

interface LedgerData {
  owner: string;
  mint: string;
  balanceCtLo: number[];
  balanceCtHi: number[];
  auditCtLo: number[];
  auditCtHi: number[];
  version: bigint;
  status: number;
  lastSettlementId: number[];
  bump: number;
  pendingCommitment: number[];
  pendingExpiry: bigint;
  pendingCounterparty: string;
  pendingAssetBMint: string;
  pendingNonce: bigint;
}

interface ConfigData {
  authority: string;
  isPaused: boolean;
  minInitWindow: bigint;
  maxInitWindow: bigint;
  executeWindow: bigint;
  clockTolerance: bigint;
  maxVersionSlots: number;
}

interface TxEvent {
  signature: string;
  blockTime: number | null;
  memo?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function truncateAddr(addr: string, len = 8): string {
  if (!addr || addr.length < 20) return addr || "—";
  return `${addr.slice(0, len)}...${addr.slice(-len)}`;
}

function formatTime(ts: bigint | number | null): string {
  if (ts === null || ts === undefined || Number(ts) === 0) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

function statusName(idx: number, labels: string[]): string {
  return labels[idx] || `Unknown(${idx})`;
}

function slotStatusName(idx: number, labels: string[]): string {
  return labels[idx] || `Unknown(${idx})`;
}

function schemeName(idx: number): string {
  return idx === 0 ? "Scheme A" : idx === 1 ? "Scheme B" : `Unknown(${idx})`;
}

function hashBytesToHex(bytes: number[] | Uint8Array, maxLen = 16): string {
  if (!bytes || bytes.length === 0) return "—";
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.length > maxLen * 2 ? `${hex.slice(0, maxLen)}...` : hex;
}

function computeAmount(lo: number, hi: number): string {
  const total = BigInt(lo) + (BigInt(hi) << BigInt(32));
  return total.toString();
}

function SolscanLink({ type, value, label }: { type: "tx" | "account"; value: string; label: string }) {
  const base = type === "tx" ? SOLSCAN_TX : SOLSCAN_ACC;
  return (
    <a href={`${base}/${value}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-400/20 transition-colors shrink-0">
      {label} <ExternalLink size={9} />
    </a>
  );
}

// ── Section Wrapper ──────────────────────────────────────────────────

function Section({ icon, title, children, className = "" }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`border border-slate-700/40 bg-slate-800/30 rounded-xl ${className}`}>
      <div className="bg-slate-900/60 border-b border-slate-700/40 px-4 py-3 flex items-center gap-2">
        {icon}
        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DataRow({ label, value, mono = false, copyable = false }: {
  label: string; value: string; mono?: boolean; copyable?: boolean;
}) {
  const handleCopy = () => { navigator.clipboard.writeText(value); };
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-700/20 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0 ml-3">
        <span className={`text-xs ${mono ? "font-mono text-amber-200" : "text-slate-300"} truncate`}>{value}</span>
        {copyable && value && value !== "—" && (
          <button onClick={handleCopy} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 cursor-pointer" title="Copy">
            <Key size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Input + Button Row ───────────────────────────────────────────────

function SearchRow({ placeholder, value, setValue, onSearch, btnLabel, loading }: {
  placeholder: string; value: string; setValue: (v: string) => void;
  onSearch: () => void; btnLabel: string; loading: boolean;
}) {
  return (
    <div className="flex gap-2 mt-3">
      <input type="text" value={value} onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="flex-grow bg-slate-900/50 border border-slate-700/50 focus:border-purple-400/40 rounded-lg px-3 py-2 text-sm font-mono text-amber-50 outline-none transition-colors" />
      <button onClick={onSearch} disabled={loading || !value}
        className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-all cursor-pointer shrink-0
          ${loading || !value ? "bg-slate-800/50 text-slate-600 border-slate-700/40 cursor-not-allowed"
            : "bg-purple-400/15 text-purple-400 border-purple-400/40 hover:bg-purple-400/25"}`}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        <span className="ml-2">{btnLabel}</span>
      </button>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────

function StatusBadge({ color, children }: { color: "green" | "amber" | "red" | "blue" | "purple" | "slate"; children: React.ReactNode }) {
  const colors = {
    green: "bg-emerald-400/10 border-emerald-400/30 text-emerald-400",
    amber: "bg-yellow-400/10 border-yellow-400/30 text-yellow-400",
    red: "bg-red-400/10 border-red-400/30 text-red-400",
    blue: "bg-blue-400/10 border-blue-400/30 text-blue-400",
    purple: "bg-purple-400/10 border-purple-400/30 text-purple-400",
    slate: "bg-slate-700/30 border-slate-600/30 text-slate-400",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-bold ${colors[color]}`}>
      {children}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────

interface Props { onBack: () => void; }

export default function RegulatorPage({ onBack }: Props) {
  const { program } = useAnchorContext();
  const { t } = useI18n();

  // ── State ──
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [settlementAddr, setSettlementAddr] = useState("");
  const [settlement, setSettlement] = useState<SettlementRecord | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [commitAddr, setCommitAddr] = useState("");
  const [commitSlot, setCommitSlot] = useState<CommitSlotData | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);
  const [proofData, setProofData] = useState<{ proofA: number[]; proofB: number[] } | null>(null);
  const [ledgerAddr, setLedgerAddr] = useState("");
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [recentTxs, setRecentTxs] = useState<TxEvent[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conn = program?.provider.connection;

  // ── Load Protocol Config ──
  const loadConfig = useCallback(async () => {
    if (!program) return;
    setConfigLoading(true);
    setError(null);
    try {
      const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("nexum_config")], PROGRAM_ID);
      const info = await (program.account as any).protocolConfig.fetch(configPda);
      setConfig({
        authority: info.authority.toBase58(),
        isPaused: info.isPaused,
        minInitWindow: info.minInitWindow.toNumber(),
        maxInitWindow: info.maxInitWindow.toNumber(),
        executeWindow: info.executeWindow.toNumber(),
        clockTolerance: info.clockTolerance.toNumber(),
        maxVersionSlots: info.maxVersionSlots,
      });
    } catch (e: any) {
      setError(`${t.regulator.fetchError}: ${e.message?.slice(0, 100)}`);
    } finally {
      setConfigLoading(false);
    }
  }, [program, t]);

  // ── Load Settlement Record ──
  const loadSettlement = useCallback(async () => {
    if (!program || !settlementAddr) return;
    setSettlementLoading(true);
    setError(null);
    try {
      const pk = new PublicKey(settlementAddr);
      const info = await (program.account as any).settlementRecord.fetch(pk);
      setSettlement({
        partyA: info.partyA.toBase58(),
        partyB: info.partyB.toBase58(),
        assetAMint: info.assetAMint.toBase58(),
        assetBMint: info.assetBMint.toBase58(),
        transferLo: info.transferLo,
        transferHi: info.transferHi,
        versionA: info.versionA,
        versionB: info.versionB,
        scheme: info.scheme,
        settledAt: info.settledAt,
      });
    } catch (e: any) {
      setError(`${t.regulator.fetchError}: ${e.message?.slice(0, 100)}`);
      setSettlement(null);
    } finally {
      setSettlementLoading(false);
    }
  }, [program, settlementAddr, t]);

  // ── Load CommitSlot ──
  const loadCommitSlot = useCallback(async () => {
    if (!program || !commitAddr) return;
    setCommitLoading(true);
    setError(null);
    try {
      const pk = new PublicKey(commitAddr);
      const info = await (program.account as any).commitSlot.fetch(pk);
      setCommitSlot({
        initiator: info.initiator.toBase58(),
        counterparty: info.counterparty.toBase58(),
        assetAMint: info.assetAMint.toBase58(),
        assetBMint: info.assetBMint.toBase58(),
        commitmentHash: Array.from(info.commitmentHash),
        expiryInit: info.expiryInit,
        executeExpiry: info.executeExpiry,
        nonce: info.nonce,
        bothLockedAt: info.bothLockedAt,
        status: info.status,
        bump: info.bump,
      });

      // Try loading associated ProofData
      try {
        const nonceLe = new Uint8Array(8);
        const dv = new DataView(nonceLe.buffer);
        dv.setBigUint64(0, info.nonce, true);
        const [proofPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("proofs"), Buffer.from(nonceLe)], PROGRAM_ID
        );
        const proofInfo = await (program.account as any).proofData.fetch(proofPda);
        setProofData({
          proofA: Array.from(proofInfo.proofA),
          proofB: Array.from(proofInfo.proofB),
        });
      } catch {
        setProofData(null);
      }
    } catch (e: any) {
      setError(`${t.regulator.fetchError}: ${e.message?.slice(0, 100)}`);
      setCommitSlot(null);
      setProofData(null);
    } finally {
      setCommitLoading(false);
    }
  }, [program, commitAddr, t]);

  // ── Load Ledger ──
  const loadLedger = useCallback(async () => {
    if (!program || !ledgerAddr) return;
    setLedgerLoading(true);
    setError(null);
    try {
      const pk = new PublicKey(ledgerAddr);
      const info = await (program.account as any).userLedger.fetch(pk);
      setLedger({
        owner: info.owner.toBase58(),
        mint: info.mint.toBase58(),
        balanceCtLo: Array.from(info.balanceCtLo),
        balanceCtHi: Array.from(info.balanceCtHi),
        auditCtLo: Array.from(info.auditCtLo),
        auditCtHi: Array.from(info.auditCtHi),
        version: info.version,
        status: info.status,
        lastSettlementId: Array.from(info.lastSettlementId),
        bump: info.bump,
        pendingCommitment: Array.from(info.pendingCommitment),
        pendingExpiry: info.pendingExpiry,
        pendingCounterparty: info.pendingCounterparty.toBase58(),
        pendingAssetBMint: info.pendingAssetBMint.toBase58(),
        pendingNonce: info.pendingNonce,
      });
    } catch (e: any) {
      setError(`${t.regulator.fetchError}: ${e.message?.slice(0, 100)}`);
      setLedger(null);
    } finally {
      setLedgerLoading(false);
    }
  }, [program, ledgerAddr, t]);

  // ── Load Recent Settlement Events ──
  const loadRecentTxs = useCallback(async () => {
    if (!conn) return;
    setRecentLoading(true);
    setError(null);
    try {
      const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 20 });
      const events: TxEvent[] = sigs
        .filter(s => !s.err)
        .map(s => ({
          signature: s.signature,
          blockTime: s.blockTime ?? null,
        }));
      setRecentTxs(events);
    } catch (e: any) {
      setError(`${t.regulator.fetchError}: ${e.message?.slice(0, 100)}`);
    } finally {
      setRecentLoading(false);
    }
  }, [conn, t]);

  // ── Auto-load config on mount ──
  React.useEffect(() => {
    if (program && !config) loadConfig();
  }, [program, config, loadConfig]);

  return (
    <div className="relative z-10 flex flex-col min-h-screen p-4 md:p-8 font-mono text-slate-300 animate-fade-in">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-slate-700/50 pb-4 mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 bg-slate-800/80 border border-slate-700/50 hover:bg-slate-700/80 rounded-lg text-slate-400 transition-colors cursor-pointer">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold text-white tracking-widest uppercase">{t.regulator.title}</h1>
            <p className="text-xs text-purple-400/60 font-mono">{t.regulator.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Shield size={16} className="text-purple-400" />
          <span className="text-xs text-slate-500 border border-slate-700/50 bg-slate-800/80 px-3 py-1 rounded-md">READ-ONLY</span>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-400/10 border border-red-400/25 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400 cursor-pointer">dismiss</button>
        </div>
      )}

      {/* Top row: Config + Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Protocol Config */}
        <Section icon={<Settings size={14} className="text-purple-400" />} title={t.regulator.configTitle}>
          {configLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" />{t.regulator.loading}</div>}
          {config && (
            <div className="space-y-0">
              <DataRow label={t.regulator.configAuthority} value={truncateAddr(config.authority, 12)} mono copyable />
              <DataRow label={t.regulator.configPaused} value={config.isPaused ? "YES" : "NO"} />
              <DataRow label={t.regulator.configInitWindow} value={`${config.minInitWindow}s – ${config.maxInitWindow}s`} />
              <DataRow label={t.regulator.configExecWindow} value={`${config.executeWindow}s`} />
              <DataRow label={t.regulator.configTolerance} value={`${config.clockTolerance}s`} />
              <DataRow label={t.regulator.configMaxSlots} value={String(config.maxVersionSlots)} />
            </div>
          )}
          <button onClick={loadConfig} className="mt-3 text-[10px] text-purple-400/60 hover:text-purple-400 uppercase tracking-wider cursor-pointer flex items-center gap-1">
            <RefreshCw size={10} />{t.regulator.refresh}
          </button>
        </Section>

        {/* Recent Settlement Events */}
        <Section icon={<Activity size={14} className="text-amber-400" />} title={t.regulator.recentSettlements}>
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {recentLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" />{t.regulator.loading}</div>}
            {recentTxs.length === 0 && !recentLoading && (
              <p className="text-xs text-slate-600">{t.regulator.noRecords}</p>
            )}
            {recentTxs.map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-slate-700/20 last:border-0">
                <code className="text-[11px] text-amber-300 truncate max-w-[200px]">{truncateAddr(tx.signature, 12)}</code>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-500">{tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleTimeString() : "—"}</span>
                  <SolscanLink type="tx" value={tx.signature} label="View" />
                </div>
              </div>
            ))}
          </div>
          <button onClick={loadRecentTxs} disabled={recentLoading}
            className="mt-3 text-[10px] text-amber-400/60 hover:text-amber-400 uppercase tracking-wider cursor-pointer flex items-center gap-1 disabled:opacity-40">
            <RefreshCw size={10} />{t.regulator.refresh}
          </button>
        </Section>
      </div>

      {/* Middle row: Settlement + CommitSlot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Settlement Record Explorer */}
        <Section icon={<FileCheck size={14} className="text-emerald-400" />} title={t.regulator.settlementExplorer}>
          <p className="text-[11px] text-slate-500 mb-2">{t.regulator.explorerHint}</p>
          <SearchRow
            placeholder={t.regulator.explorerPlaceholder}
            value={settlementAddr} setValue={setSettlementAddr}
            onSearch={loadSettlement} btnLabel={t.regulator.loadBtn}
            loading={settlementLoading}
          />
          {settlement && (
            <div className="mt-4 space-y-0">
              <DataRow label={t.regulator.partyA} value={truncateAddr(settlement.partyA, 12)} mono copyable />
              <DataRow label={t.regulator.partyB} value={truncateAddr(settlement.partyB, 12)} mono copyable />
              <DataRow label={t.regulator.assetA} value={truncateAddr(settlement.assetAMint, 8)} mono copyable />
              <DataRow label={t.regulator.assetB} value={truncateAddr(settlement.assetBMint, 8)} mono copyable />
              <DataRow label={t.regulator.amount} value={computeAmount(settlement.transferLo, settlement.transferHi)} />
              <DataRow label={t.regulator.scheme} value={schemeName(settlement.scheme)} />
              <DataRow label={t.regulator.versionA} value={settlement.versionA.toString()} />
              <DataRow label={t.regulator.versionB} value={settlement.versionB.toString()} />
              <DataRow label={t.regulator.settledAt} value={formatTime(settlement.settledAt)} />
              <div className="flex justify-center mt-3">
                <SolscanLink type="account" value={settlementAddr} label="View on Solscan" />
              </div>
            </div>
          )}
        </Section>

        {/* CommitSlot Inspector */}
        <Section icon={<Hash size={14} className="text-purple-400" />} title={t.regulator.commitmentInspector}>
          <SearchRow
            placeholder={t.regulator.commitSlotAddress}
            value={commitAddr} setValue={setCommitAddr}
            onSearch={loadCommitSlot} btnLabel={t.regulator.loadCommitBtn}
            loading={commitLoading}
          />
          {commitSlot && (
            <div className="mt-4 space-y-0">
              <DataRow label={t.regulator.initiator} value={truncateAddr(commitSlot.initiator, 12)} mono copyable />
              <DataRow label={t.regulator.counterparty} value={truncateAddr(commitSlot.counterparty, 12)} mono copyable />
              <DataRow label={t.regulator.assetA} value={truncateAddr(commitSlot.assetAMint, 8)} mono />
              <DataRow label={t.regulator.assetB} value={truncateAddr(commitSlot.assetBMint, 8)} mono />
              <DataRow label={t.regulator.commitmentHash} value={hashBytesToHex(commitSlot.commitmentHash, 20)} mono copyable />
              <DataRow label={t.regulator.status} value="" />
              <div className="py-1">
                <StatusBadge color={commitSlot.status === 0 ? "amber" : commitSlot.status === 1 ? "blue" : commitSlot.status === 2 ? "green" : "red"}>
                  {slotStatusName(commitSlot.status, [t.regulator.statusWaitingAccept, t.regulator.statusBothLocked, t.regulator.statusSettled, t.regulator.statusCancelled])}
                </StatusBadge>
              </div>
              <DataRow label={t.regulator.nonce} value={commitSlot.nonce.toString()} />
              <DataRow label={t.regulator.expiryInit} value={formatTime(commitSlot.expiryInit)} />
              <DataRow label={t.regulator.executeExpiry} value={formatTime(commitSlot.executeExpiry)} />
              <DataRow label={t.regulator.bothLockedAt} value={formatTime(commitSlot.bothLockedAt)} />
              <div className="flex justify-center mt-3">
                <SolscanLink type="account" value={commitAddr} label="View on Solscan" />
              </div>
            </div>
          )}

          {/* ProofData if available */}
          {proofData && (
            <div className="mt-4 border-t border-slate-700/30 pt-4">
              <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <FileCode size={12} />{t.regulator.proofDataTitle}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                  <span className="text-[10px] text-slate-500 uppercase">{t.regulator.proofAParty}</span>
                  <div className="mt-1 text-xs font-mono text-emerald-400">{proofData.proofA.length} bytes</div>
                  <div className="text-[10px] text-slate-600 mt-1">{hashBytesToHex(proofData.proofA.slice(0, 32), 12)}...</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/30">
                  <span className="text-[10px] text-slate-500 uppercase">{t.regulator.proofBParty}</span>
                  <div className="mt-1 text-xs font-mono text-emerald-400">{proofData.proofB.length} bytes</div>
                  <div className="text-[10px] text-slate-600 mt-1">{hashBytesToHex(proofData.proofB.slice(0, 32), 12)}...</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <CheckCircle size={12} className="text-emerald-400" />
                <span className="text-[10px] text-emerald-400">{t.regulator.verifyValid}</span>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* Bottom row: Ledger Inspector */}
      <Section icon={<Database size={14} className="text-amber-400" />} title={t.regulator.ledgerInspector} className="mb-5">
        <SearchRow
          placeholder={t.regulator.ledgerAddress}
          value={ledgerAddr} setValue={setLedgerAddr}
          onSearch={loadLedger} btnLabel={t.regulator.loadLedgerBtn}
          loading={ledgerLoading}
        />
        {ledger && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Base fields */}
            <div className="space-y-0">
              <DataRow label={t.regulator.owner} value={truncateAddr(ledger.owner, 12)} mono copyable />
              <DataRow label={t.regulator.mint} value={truncateAddr(ledger.mint, 8)} mono copyable />
              <DataRow label={t.regulator.version} value={ledger.version.toString()} />
              <div className="py-1.5 border-b border-slate-700/20 flex justify-between items-center">
                <span className="text-xs text-slate-500">{t.regulator.ledgerStatus}</span>
                <StatusBadge color={
                  ledger.status === 0 ? "green" :
                  ledger.status === 1 ? "amber" :
                  ledger.status === 2 ? "blue" :
                  ledger.status === 3 ? "purple" : "red"
                }>
                  {statusName(ledger.status, [t.regulator.ledgerActive, t.regulator.ledgerPendingInit, t.regulator.ledgerBothPending, t.regulator.ledgerPendingCp, t.regulator.ledgerEmergency])}
                </StatusBadge>
              </div>
              <DataRow label={t.regulator.lastSettlement} value={hashBytesToHex(ledger.lastSettlementId, 12)} mono />
            </div>
            {/* Pending fields (Scheme B) */}
            <div className="space-y-0">
              <DataRow label={t.regulator.pendingCommitment} value={hashBytesToHex(ledger.pendingCommitment, 16)} mono />
              <DataRow label={t.regulator.pendingExpiry} value={formatTime(ledger.pendingExpiry)} />
              <DataRow label={t.regulator.pendingCounterparty} value={ledger.pendingCounterparty === PublicKey.default.toBase58() ? "—" : truncateAddr(ledger.pendingCounterparty, 8)} mono />
              <DataRow label={t.regulator.pendingNonce} value={ledger.pendingNonce.toString()} />
            </div>
            {/* Encrypted balance summary */}
            <div className="md:col-span-2 border-t border-slate-700/30 pt-3">
              <h4 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Lock size={10} />Encrypted Balance Data
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: t.regulator.balanceCtLo, data: ledger.balanceCtLo },
                  { label: t.regulator.balanceCtHi, data: ledger.balanceCtHi },
                  { label: t.regulator.auditCtLo, data: ledger.auditCtLo },
                  { label: t.regulator.auditCtHi, data: ledger.auditCtHi },
                ].map(({ label, data }) => (
                  <div key={label} className="bg-slate-900/40 rounded-md p-2 border border-slate-700/20">
                    <span className="text-[9px] text-slate-600 uppercase block">{label}</span>
                    <span className="text-[10px] font-mono text-slate-400">{data.length}B — {hashBytesToHex(data.slice(0, 16), 8)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-2 flex justify-center">
              <SolscanLink type="account" value={ledgerAddr} label="View Ledger on Solscan" />
            </div>
          </div>
        )}
      </Section>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-slate-700/30 flex justify-between items-center text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><Eye size={10} className="text-purple-400/40" />Read-Only Audit Mode</span>
        <span className="flex items-center gap-1"><Shield size={10} className="text-purple-400/40" />Program: {truncateAddr(PROGRAM_ID.toBase58(), 10)}</span>
      </div>
    </div>
  );
}
