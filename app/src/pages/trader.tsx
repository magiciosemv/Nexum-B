/**
 * trader.tsx — Nexum Trader Terminal (v3 Design + Real Solana Backend)
 *
 * 3-column layout: Order Ticket | Settlement Stage | Console
 * State machine driven by useSchemeB hook with real on-chain settlement.
 * Visual design from design_front/src/v3/trader.jsx.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { NexumSeal, Wordmark, Slot, CountdownRing } from "../components/atoms";
import { useAnchorContext } from "../context/WalletProvider";
import { useSchemeB, type InitiatorState } from "../hooks/useSchemeB";

// ── Props ──────────────────────────────────────────────────────────────

interface TraderTerminalProps {
  lang: "zh" | "en";
  setLang: (lang: "zh" | "en") => void;
}

// ── State mapping: useSchemeB → visual state ───────────────────────────

type VisualState =
  | "idle"
  | "drafting"
  | "committing"
  | "waiting_accept"
  | "both_pending"
  | "proving"
  | "executing"
  | "settled"
  | "error";

const SCHEME_TO_VISUAL: Record<string, VisualState> = {
  IDLE: "idle",
  GENERATING_HASH: "drafting",
  SUBMITTING_INITIATE: "committing",
  WAITING_ACCEPT: "waiting_accept",
  BOTH_LOCKED: "both_pending",
  GENERATING_PROOF: "proving",
  SUBMITTING_EXECUTE: "executing",
  SETTLED: "settled",
  TIMEOUT_EXPIRED: "waiting_accept",
  CANCELLED: "idle",
  ERROR: "error",
};

const VISUAL_LABELS: Record<VisualState, string> = {
  idle: "IDLE",
  drafting: "DRAFTING",
  committing: "COMMITTING",
  waiting_accept: "WAITING_ACCEPT",
  both_pending: "BOTH_PENDING",
  proving: "PROVING",
  executing: "EXECUTING",
  settled: "SETTLED",
  error: "ERROR",
};

const STATE_STRIP_SEQ: VisualState[] = [
  "idle",
  "committing",
  "waiting_accept",
  "both_pending",
  "proving",
  "executing",
  "settled",
];

// ── Inline styles ──────────────────────────────────────────────────────

const inpStyle: React.CSSProperties = {
  background: "var(--d-bg-3)",
  border: "1px solid var(--d-line-2)",
  color: "#f4f1ea",
  padding: "10px 12px",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};




// ── Helper: truncate pubkey for display ─────────────────────────────────

function truncatePk(pk: string): string {
  if (pk.length <= 13) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

// ── Sub-components ──────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function FormField({ label, disabled, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: 16, opacity: disabled ? 0.6 : 1 }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: ".22em", color: "#9a9aa3", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

interface RowProps {
  k: string;
  v: string;
  sub?: string;
  highlight?: boolean;
}

function Row({ k, v, sub, highlight }: RowProps) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: "1px dotted var(--d-line)" }}>
      <span className="mono" style={{ fontSize: 10, color: highlight ? "#f4f1ea" : "#9a9aa3", letterSpacing: ".08em" }}>{k}</span>
      <span className="mono" style={{ fontSize: 11, color: highlight ? "var(--accent)" : "#f4f1ea", letterSpacing: ".05em" }}>
        {v}
        {sub && <span style={{ color: "#5a5a63", fontSize: 9, marginLeft: 6 }}>{sub}</span>}
      </span>
    </div>
  );
}

interface CopyRowProps {
  k: string;
  v: string;
}

function CopyRow({ k, v }: CopyRowProps) {
  const copy = () => navigator.clipboard?.writeText(v);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
      <span className="mono" style={{ fontSize: 9, color: "#9a9aa3", letterSpacing: ".1em" }}>{k}</span>
      <button onClick={copy} className="mono" style={{ fontSize: 10, color: "var(--green)", letterSpacing: ".05em", background: "none", border: "none", cursor: "pointer" }}>
        {v} ⧉
      </button>
    </div>
  );
}

interface LogEntry {
  ts: string;
  kind: string;
  line: string;
}

function LogLine({ entry }: { entry: LogEntry }) {
  const colors: Record<string, string> = {
    info: "#9a9aa3", ok: "var(--green)", tx: "var(--accent)",
    warn: "var(--gold)", rx: "#c9962f", err: "var(--danger)",
  };
  const sigil: Record<string, string> = {
    info: "·", ok: "✓", tx: "◆", warn: "!", rx: "←", err: "×",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "62px 14px 1fr", gap: 6, padding: "2px 0" }}>
      <span style={{ color: "#3a3a48" }}>{entry.ts}</span>
      <span style={{ color: colors[entry.kind] || "#9a9aa3" }}>{sigil[entry.kind] || "·"}</span>
      <span style={{ color: "#dadbde", wordBreak: "break-all" }}>{entry.line}</span>
    </div>
  );
}

// ── State Strip ─────────────────────────────────────────────────────────

interface StateStripProps {
  state: VisualState;
  t: (zh: string, en: string) => string;
}

function StateStrip({ state, t }: StateStripProps) {
  const cur = STATE_STRIP_SEQ.indexOf(state === "drafting" ? "committing" : state);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATE_STRIP_SEQ.length}, 1fr)`, gap: 1, background: "var(--d-line)", borderBottom: "1px solid var(--d-line-2)" }}>
      {STATE_STRIP_SEQ.map((s, i) => {
        const active = i === cur;
        const done = i < cur || state === "settled";
        const accent = s === "settled" ? "var(--green)" : "var(--accent)";
        const c = active ? accent : done ? "#9a9aa3" : "#3a3a48";
        return (
          <div key={s} style={{ background: "var(--d-bg)", padding: "10px 14px", position: "relative", overflow: "hidden" }}>
            {active && (
              <span style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, ${accent} 0 8px, transparent 8px 16px)`, opacity: 0.06 }} />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: ".15em", color: c }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".12em", color: c, fontWeight: active ? 600 : 400 }}>
                {VISUAL_LABELS[s]}
              </span>
              {active && (
                <span style={{ flex: 1, textAlign: "right", color: accent, animation: "ink-pulse 1.4s infinite", fontSize: 10 }}>●</span>
              )}
              {done && !active && (
                <span style={{ flex: 1, textAlign: "right", color: "#9a9aa3", fontSize: 10 }}>✓</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Party Box ───────────────────────────────────────────────────────────

interface PartyBoxProps {
  label: string;
  addr: string;
  assetLabel: string;
  locked: boolean;
  done: boolean;
}

function PartyBox({ label, addr, assetLabel, locked, done }: PartyBoxProps) {
  const c = done ? "var(--green)" : locked ? "var(--accent)" : "#5a5a63";
  return (
    <div style={{ padding: "18px 22px", border: `1px solid ${locked || done ? c : "var(--d-line-2)"}`, background: locked ? "rgba(226,80,43,.05)" : done ? "rgba(31,111,62,.08)" : "var(--d-bg-3)", transition: "all .35s" }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: ".22em", color: c, marginBottom: 6 }}>
        {locked ? "● " : "○ "}{label}
      </div>
      <div className="mono" style={{ fontSize: 11, color: "#9a9aa3", marginBottom: 10 }}>{addr}</div>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 30, fontWeight: 300, color: "#f4f1ea", letterSpacing: "-.02em", lineHeight: 1 }}>
        {assetLabel}
      </div>
      <div style={{ marginTop: 10, height: 3, background: "#1f1f28", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(45deg, ${c} 0 5px, transparent 5px 10px)`, opacity: locked || done ? 0.7 : 0, transition: "opacity .4s" }} />
      </div>
    </div>
  );
}

// ── Flow Connector ──────────────────────────────────────────────────────

function FlowConnector({ state }: { state: VisualState }) {
  const symbols: Record<string, string> = {
    idle: "· ·", drafting: "~ ~", committing: "→", waiting_accept: "◇",
    both_pending: "⊘ ⊘", proving: "∿ ∿", executing: "⇌", settled: "✓",
  };
  const c = state === "settled" ? "var(--green)"
    : ["waiting_accept", "both_pending", "proving", "executing"].includes(state) ? "var(--accent)"
    : "#3a3a48";
  return (
    <div style={{ minWidth: 80, textAlign: "center" }}>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 32, color: c, letterSpacing: ".1em", transition: "color .4s" }}>
        {symbols[state] || "·"}
      </div>
    </div>
  );
}

// ── Stage panels ───────────────────────────────────────────────────────

function StagePlaceholder({ t, message }: { t: (zh: string, en: string) => string; message?: string }) {
  return (
    <div style={{ padding: "80px 0", textAlign: "center", border: "1px dashed var(--d-line-2)", color: "#3a3a48" }}>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 24, color: "#5a5a63", letterSpacing: "-.01em" }}>
        {message || t("填写左侧订单，提交意向。", "Draft the order on the left and submit.")}
      </div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "#3a3a48", marginTop: 10 }}>STATE · IDLE</div>
    </div>
  );
}

function StageHashing({ t }: { t: (zh: string, en: string) => string }) {
  return (
    <div style={{ padding: "40px 30px", border: "1px solid var(--accent)", background: "rgba(226,80,43,.05)", textAlign: "center" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--accent)", marginBottom: 16 }}>SHA-256 · 120 BYTE INPUT</div>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 28, color: "#f4f1ea", letterSpacing: "-.01em" }}>
        {t("正在计算承诺哈希", "Hashing commitment")}<span className="cursor" />
      </div>
    </div>
  );
}

function StageCommitting({ hash, t }: { hash: string; t: (zh: string, en: string) => string }) {
  return (
    <div style={{ padding: 30, border: "1px solid var(--accent)", background: "rgba(226,80,43,.05)" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--accent)", marginBottom: 12 }}>BROADCASTING · initiate_commit</div>
      <div className="mono" style={{ fontSize: 13, color: "#f4f1ea", wordBreak: "break-all", background: "var(--d-bg-3)", padding: 14, border: "1px dashed var(--d-line-2)" }}>
        {hash || "computing..."}
      </div>
      <div className="mono" style={{ fontSize: 10, color: "#5a5a63", letterSpacing: ".15em", marginTop: 10 }}>· landing on Solana ·</div>
    </div>
  );
}

function StageWaiting({ hash, slot, countdown, expiry, t }: { hash: string; slot: string; countdown: number; expiry: number; t: (zh: string, en: string) => string }) {
  const pct = expiry > 0 ? countdown / expiry : 0;
  const danger = pct < 0.3;
  return (
    <div style={{ padding: 30, border: `1px solid ${danger ? "var(--danger)" : "var(--gold)"}`, background: "rgba(201,150,47,.06)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, height: 3, width: `${Math.max(0, pct) * 100}%`, background: danger ? "var(--danger)" : "var(--gold)", transition: "all .1s" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <CountdownRing duration={expiry} running={true} size={140} label={t("意向有效", "INIT EXPIRES")} sublabel="ON-CHAIN" />
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: danger ? "var(--danger)" : "var(--gold)", marginBottom: 8 }}>WAITING_ACCEPT</div>
          <div className="serif" style={{ fontStyle: "italic", fontSize: 24, color: "#f4f1ea", marginBottom: 14, letterSpacing: "-.01em" }}>
            {t("对手方正在验证哈希…", "Counterparty verifying hash…")}
          </div>
          <div style={{ fontSize: 12.5, color: "#9a9aa3", lineHeight: 1.55 }}>
            {t(
              "B 已通过链下信道收到明文金额。本地重算 SHA-256 并与链上 commit_slot.commitment_hash 比对。一旦通过，即可提交 accept_commit。",
              "B received the plaintext amount via off-chain channel, recomputes SHA-256 locally, and compares to the on-chain commit_slot.commitment_hash. Once matched, it may submit accept_commit."
            )}
          </div>
          <div className="mono" style={{ fontSize: 10, marginTop: 14, color: "#5a5a63", letterSpacing: ".1em" }}>
            slot · {slot || "—"}<br />hash · {hash || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageBothPending({ countdown, t }: { countdown: number; t: (zh: string, en: string) => string }) {
  return (
    <div style={{ padding: 30, border: "1px solid var(--accent)", background: "rgba(226,80,43,.08)", display: "flex", gap: 32, alignItems: "center" }}>
      <CountdownRing duration={120} running={true} size={140} label={t("执行窗口", "EXEC WINDOW")} sublabel="DUAL-LOCK" />
      <div style={{ flex: 1 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--accent)", marginBottom: 8 }}>BOTH_PENDING · SYMMETRIC LOCK</div>
        <div className="serif" style={{ fontStyle: "italic", fontSize: 28, color: "#f4f1ea", letterSpacing: "-.01em", lineHeight: 1.15 }}>
          {t("双方余额已对称冻结。", "Both balances are frozen, symmetrically.")}
        </div>
        <div style={{ fontSize: 13, color: "#9a9aa3", marginTop: 8, lineHeight: 1.5 }}>
          {t(
            "期权窗口归零。120 秒内必须提交双证明，否则任一方可调用 cancel_mutual 解锁。",
            "The option window is zero. Within 120s both proofs must arrive, or either side may call cancel_mutual."
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProverGrid ──────────────────────────────────────────────────────────

interface ProverGridProps {
  party: string;
  label: string;
  pct: number;
}

function ProverGrid({ party, label, pct }: ProverGridProps) {
  const COLS = 48, ROWS = 6, TOT = COLS * ROWS;
  const lit = Math.floor(TOT * pct);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "var(--accent)" }}>● PARTY {party}</span>
        <span className="mono" style={{ fontSize: 9, color: "#5a5a63" }}>{label}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 2 }}>
        {Array.from({ length: TOT }).map((_, i) => (
          <span key={i} style={{ height: 4, background: i < lit ? "var(--accent)" : "#1f1f28", justifySelf: "stretch", transition: "background .1s" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: ".12em", color: "#5a5a63" }}>{Math.floor(12778 * pct).toLocaleString()} / 12,778</span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--accent)" }}>{(pct * 4).toFixed(1)}s</span>
      </div>
    </div>
  );
}

function StageProving({ proofPctA, proofPctB, countdown, t }: { proofPctA: number; proofPctB: number; countdown: number; t: (zh: string, en: string) => string }) {
  return (
    <div style={{ padding: "24px 26px", border: "1px solid var(--accent)", background: "var(--d-bg-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--accent)" }}>PROVING · GROTH16 · BN254</span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".15em", color: "var(--gold)" }}>EXEC IN {countdown.toFixed(1)}s</span>
      </div>
      <ProverGrid party="A" label="proof_a · 12,778 cnstr" pct={proofPctA} />
      <div style={{ height: 10 }} />
      <ProverGrid party="B" label="proof_b · 12,778 cnstr" pct={proofPctB} />
    </div>
  );
}

function StageExecuting({ t }: { t: (zh: string, en: string) => string }) {
  return (
    <div style={{ padding: 30, border: "1px solid var(--green)", background: "rgba(31,111,62,.1)", textAlign: "center" }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--green)", marginBottom: 14 }}>execute_settle · ~400K CU</div>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 28, color: "#f4f1ea", letterSpacing: "-.01em" }}>
        {t("双证落定…", "Both proofs landing…")}<span className="cursor" />
      </div>
    </div>
  );
}

function StageSettled({ commitSlotId, commitmentHash, settlementTxs, lastTxHash, t }: {
  commitSlotId: string;
  commitmentHash: string;
  settlementTxs: { txCreateProof: string; txsWriteProof: string[]; txExecute: string } | null;
  lastTxHash: string;
  t: (zh: string, en: string) => string;
}) {
  const SOLSCAN = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`;
  const truncTx = (s: string) => s.length > 20 ? s.slice(0, 8) + "…" + s.slice(-6) : s;

  const allTxs: { label: string; sig: string }[] = [
    { label: "INITIATE", sig: lastTxHash },
    { label: "CREATE_PROOF", sig: settlementTxs?.txCreateProof || "" },
    ...(settlementTxs?.txsWriteProof || []).map((sig, i) => ({ label: `WRITE_CHUNK_${i}`, sig })),
    { label: "EXECUTE_SETTLE", sig: settlementTxs?.txExecute || "" },
  ].filter(x => x.sig);

  return (
    <div style={{ padding: "24px 28px", border: "1px solid var(--green)", background: "rgba(31,111,62,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "var(--green)" }}>✓ SETTLED · ATOMIC · IRREVERSIBLE</div>
      </div>
      <div className="serif" style={{ fontStyle: "italic", fontSize: 36, color: "#f4f1ea", letterSpacing: "-.025em", lineHeight: 1.1, marginBottom: 16 }}>
        {t("结算完成。", "Settled.")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", color: "#9a9aa3" }}>
        <div>
          <div style={{ color: "#5a5a63", fontSize: 9, letterSpacing: ".18em", marginBottom: 3 }}>COMMIT_SLOT</div>
          <div style={{ color: "#f4f1ea", wordBreak: "break-all" }}>{commitSlotId || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#5a5a63", fontSize: 9, letterSpacing: ".18em", marginBottom: 3 }}>EXECUTE_TX</div>
          <div style={{ color: "#f4f1ea", wordBreak: "break-all" }}>{settlementTxs?.txExecute || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#5a5a63", fontSize: 9, letterSpacing: ".18em", marginBottom: 3 }}>COMMITMENT</div>
          <div style={{ color: "#f4f1ea", wordBreak: "break-all" }}>{commitmentHash || "—"}</div>
        </div>
        <div>
          <div style={{ color: "#5a5a63", fontSize: 9, letterSpacing: ".18em", marginBottom: 3 }}>PROOF_TXS</div>
          <div style={{ color: "var(--green)", wordBreak: "break-all" }}>{settlementTxs?.txsWriteProof?.length || 0} chunks + 1 create</div>
        </div>
      </div>

      {/* Transaction list with Solscan links */}
      <div style={{ marginTop: 20, borderTop: "1px solid rgba(31,111,62,.25)", paddingTop: 14 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", color: "#5a5a63", marginBottom: 10 }}>
          {t("交易记录 · 点击查看 Solscan", "TRANSACTION LEDGER · CLICK TO VIEW ON SOLSCAN")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {allTxs.map((tx, i) => (
            <a
              key={i}
              href={SOLSCAN(tx.sig)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "6px 10px", borderRadius: 3,
                background: "rgba(31,111,62,.06)", border: "1px solid rgba(31,111,62,.15)",
                textDecoration: "none", color: "inherit",
                transition: "background .15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(31,111,62,.18)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(31,111,62,.06)"; }}
            >
              <span className="mono" style={{ fontSize: 9, letterSpacing: ".15em", color: "var(--green)", minWidth: 100 }}>{tx.label}</span>
              <span className="mono" style={{ fontSize: 11, color: "#c8c8d0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.sig}</span>
              <span className="mono" style={{ fontSize: 9, color: "#5a5a63" }}>⧉</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Center Stage ────────────────────────────────────────────────────────

interface CenterStageProps {
  state: VisualState;
  countdown: number;
  proofPctA: number;
  proofPctB: number;
  commitSlotId: string;
  commitmentHash: string;
  settlementTxs: { txCreateProof: string; txsWriteProof: string[]; txExecute: string } | null;
  amount: string;
  mintA: string;
  mintB: string;
  counterparty: string;
  expiry: number;
  error: string | null;
  lastTxHash: string;
  t: (zh: string, en: string) => string;
}

function CenterStage({
  state, countdown, proofPctA, proofPctB,
  commitSlotId, commitmentHash, settlementTxs,
  amount, mintA, mintB, counterparty, expiry, error, lastTxHash,
  t,
}: CenterStageProps) {
  const aLocked = ["waiting_accept", "both_pending", "proving", "executing"].includes(state);
  const bLocked = ["both_pending", "proving", "executing"].includes(state);
  const myAddr = "YOU";

  return (
    <div>
      {/* Two parties + flow */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 24, alignItems: "center", marginBottom: 32 }}>
        <PartyBox
          label="A · YOU"
          addr={myAddr}
          assetLabel={`${parseFloat(amount || "0").toLocaleString()} ${truncatePk(mintA)}`}
          locked={aLocked}
          done={state === "settled"}
        />
        <FlowConnector state={state} />
        <PartyBox
          label="B · COUNTERPARTY"
          addr={truncatePk(counterparty)}
          assetLabel={truncatePk(mintB)}
          locked={bLocked}
          done={state === "settled"}
        />
      </div>

      {/* state-specific panel */}
      {state === "idle" && (
        <StagePlaceholder
          t={t}
          message={error ? `Error: ${error}` : undefined}
        />
      )}
      {state === "drafting" && <StageHashing t={t} />}
      {state === "committing" && <StageCommitting hash={commitmentHash} t={t} />}
      {state === "waiting_accept" && (
        <StageWaiting hash={commitmentHash} slot={commitSlotId} countdown={countdown} expiry={expiry} t={t} />
      )}
      {state === "both_pending" && <StageBothPending countdown={countdown} t={t} />}
      {state === "proving" && (
        <StageProving proofPctA={proofPctA} proofPctB={proofPctB} countdown={countdown} t={t} />
      )}
      {state === "executing" && <StageExecuting t={t} />}
      {state === "settled" && (
        <StageSettled commitSlotId={commitSlotId} commitmentHash={commitmentHash} settlementTxs={settlementTxs} lastTxHash={lastTxHash} t={t} />
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function TraderTerminal({ lang, setLang }: TraderTerminalProps) {
  const t = (zh: string, en: string) => lang === "zh" ? zh : en;
  const navigate = useNavigate();

  // ── Real backend ────────────────────────────────────────────────────
  const { program, wallet, publicKey } = useAnchorContext();
  const schemeB = useSchemeB(program, wallet);

  // ── Local form state ────────────────────────────────────────────────
  const [amount, setAmount] = useState("1000000");
  const [mintA, setMintA] = useState("B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw");
  const [mintB, setMintB] = useState("Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k");
  const [counterparty, setCounterparty] = useState("");
  const [expiry, setExpiry] = useState(55);

  // ── Proof animation state ───────────────────────────────────────────
  const [proofPctA, setProofPctA] = useState(0);
  const [proofPctB, setProofPctB] = useState(0);

  // ── Parsed log entries for console ──────────────────────────────────
  const [parsedLogs, setParsedLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // ── Visual state from hook ──────────────────────────────────────────
  const visualState: VisualState = SCHEME_TO_VISUAL[schemeB.initiatorState] || "idle";
  const isRunning = visualState !== "idle" && visualState !== "settled";

  // ── Wallet display ──────────────────────────────────────────────────
  const walletDisplay = publicKey ? truncatePk(publicKey.toBase58()) : "—";

  // ── Devnet test mints ─────────────────────────────────────────────
  const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
  const DEVNET_SOL = "So11111111111111111111111111111111111111112";

  // ── Parse schemeB.logs into LogEntry[] ──────────────────────────────
  useEffect(() => {
    const entries: LogEntry[] = schemeB.logs.map((raw) => {
      // Raw format: "[HH:MM:SS] message"
      const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (match) {
        const msg = match[2];
        let kind = "info";
        if (msg.includes("✓") || msg.includes("complete") || msg.includes("Settled") || msg.includes("committed") || msg.includes("confirmed")) kind = "ok";
        if (msg.includes("TX:") || msg.includes("Submitting") || msg.includes("Creating") || msg.includes("Writing") || msg.includes("Executing")) kind = "tx";
        if (msg.includes("warn") || msg.includes("expired") || msg.includes("Timeout")) kind = "warn";
        if (msg.includes("Error") || msg.includes("MISMATCH")) kind = "err";
        return { ts: match[1], kind, line: msg };
      }
      return { ts: "", kind: "info", line: raw };
    });
    setParsedLogs(entries);
  }, [schemeB.logs]);

  // ── Auto-scroll console ─────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [parsedLogs]);

  // ── Proof animation via rAF ─────────────────────────────────────────
  useEffect(() => {
    if (visualState !== "proving") {
      setProofPctA(0);
      setProofPctB(0);
      return;
    }

    let pa = 0;
    let pb = 0;
    let rafId: number;

    const animate = () => {
      pa = Math.min(1, pa + 0.004 + Math.random() * 0.003);
      pb = Math.min(1, pb + 0.0035 + Math.random() * 0.003);
      setProofPctA(pa);
      setProofPctB(pb);
      if (pa < 1 || pb < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [visualState]);

  // ── Initiate handler ────────────────────────────────────────────────
  const handleInitiate = useCallback(async () => {
    if (!counterparty) return;
    try {
      await schemeB.initiate(
        counterparty,
        mintB,
        BigInt(amount),
        mintA,
      );
    } catch {
      // Error already captured by hook
    }
  }, [schemeB, counterparty, amount, mintA, mintB]);

  // ── Accept handler (demo) ───────────────────────────────────────────
  const handleSimAccept = useCallback(async () => {
    try {
      await schemeB.verifyAndAccept(BigInt(amount));
    } catch {
      // Error already captured by hook
    }
  }, [schemeB, amount]);

  // ── Execute handler ─────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    try {
      await schemeB.executeSettlement();
    } catch {
      // Error already captured by hook
    }
  }, [schemeB]);

  // ── Cancel / Abort handler ──────────────────────────────────────────
  const handleAbort = useCallback(async () => {
    try {
      const st = schemeB.initiatorState;
      if (st === "WAITING_ACCEPT" || st === "TIMEOUT_EXPIRED" || st === "ERROR") {
        await schemeB.cancelInitiate();
      } else if (st === "BOTH_LOCKED" || st === "GENERATING_PROOF") {
        await schemeB.cancelMutual();
      }
    } catch {
      // Error already captured by hook
    }
  }, [schemeB]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="dark" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Top rail ──────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 36px", display: "flex", alignItems: "center", gap: 20, borderBottom: "1px solid var(--d-line-2)", background: "var(--d-bg-2)" }}>
        <NexumSeal size={28} dark />
        <Wordmark dark sub="TRADER · TERMINAL" />
        <span style={{ width: 1, height: 14, background: "var(--d-line-2)" }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: ".2em", color: "var(--accent)" }}>
          ● TRADER · {walletDisplay}
        </span>
        <div style={{ flex: 1 }} />
        <Slot dark />
        <span style={{ width: 1, height: 14, background: "var(--d-line-2)" }} />
        <button
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="mono"
          style={{ fontSize: 11, letterSpacing: ".15em", color: "#f4f1ea", background: "none", border: "none", cursor: "pointer" }}
        >
          {lang === "zh" ? "EN" : "中"}
        </button>
        <button
          onClick={() => navigate("/maker")}
          className="btn"
          style={{ padding: "8px 14px", fontSize: 10, borderColor: "#f4f1ea", color: "#f4f1ea" }}
        >
          MAKER →
        </button>
      </div>

      {/* ── State strip ───────────────────────────────────────────────── */}
      <StateStrip state={visualState} t={t} />

      {/* ── Main 3-column grid ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "380px 1fr 460px", gap: 1, background: "var(--d-line)", minHeight: 0 }}>

        {/* ── LEFT — Order Ticket ──────────────────────────────────────── */}
        <div style={{ background: "var(--d-bg)", padding: "24px 26px", overflowY: "auto" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "#9a9aa3", marginBottom: 14 }}>I · ORDER TICKET</div>
          <div className="serif" style={{ fontStyle: "italic", fontSize: 24, color: "#f4f1ea", marginBottom: 24, letterSpacing: "-.01em", lineHeight: 1.2 }}>
            {t("协商条款，提交意向。", "Draft terms, submit intent.")}
          </div>

          <FormField label={t("转移金额", "TRANSFER AMOUNT")} disabled={isRunning}>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isRunning}
              placeholder="1000000"
              style={inpStyle}
            />
          </FormField>

          <FormField label={t("甲方 Mint 地址 (你付出)", "MINT A — YOU PAY")} disabled={isRunning}>
            <input
              value={mintA}
              onChange={(e) => setMintA(e.target.value)}
              disabled={isRunning}
              placeholder="B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw"
              style={inpStyle}
            />
          </FormField>

          <FormField label={t("乙方 Mint 地址 (你收到)", "MINT B — YOU RECEIVE")} disabled={isRunning}>
            <input
              value={mintB}
              onChange={(e) => setMintB(e.target.value)}
              disabled={isRunning}
              placeholder="Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k"
              style={inpStyle}
            />
          </FormField>

          <FormField label={t("对手方公钥", "COUNTERPARTY PUBKEY")} disabled={isRunning}>
            <input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              disabled={isRunning}
              placeholder="Solana pubkey..."
              style={inpStyle}
            />
          </FormField>

          <FormField label={t("意向有效期 (秒)", "EXPIRY (SECONDS)")} disabled={isRunning}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="range"
                min={30}
                max={60}
                value={expiry}
                onChange={(e) => setExpiry(+e.target.value)}
                disabled={isRunning}
                style={{ flex: 1 }}
              />
              <span className="mono" style={{ fontSize: 14, color: "var(--accent)", width: 40, textAlign: "right" }}>{expiry}s</span>
            </div>
          </FormField>

          <div style={{ marginTop: 24, padding: "14px 16px", border: "1px solid var(--d-line-2)", background: "var(--d-bg-3)" }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", color: "#5a5a63", marginBottom: 8 }}>EST. COSTS</div>
            <Row k={t("CommitSlot 租金", "slot rent")} v="0.0014 SOL" sub={t("execute 后回收", "refunded on exec")} />
            <Row k="initiate gas" v="~0.0005 SOL" />
            <Row k="execute gas" v="~0.0022 SOL" />
            <Row k={t("总计预估", "total est.")} v="~0.0027 SOL" highlight />
          </div>

          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            {visualState === "error" && schemeB.error && (
              <div className="mono" style={{ fontSize: 11, color: "var(--danger)", padding: "8px 12px", border: "1px solid var(--danger)", borderRadius: 4, wordBreak: "break-all" }}>
                {schemeB.error}
              </div>
            )}
            {visualState === "idle" || visualState === "settled" || visualState === "error" ? (
              <>
                <button
                  onClick={handleInitiate}
                  className="btn accent lg"
                  style={{ width: "100%", justifyContent: "center" }}
                  disabled={!counterparty || !amount}
                >
                  {visualState === "settled"
                    ? t("▶ 新建意向", "▶ NEW COMMITMENT")
                    : t("▶ 提交承诺", "▶ INITIATE COMMIT")}
                </button>
                {visualState === "error" && (
                  <button
                    onClick={() => schemeB.forceCancel()}
                    className="btn lg"
                    style={{ width: "100%", justifyContent: "center", borderColor: "var(--danger)", color: "var(--danger)" }}
                  >
                    ■ {t("解锁账本", "UNLOCK LEDGER")}
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleAbort}
                className="btn lg"
                style={{ width: "100%", justifyContent: "center", borderColor: "var(--danger)", color: "var(--danger)" }}
              >
                ■ {t("终止 / 取消", "ABORT / CANCEL")}
              </button>
            )}
          </div>
        </div>

        {/* ── CENTER — Settlement Stage ────────────────────────────────── */}
        <div style={{ background: "var(--d-bg-2)", padding: "24px 32px", overflowY: "auto" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "#9a9aa3", marginBottom: 14 }}>II · SETTLEMENT STAGE</div>

          <CenterStage
            state={visualState}
            countdown={schemeB.countdown}
            proofPctA={proofPctA}
            proofPctB={proofPctB}
            commitSlotId={schemeB.commitSlotId}
            commitmentHash={schemeB.commitmentHash}
            settlementTxs={schemeB.settlementTxs}
            amount={amount}
            mintA={mintA}
            mintB={mintB}
            counterparty={counterparty}
            expiry={expiry}
            error={schemeB.error}
            lastTxHash={schemeB.lastTxHash}
            t={t}
          />

          {/* Demo accept button during WAITING_ACCEPT */}
          {visualState === "waiting_accept" && (
            <div style={{ marginTop: 24, padding: "18px 20px", border: "1px dashed var(--gold)", background: "rgba(201,150,47,.08)" }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", color: "var(--gold)", marginBottom: 8 }}>DEMO CONTROL</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                <span style={{ color: "#9a9aa3", fontSize: 13 }}>
                  {t(
                    "在真实环境，对手方会通过自己的终端 accept。这里你可以模拟该动作:",
                    "In production, the counterparty would accept via their own terminal. Here you may simulate that action:"
                  )}
                </span>
                <button onClick={handleSimAccept} className="btn accent" style={{ whiteSpace: "nowrap" }}>
                  {t("▶ 模拟 B 接受", "▶ SIM B ACCEPT")}
                </button>
              </div>
            </div>
          )}

          {/* Execute button during BOTH_LOCKED */}
          {visualState === "both_pending" && (
            <div style={{ marginTop: 24, padding: "18px 20px", border: "1px dashed var(--accent)", background: "rgba(226,80,43,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
                <span style={{ color: "#9a9aa3", fontSize: 13 }}>
                  {t(
                    "双锁已生效。点击执行结算，生成 ZK 证明并提交链上验证。",
                    "Dual-lock engaged. Click to generate ZK proofs and submit for on-chain verification."
                  )}
                </span>
                <button onClick={handleExecute} className="btn accent" style={{ whiteSpace: "nowrap" }}>
                  {t("▶ 执行结算", "▶ EXECUTE SETTLE")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT — Console ──────────────────────────────────────────── */}
        <div style={{ background: "var(--d-bg)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "18px 22px 12px", borderBottom: "1px solid var(--d-line-2)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: ".22em", color: "#9a9aa3" }}>III · CONSOLE</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: ".18em", color: "#5a5a63" }}>RPC · {import.meta.env.VITE_SOLANA_RPC_URL ? "custom" : "local"}</div>
          </div>
          <div
            ref={logRef}
            style={{ flex: 1, overflowY: "auto", padding: "14px 22px", fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, lineHeight: 1.65 }}
          >
            {parsedLogs.length === 0 && (
              <div style={{ color: "#3a3a48", fontStyle: "italic", padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontFamily: "Fraunces, serif", fontSize: 18, marginBottom: 8 }}>console idle</div>
                <div style={{ fontSize: 10, letterSpacing: ".15em" }}>
                  {t("提交意向后日志将出现于此", "log will appear here once commit is initiated")}
                </div>
              </div>
            )}
            {parsedLogs.map((l, i) => <LogLine key={i} entry={l} />)}
            {isRunning && (
              <div style={{ color: "#5a5a63" }}>$ <span className="cursor" /></div>
            )}
          </div>

          {/* Settled summary copy rows */}
          {visualState === "settled" && schemeB.settlementTxs && (
            <div style={{ padding: "14px 22px", borderTop: "1px solid var(--green)", background: "rgba(31,111,62,.1)" }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: ".2em", color: "var(--green)", marginBottom: 6 }}>✓ SETTLED · COPY THESE FOR AUDIT</div>
              <CopyRow k="commit_slot" v={schemeB.commitSlotId} />
              <CopyRow k="commitment_hash" v={schemeB.commitmentHash} />
              <CopyRow k="execute_tx" v={schemeB.settlementTxs.txExecute} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
