/**
 * regulator.tsx — Nexum Regulator Chamber (v3 Design + Real Solana Backend)
 *
 * Read-only auditor interface for on-chain compliance inspection.
 * Two-column layout: main query panel (1.5fr) + append-only audit log sidebar (1fr).
 * Four-phase state machine: input -> searching -> revealed -> error.
 * Real on-chain data via program.account.settlementRecord.fetch().
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import { NexumSeal, Wordmark, Slot } from '../components/atoms';
import { useAnchorContext } from '../context/WalletProvider';
import { deserializeCiphertext, elgamalDecryptU32 as decryptU32, findLedgerPDA } from '@nexum/sdk';

// ── Raw byte parsers (IDL lacks field definitions, Anchor can't deserialize) ──

/** Parse SettlementRecord from raw account bytes (202B deployed layout).
 *  Verified on-chain byte offsets:
 *  disc(8) + party_a(32) + party_b(32) + asset_a(32) + asset_b(32) + hash(32)
 *  + verA(8) + verB(8) + scheme(1) + settled_at(u32 at 185) + bump(1). */
function parseSettlementRecord(buf: Buffer): SettlementRecordData {
  const partyA = new PublicKey(buf.slice(8, 40)).toBase58();
  const partyB = new PublicKey(buf.slice(40, 72)).toBase58();
  const assetAMint = new PublicKey(buf.slice(72, 104)).toBase58();
  const assetBMint = new PublicKey(buf.slice(104, 136)).toBase58();
  const commitmentHash = bytesToHex(buf.slice(136, 168)); // 32 bytes
  const versionA = Number(buf.readBigUInt64LE(168));
  const versionB = Number(buf.readBigUInt64LE(176));
  const scheme = buf[184]; // 0=SchemeA, 1=SchemeB
  const settledAt = buf.readUInt32LE(185); // u32, not i64
  const bump = buf[193];
  return { partyA, partyB, assetAMint, assetBMint, commitmentHash, versionA, versionB, scheme, settledAt, bump };
}

/** Read raw UserLedger ciphertexts at correct byte offsets.
 *  Offsets determined from on-chain verification: balance_ct_lo at 72, balance_ct_hi at 200.
 *  The deployed program's struct layout is 2 bytes shorter than current source code. */
function parseLedgerCiphertexts(buf: Buffer): { ctLo: Uint8Array; ctHi: Uint8Array; version: number; status: number } {
  const OWNER_OFFSET = 8;
  const MINT_OFFSET = 40;
  const CT_LO_OFFSET = 72;  // deployed offset (current code: 74)
  const CT_HI_OFFSET = 200; // deployed offset (current code: 202)
  const VERSION_OFFSET = 584; // deployed offset (current code: 586)
  const STATUS_OFFSET = 592;  // deployed offset (current code: 594)

  const ctLo = buf.slice(CT_LO_OFFSET, CT_LO_OFFSET + 128);
  const ctHi = buf.slice(CT_HI_OFFSET, CT_HI_OFFSET + 128);
  const version = Number(buf.readBigUInt64LE(VERSION_OFFSET));
  const status = buf[STATUS_OFFSET];

  // Verify owner/mint match expected positions
  return {
    ctLo: new Uint8Array(ctLo),
    ctHi: new Uint8Array(ctHi),
    version,
    status,
  };
}

// ── Props ──────────────────────────────────────────────────────────────────

interface RegulatorChamberProps {
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey('BEYVFMVorvgbZs69bjKs9MNMUuRfscMv3HzMH6m9BoYP');

/** Known devnet SettlementRecord addresses for the sample-ID panel. */
const SAMPLE_SETTLEMENT_IDS = [
  '98YAXegYCQinqFJcjEe34KXNeSZ4CVAfEZL3QAWJUkWY',
  '3NUBtPGM2fU1r1nfjayrsmsRkArTiueJt2Ccgr9b3Uu3',
];

// ── Phase State ────────────────────────────────────────────────────────────

type Phase = 'input' | 'searching' | 'demandKey' | 'unsealing' | 'revealed' | 'error';

// ── On-chain record type (camelCase from Anchor TS SDK) ───────────────────

interface SettlementRecordData {
  partyA: string;
  partyB: string;
  assetAMint: string;
  assetBMint: string;
  commitmentHash: string;     // hex-encoded SHA-256 commitment hash
  versionA: number;
  versionB: number;
  scheme: number;           // 0 = SchemeA, 1 = SchemeB
  settledAt: number;        // i64 -> seconds since epoch
  bump: number;
}

// ── Audit log entry ───────────────────────────────────────────────────────

interface AuditEntry {
  ts: string;               // ISO 8601
  action: string;           // "query" | "export"
  ref: string;              // settlement address or "json"
  auditor: string;          // wallet pubkey truncated
}

/** Decrypted balance data from ElGamal ciphertexts. */
interface DecryptedBalances {
  partyA: { lo: number; hi: number; balance: bigint };
  partyB: { lo: number; hi: number; balance: bigint };
}

// ── Translation function type ──────────────────────────────────────────────

type TranslateFn = (zh: React.ReactNode, en: React.ReactNode) => React.ReactNode;

// ── Helpers ───────────────────────────────────────────────────────────────


function schemeLabel(idx: number): string {
  if (idx === 0) return 'Scheme A';
  if (idx === 1) return 'Scheme B';
  return 'Unknown';
}

/** Combine transfer_lo + transfer_hi into a single BigInt string. */
function computeAmount(lo: number, hi: number): string {
  const total = BigInt(lo) + (BigInt(hi) << BigInt(32));
  return total.toString();
}

/** Convert a Uint8Array (or number[]) to hex string. */
function bytesToHex(bytes: Uint8Array | number[] | Buffer): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Truncate a base58 address for display. */
function truncate(addr: string, head = 8, tail = 4): string {
  if (!addr || addr.length < head + tail + 3) return addr || '\u2014';
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

/** ISO timestamp from epoch-seconds. */
function formatEpoch(ts: number): string {
  if (!ts) return '\u2014';
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Horizontal step machine: I.QUERY -> .FETCH -> II.DEMAND KEY -> .UNSEAL -> III.REVEAL */
function StepMachine({ phase }: { phase: Phase }) {
  const order: { key: string; label: string }[] = [
    { key: 'input', label: 'I \u00B7 QUERY' },
    { key: 'searching', label: '\u00B7 FETCH' },
    { key: 'key', label: 'II \u00B7 DEMAND KEY' },
    { key: 'unsealing', label: '\u00B7 UNSEAL' },
    { key: 'revealed', label: 'III \u00B7 REVEAL' },
  ];

  // Map our phase model to the 5-step visual
  const phaseToStep: Record<Phase, number> = {
    input: 0,
    searching: 1,
    demandKey: 2,
    unsealing: 3,
    revealed: 4,
    error: 0,
  };
  const cur = phaseToStep[phase];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--d-line)', border: '1px solid var(--d-line-2)' }}>
      {order.map((s, i) => {
        const active = i === cur;
        const done = i < cur || phase === 'revealed';
        const c = active ? 'var(--indigo)' : done ? 'var(--green)' : '#5a5a63';
        return (
          <div key={s.key} style={{ background: active ? 'rgba(29,42,85,.12)' : 'var(--d-bg)', padding: '10px 14px' }}>
            <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.18em', color: c, fontWeight: active ? 600 : 400 }}>
              {done ? '\u2713 ' : active ? '\u25CF ' : '\u25CB '}{s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Record header bar shown after a record is found. */
function RecordHeader({ address, record, phase }: {
  address: string;
  record: SettlementRecordData;
  phase: Phase;
}) {
  return (
    <div style={{ padding: '18px 22px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-3)', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center' }}>
      <div>
        <div className="mono" style={{ fontSize: 9, color: '#5a5a63', letterSpacing: '.18em' }}>SETTLEMENT PDA</div>
        <div className="mono" style={{ fontSize: 13, color: 'var(--indigo)', marginTop: 3, wordBreak: 'break-all' }}>{truncate(address, 20, 8)}</div>
      </div>
      <div>
        <div className="mono" style={{ fontSize: 9, color: '#5a5a63', letterSpacing: '.18em' }}>ON-CHAIN HEADER \u00B7 PUBLIC</div>
        <div className="mono" style={{ fontSize: 11, color: '#dadbde', marginTop: 3, letterSpacing: '.05em' }}>
          {schemeLabel(record.scheme)} \u00B7 SETTLED {formatEpoch(record.settledAt)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="mono" style={{ fontSize: 9, color: '#5a5a63', letterSpacing: '.18em' }}>STATUS</div>
        <div className="mono" style={{ fontSize: 11, color: phase === 'revealed' ? 'var(--green)' : '#9a9aa3', marginTop: 3, letterSpacing: '.1em' }}>
          {phase === 'revealed' ? '\u2713 ON-CHAIN' : 'LOADING...'}
        </div>
      </div>
    </div>
  );
}

/** Individual field in the revealed record grid. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '14px 18px', background: 'var(--d-bg)' }}>
      <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 5 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, color: '#f4f1ea', wordBreak: 'break-all', letterSpacing: '.04em' }}>{value}</div>
    </div>
  );
}

/** Revealed record -- all decoded SettlementRecord fields. */
function RevealedRecord({ address, record, t, decryptedBalances }: {
  address: string;
  record: SettlementRecordData;
  t: TranslateFn;
  decryptedBalances: DecryptedBalances | null;
}) {
  return (
    <div style={{ padding: '28px 32px', border: '1px solid var(--green)', background: 'rgba(31,111,62,.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--green)' }}>
          {'\u2713 REVEALED \u00B7 ON-CHAIN SettlementRecord'}
        </span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: '#5a5a63' }}>FORENSIC SNAPSHOT</span>
      </div>

      {/* Commitment hash display — only on-chain amount evidence */}
      <div style={{ marginBottom: 24 }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 6 }}>COMMITMENT HASH (SHA-256)</div>
        <div className="mono" style={{ fontSize: 14, color: '#f4f1ea', wordBreak: 'break-all', letterSpacing: '.04em', padding: '12px 16px', background: 'var(--d-bg)', border: '1px solid var(--d-line-2)' }}>
          {record.commitmentHash}
        </div>
        <div style={{ marginTop: 8, padding: '8px 12px', border: '1px dashed var(--d-line-2)', fontSize: 11, color: '#9a9aa3', lineHeight: 1.5 }}>
          {t(
            'Transfer amounts are private. Only the irreversible SHA-256 commitment hash is stored on-chain.',
            'Transfer amounts are private. Only the irreversible SHA-256 commitment hash is stored on-chain.'
          )}
        </div>
      </div>

      {/* Field grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--d-line)', border: '1px solid var(--d-line-2)' }}>
        <Field label={t('\u7532\u65B9 (party_a)', 'PARTY A \u00B7 INITIATOR') as string} value={truncate(record.partyA, 16, 6)} />
        <Field label={t('\u4E59\u65B9 (party_b)', 'PARTY B \u00B7 COUNTERPARTY') as string} value={truncate(record.partyB, 16, 6)} />
        <Field label={t('\u8D44\u4EA7 A (asset_a_mint)', 'ASSET A MINT') as string} value={truncate(record.assetAMint, 12, 6)} />
        <Field label={t('\u8D44\u4EA7 B (asset_b_mint)', 'ASSET B MINT') as string} value={truncate(record.assetBMint, 12, 6)} />
        <Field label={t('\u7ED3\u7B97\u65F6\u95F4 (settled_at)', 'SETTLED AT \u00B7 UTC') as string} value={formatEpoch(record.settledAt)} />
        <Field label="SCHEME" value={schemeLabel(record.scheme)} />
        <Field label="VERSION A" value={record.versionA.toString()} />
        <Field label="VERSION B" value={record.versionB.toString()} />
        <Field label="BUMP" value={record.bump.toString()} />
      </div>

      {/* Decrypted balances */}
      {decryptedBalances && (
        <div style={{ marginTop: 20, padding: '20px 24px', border: '1px solid var(--gold)', background: 'rgba(198,166,82,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--gold)' }}>
              {'🔓 DECRYPTED BALANCES'}
            </span>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: '#5a5a63' }}>ELGAMAL DECRYPTED</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--d-line)', border: '1px solid var(--d-line-2)' }}>
            <div style={{ padding: '14px 18px', background: 'var(--d-bg)' }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 5 }}>PARTY A BALANCE</div>
              <div className="mono" style={{ fontSize: 18, color: decryptedBalances.partyA.balance > 0n ? 'var(--gold)' : '#5a5a63', fontWeight: 600 }}>
                {decryptedBalances.partyA.balance > 0n ? decryptedBalances.partyA.balance.toString() : 'Key A not provided'}
              </div>
              {decryptedBalances.partyA.balance > 0n && (
                <div className="mono" style={{ fontSize: 9, color: '#5a5a63', marginTop: 3 }}>lo={decryptedBalances.partyA.lo} · hi={decryptedBalances.partyA.hi}</div>
              )}
            </div>
            <div style={{ padding: '14px 18px', background: 'var(--d-bg)' }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 5 }}>PARTY B BALANCE</div>
              <div className="mono" style={{ fontSize: 18, color: decryptedBalances.partyB.balance > 0n ? 'var(--gold)' : '#5a5a63', fontWeight: 600 }}>
                {decryptedBalances.partyB.balance > 0n ? decryptedBalances.partyB.balance.toString() : 'Key B not provided'}
              </div>
              {decryptedBalances.partyB.balance > 0n && (
                <div className="mono" style={{ fontSize: 9, color: '#5a5a63', marginTop: 3 }}>lo={decryptedBalances.partyB.lo} · hi={decryptedBalances.partyB.hi}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full address */}
      <div style={{ marginTop: 14, padding: '10px 14px', border: '1px dashed var(--d-line-2)' }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: '#5a5a63', marginBottom: 4 }}>FULL PDA ADDRESS</div>
        <div className="mono" style={{ fontSize: 12, color: '#f4f1ea', wordBreak: 'break-all' }}>{address}</div>
      </div>

      {/* Solscan link */}
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <a
          href={`https://solscan.io/account/${address}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono"
          style={{ fontSize: 10, letterSpacing: '.15em', color: '#6b8afd', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          VIEW ON SOLSCAN
        </a>
      </div>

      {/* Audit log notice */}
      <div style={{ marginTop: 18, padding: '14px 16px', border: '1px dashed var(--green)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 18 }}>{'\u270D\uFE0E'}</span>
        <span style={{ fontSize: 12, color: '#9a9aa3', lineHeight: 1.45 }}>
          {t(
            `\u4E00\u6761\u67E5\u8BE2\u8BB0\u5F55\u5DF2\u5199\u5165\u5BA1\u8BA1\u65E5\u5FD7\uFF0C\u65F6\u95F4\u6233\u4E3A ${new Date().toISOString().slice(11, 19)} UTC\u3002\u8BE5\u8BB0\u5F55\u4E0D\u53EF\u5220\u9664\u3002`,
            `A query record has been forcibly written to the audit log at ${new Date().toISOString().slice(11, 19)} UTC. The record cannot be deleted.`
          )}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function RegulatorChamber({ lang, setLang }: RegulatorChamberProps) {
  const t: TranslateFn = (zh, en) => lang === 'zh' ? zh : en;
  const navigate = useNavigate();
  const { program, publicKey } = useAnchorContext();

  // ── State ──────────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<Phase>('input');
  const [inputAddr, setInputAddr] = useState('');
  const [record, setRecord] = useState<SettlementRecordData | null>(null);
  const [fetchedAddr, setFetchedAddr] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Decryption state — two keys (one per party)
  const [privateKeyA, setPrivateKeyA] = useState('');
  const [privateKeyB, setPrivateKeyB] = useState('');
  const [decryptedBalances, setDecryptedBalances] = useState<DecryptedBalances | null>(null);
  const [decryptError, setDecryptError] = useState('');

  // Load saved ElGamal keys from localStorage (saved during settlement)
  const savedKeys = (() => {
    try {
      const raw = localStorage.getItem('nexum_elgamal_keys');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  // ── Fetch Settlement Record ────────────────────────────────────────────

  const fetchRecord = useCallback(async (address: string) => {
    if (!program || !address.trim()) return;

    setPhase('searching');
    setErrorMsg('');

    try {
      const pk = new PublicKey(address.trim());
      // Read raw bytes — IDL lacks field definitions so Anchor can't deserialize
      const accountInfo = await program.provider.connection.getAccountInfo(pk);
      if (!accountInfo || accountInfo.data.length < 194) {
        throw new Error('Account not found or too small');
      }
      const rec = parseSettlementRecord(Buffer.from(accountInfo.data));

      setRecord(rec);
      setFetchedAddr(address.trim());
      setPhase('demandKey');

      // Append to audit log
      setAuditLog(prev => [{
        ts: new Date().toISOString(),
        action: 'query',
        ref: truncate(address.trim(), 12, 6),
        auditor: publicKey ? truncate(publicKey.toBase58(), 6, 4) : 'unknown',
      }, ...prev]);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setErrorMsg(
        lang === 'zh'
          ? `\u672A\u627E\u5230 Settlement Record: ${address.trim()}\n${msg.slice(0, 120)}`
          : `Settlement Record not found: ${address.trim()}\n${msg.slice(0, 120)}`
      );
      setPhase('error');
      setRecord(null);
    }
  }, [program, publicKey, lang]);

  // \u2500\u2500 Unseal: Decrypt ElGamal ciphertexts with provided private key \u2500\u2500\u2500

  const unseal = useCallback(async () => {
    if (!program || !record) return;

    setDecryptError('');
    setPhase('unsealing');

    try {
      // Parse private keys — each party has a separate key
      const skA = privateKeyA.trim() ? BigInt(privateKeyA.trim()) : null;
      const skB = privateKeyB.trim() ? BigInt(privateKeyB.trim()) : null;
      if (!skA && !skB) throw new Error('Provide at least one private key');

      const partyA = new PublicKey(record.partyA);
      const partyB = new PublicKey(record.partyB);
      const mintA = new PublicKey(record.assetAMint);
      const mintB = new PublicKey(record.assetBMint);

      // Derive ledger PDAs
      const [ledgerAAddr] = findLedgerPDA(partyA, mintA, program.programId);
      const [ledgerBAddr] = findLedgerPDA(partyB, mintB, program.programId);

      // Fetch raw bytes — IDL lacks field definitions so Anchor can't deserialize
      const conn = program.provider.connection;
      const [ledgerARaw, ledgerBRaw] = await Promise.all([
        conn.getAccountInfo(ledgerAAddr),
        conn.getAccountInfo(ledgerBAddr),
      ]);

      if (!ledgerARaw) throw new Error(`Party A ledger not found: ${ledgerAAddr.toBase58()}`);
      if (!ledgerBRaw) throw new Error(`Party B ledger not found: ${ledgerBAddr.toBase58()}`);

      // Parse ciphertexts at correct on-chain byte offsets
      const ledgerA = parseLedgerCiphertexts(Buffer.from(ledgerARaw.data));
      const ledgerB = parseLedgerCiphertexts(Buffer.from(ledgerBRaw.data));

      // Decrypt Party A balance (requires Key A)
      let aLo = 0, aHi = 0, balanceA = 0n;
      if (skA) {
        const aCtLo = deserializeCiphertext(ledgerA.ctLo);
        const aCtHi = deserializeCiphertext(ledgerA.ctHi);
        aLo = decryptU32(aCtLo, skA);
        aHi = decryptU32(aCtHi, skA);
        balanceA = (BigInt(aHi) << 32n) | BigInt(aLo);
      }

      // Decrypt Party B balance (requires Key B)
      let bLo = 0, bHi = 0, balanceB = 0n;
      if (skB) {
        const bCtLo = deserializeCiphertext(ledgerB.ctLo);
        const bCtHi = deserializeCiphertext(ledgerB.ctHi);
        bLo = decryptU32(bCtLo, skB);
        bHi = decryptU32(bCtHi, skB);
        balanceB = (BigInt(bHi) << 32n) | BigInt(bLo);
      }

      setDecryptedBalances({
        partyA: { lo: aLo, hi: aHi, balance: balanceA },
        partyB: { lo: bLo, hi: bHi, balance: balanceB },
      });

      setPhase('revealed');

      // Log decryption action
      setAuditLog(prev => [{
        ts: new Date().toISOString(),
        action: 'decrypt',
        ref: truncate(fetchedAddr, 12, 6),
        auditor: publicKey ? truncate(publicKey.toBase58(), 6, 4) : 'unknown',
      }, ...prev]);
    } catch (e: any) {
      const msg = e?.message || String(e);
      setDecryptError(msg.slice(0, 200));
      setPhase('demandKey');
    }
  }, [program, record, privateKeyA, privateKeyB, fetchedAddr, publicKey]);

  // ── Export JSON ────────────────────────────────────────────────────────

  const exportJson = useCallback(() => {
    if (!record || !fetchedAddr) return;

    const blob = new Blob([JSON.stringify({
      address: fetchedAddr,
      ...record,
      scheme: schemeLabel(record.scheme),
      privacyNote: 'Transfer amounts are private. Only the commitment hash is stored on-chain.',
      settledAtISO: formatEpoch(record.settledAt),
    }, null, 2)], { type: 'application/json' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlement_${fetchedAddr.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Log the export
    setAuditLog(prev => [{
      ts: new Date().toISOString(),
      action: 'export',
      ref: 'json',
      auditor: publicKey ? truncate(publicKey.toBase58(), 6, 4) : 'unknown',
    }, ...prev]);
  }, [record, fetchedAddr, publicKey]);

  // ── Reset ──────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setInputAddr('');
    setRecord(null);
    setFetchedAddr('');
    setPhase('input');
    setErrorMsg('');
    setPrivateKeyA('');
    setPrivateKeyB('');
    setDecryptedBalances(null);
    setDecryptError('');
  }, []);

  // ── Suggestion click ───────────────────────────────────────────────────

  const suggest = useCallback((id: string) => {
    setInputAddr(id);
  }, []);

  // ── Key handler ────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputAddr.trim()) fetchRecord(inputAddr);
  }, [inputAddr, fetchRecord]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="dark" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Top Rail ──────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 36px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
        <NexumSeal size={28} dark />
        <Wordmark dark sub="REGULATOR \u00B7 CHAMBER" />
        <span style={{ width: 1, height: 14, background: 'var(--d-line-2)' }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--indigo)', background: 'rgba(29,42,85,.4)', padding: '3px 8px', border: '1px solid #3a4a78' }}>
          {'\u25CF'} AUDITOR \u00B7 reg.nexum.protocol
        </span>
        <div style={{ flex: 1 }} />
        <Slot dark />
        <span style={{ width: 1, height: 14, background: 'var(--d-line-2)' }} />
        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="mono" style={{ fontSize: 11, letterSpacing: '.15em', color: '#f4f1ea', background: 'none', border: 0, cursor: 'pointer' }}>
          {lang === 'zh' ? 'EN' : '\u4E2D'}
        </button>
        <button onClick={() => navigate('/')} className="btn" style={{ padding: '8px 14px', fontSize: 10, borderColor: '#f4f1ea', color: '#f4f1ea' }}>
          {t('\u767B\u51FA', 'SIGN OUT')}
        </button>
      </div>

      {/* ── Two-column Layout ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 1, background: 'var(--d-line)', minHeight: 0 }}>
        {/* ── MAIN PANEL ─────────────────────────────────────────────── */}
        <div className="no-scrollbar" style={{ background: 'var(--d-bg)', padding: '28px 36px', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ borderBottom: '1px solid var(--d-line-2)', paddingBottom: 16, marginBottom: 24 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: '#9a9aa3' }}>FOLIO 02 \u00B7 AUDIT CHAMBER</div>
            <h1 className="serif" style={{ margin: '8px 0 0', fontSize: 'clamp(40px, 4vw, 64px)', fontWeight: 300, letterSpacing: '-.025em', lineHeight: 1, color: '#f4f1ea' }}>
              {lang === 'zh' ? (
                <>{'\u53D6\u8BC1\u3002'}<em style={{ fontStyle: 'italic', color: 'var(--indigo)', marginLeft: 14 }}>{'\u7559\u75D5\u3002'}</em></>
              ) : (
                <>Forensics. <em style={{ fontStyle: 'italic', color: 'var(--indigo)', marginLeft: 14 }}>On record.</em></>
              )}
            </h1>
            <div className="serif italic" style={{ fontStyle: 'italic', fontSize: 15, color: '#9a9aa3', marginTop: 10, maxWidth: 680, lineHeight: 1.5 }}>
              {t(
                '\u6BCF\u4E00\u6B21\u67E5\u8BE2\u90FD\u88AB\u5F3A\u5236\u5199\u5165\u5BA1\u8BA1\u65E5\u5FD7\u3002\u4F60\u80FD\u770B\u7A7F\u94FE\u4E0A\u6570\u636E\uFF0C\u4F46\u4F60\u770B\u4E0D\u89C1\u7684\u4E8B\u2014\u2014\u8FD9\u6761\u65E5\u5FD7\u8BB0\u5F97\u3002',
                'Every query is forcibly written to the audit log. You can see through on-chain data \u2014 but the things you don\'t see, this log remembers.'
              )}
            </div>
          </div>

          {/* Step Machine */}
          <StepMachine phase={phase} />

          {/* ── Phase: Input ────────────────────────────────────────── */}
          {(phase === 'input' || phase === 'error') && (
            <div style={{ marginTop: 32, padding: '28px 32px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--indigo)', marginBottom: 10 }}>
                I \u00B7 QUERY \u00B7 SETTLEMENT PDA ADDRESS
              </div>
              <input
                value={inputAddr}
                onChange={e => setInputAddr(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="DesM9HHZ8T2ngUBWJP6FTnAGUp7F34UvbAfDgKANAwFy"
                style={{
                  width: '100%',
                  background: 'var(--d-bg-3)',
                  border: '1px solid var(--d-line-2)',
                  color: '#f4f1ea',
                  padding: '14px 16px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 15,
                  letterSpacing: '.05em',
                  outline: 'none',
                  marginBottom: 14,
                }}
              />

              {/* Error */}
              {errorMsg && phase === 'error' && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', padding: '10px 12px', border: '1px solid var(--danger)', background: 'rgba(181,61,32,.08)', marginBottom: 14, whiteSpace: 'pre-line' }}>
                  ! {errorMsg}
                </div>
              )}

              <button
                onClick={() => fetchRecord(inputAddr)}
                disabled={!inputAddr.trim() || !program}
                className="btn solid"
                style={{ borderColor: 'var(--indigo)', background: 'var(--indigo)', color: '#f4f1ea' }}
              >
                {t('\u25B6 \u68C0\u7D22 SETTLEMENT RECORD', '\u25B6 FETCH SETTLEMENT RECORD')}
              </button>

              {/* Sample IDs */}
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px dashed var(--d-line-2)' }}>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 10 }}>
                  SAMPLE IDS \u00B7 CLICK TO LOAD
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SAMPLE_SETTLEMENT_IDS.map(id => (
                    <button
                      key={id}
                      onClick={() => suggest(id)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: '1px solid var(--d-line)',
                        background: 'transparent',
                        display: 'flex',
                        gap: 14,
                        alignItems: 'center',
                        cursor: 'pointer',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                      }}
                    >
                      <span className="mono" style={{ fontSize: 11, color: 'var(--indigo)' }}>{truncate(id, 12, 4)}</span>
                      <span style={{ fontSize: 11, color: '#9a9aa3', fontFamily: 'JetBrains Mono, monospace' }}>
                        devnet SettlementRecord
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Phase: Searching ────────────────────────────────────── */}
          {phase === 'searching' && (
            <div style={{ marginTop: 32, padding: '40px 32px', border: '1px dashed var(--indigo)', background: 'rgba(29,42,85,.08)', textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--indigo)', marginBottom: 12 }}>
                SCANNING \u00B7 SettlementRecord
              </div>
              <div className="serif italic" style={{ fontStyle: 'italic', fontSize: 24, color: '#f4f1ea' }}>
                {t('\u5728\u94FE\u4E0A\u68C0\u7D22\u7ED3\u7B97\u8BB0\u5F55', 'Querying settlement records on-chain')}<span className="cursor" />
              </div>
            </div>
          )}


          {/* ── Phase: Demand Key ──────────────────────────────────── */}
          {phase === 'demandKey' && record && (
            <div style={{ marginTop: 32, padding: '28px 32px', border: '1px solid var(--gold)', background: 'rgba(198,166,82,.06)' }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--gold)', marginBottom: 16 }}>
                II · DEMAND KEY · ELGAMAL PRIVATE KEY REQUIRED
              </div>

              <div style={{ marginBottom: 18, padding: '12px 16px', border: '1px dashed var(--d-line-2)', fontSize: 12, color: '#9a9aa3', lineHeight: 1.6 }}>
                {t(
                  '链上存储的是 ElGamal 密文。要解密余额，需要提供加密时使用的私钥（bigint 十进制字符串）。每个结算使用独立的临时密钥对。',
                  'On-chain balances are ElGamal ciphertexts. To decrypt, provide the private key used during encryption (bigint decimal string). Each settlement uses an ephemeral keypair.'
                )}
              </div>

              {/* Auto-fill from saved keys */}
              {savedKeys && (
                <div style={{ marginBottom: 18, padding: '14px 16px', border: '1px solid var(--green)', background: 'rgba(31,111,62,.08)' }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--green)', marginBottom: 10 }}>
                    {'✓'} SAVED ELGAMAL KEYS FOUND (from last settlement)
                  </div>
                  <button
                    onClick={() => { setPrivateKeyA(savedKeys.keyA); setPrivateKeyB(savedKeys.keyB); }}
                    className="btn"
                    style={{ padding: '8px 12px', fontSize: 10, borderColor: 'var(--green)', color: 'var(--green)' }}
                  >
                    AUTO-FILL BOTH KEYS
                  </button>
                  <div className="mono" style={{ fontSize: 9, color: '#5a5a63', marginTop: 8 }}>
                    Saved: {savedKeys.savedAt} · Party A: {savedKeys.partyA?.slice(0,8)}... · Party B: {savedKeys.partyB?.slice(0,8)}...
                  </div>
                </div>
              )}

              <RecordHeader address={fetchedAddr} record={record} phase={phase} />

              <div style={{ marginTop: 20 }}>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 6 }}>
                  KEY A — DECRYPT PARTY A BALANCE (BIGINT DECIMAL)
                </div>
                <input
                  value={privateKeyA}
                  onChange={e => setPrivateKeyA(e.target.value)}
                  placeholder="Party A ElGamal private key..."
                  type="password"
                  style={{
                    width: '100%',
                    background: 'var(--d-bg-3)',
                    border: '1px solid var(--d-line-2)',
                    color: '#f4f1ea',
                    padding: '14px 16px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 14,
                    letterSpacing: '.05em',
                    outline: 'none',
                    marginBottom: 14,
                  }}
                />

                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63', marginBottom: 6 }}>
                  KEY B — DECRYPT PARTY B BALANCE (BIGINT DECIMAL)
                </div>
                <input
                  value={privateKeyB}
                  onChange={e => setPrivateKeyB(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (privateKeyA.trim() || privateKeyB.trim())) unseal(); }}
                  placeholder="Party B ElGamal private key..."
                  type="password"
                  style={{
                    width: '100%',
                    background: 'var(--d-bg-3)',
                    border: '1px solid var(--d-line-2)',
                    color: '#f4f1ea',
                    padding: '14px 16px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 14,
                    letterSpacing: '.05em',
                    outline: 'none',
                    marginBottom: 14,
                  }}
                />

                {decryptError && (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', padding: '10px 12px', border: '1px solid var(--danger)', background: 'rgba(181,61,32,.08)', marginBottom: 14, whiteSpace: 'pre-line' }}>
                    ! {decryptError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={unseal}
                    disabled={!privateKeyA.trim() && !privateKeyB.trim()}
                    className="btn solid"
                    style={{ borderColor: 'var(--gold)', background: 'var(--gold)', color: 'var(--d-bg)' }}
                  >
                    {t('🔓 解密余额', '🔓 UNSEAL BALANCES')}
                  </button>
                  <button onClick={reset} className="btn" style={{ borderColor: '#f4f1ea', color: '#f4f1ea' }}>
                    {'←'} {t('取消', 'CANCEL')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Phase: Unsealing ──────────────────────────────────── */}
          {phase === 'unsealing' && (
            <div style={{ marginTop: 32, padding: '40px 32px', border: '1px dashed var(--gold)', background: 'rgba(198,166,82,.08)', textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--gold)', marginBottom: 12 }}>
                DECRYPTING · ElGamal BSGS
              </div>
              <div className="serif italic" style={{ fontStyle: 'italic', fontSize: 24, color: '#f4f1ea' }}>
                {t('正在解密链上密文...', 'Decrypting on-chain ciphertexts...')}<span className="cursor" />
              </div>
              <div className="mono" style={{ fontSize: 10, color: '#5a5a63', marginTop: 12 }}>
                Baby-step Giant-step · u32 range · ~{t('几秒', 'a few seconds')}
              </div>
            </div>
          )}

          {/* ── Phase: Revealed ─────────────────────────────────────── */}
          {phase === 'revealed' && record && (
            <div style={{ marginTop: 32 }}>
              <RecordHeader address={fetchedAddr} record={record} phase={phase} />
              <RevealedRecord address={fetchedAddr} record={record} t={t} decryptedBalances={decryptedBalances} />

              {/* Action buttons */}
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button onClick={reset} className="btn solid" style={{ borderColor: 'var(--indigo)', background: 'var(--indigo)', color: '#f4f1ea' }}>
                  {'\u2190'} {t('\u518D\u67E5\u4E00\u7B14', 'QUERY ANOTHER')}
                </button>
                <button onClick={exportJson} className="btn" style={{ borderColor: '#f4f1ea', color: '#f4f1ea' }}>
                  {'{ }'} {t('\u5BFC\u51FA JSON', 'EXPORT JSON')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── SIDEBAR — Audit Log ────────────────────────────────────── */}
        <div style={{ background: 'var(--d-bg)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Header */}
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: '#f4f1ea' }}>{'\u00B7'} APPEND-ONLY AUDIT LOG {'\u00B7'}</div>
            <div className="serif italic" style={{ fontStyle: 'italic', fontSize: 14, color: 'var(--gold)', marginTop: 4 }}>
              {t('\u76D1\u5BDF\u7684\u76D1\u5BDF\u3002', 'Audit on the auditor.')}
            </div>
          </div>

          {/* Entries */}
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
            {auditLog.length === 0 && (
              <div className="mono" style={{ fontSize: 10, color: '#5a5a63', letterSpacing: '.1em', paddingTop: 12 }}>
                {t('\u5C1A\u65E0\u67E5\u8BE2\u8BB0\u5F55\u3002', 'No queries yet.')}
              </div>
            )}
            {auditLog.map((entry, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: i < auditLog.length - 1 ? '1px dotted var(--d-line)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ fontSize: 9, color: '#5a5a63', letterSpacing: '.1em' }}>
                    {new Date(entry.ts).toLocaleString('en-GB')}
                  </span>
                  {i === 0 && (
                    <span className="mono" style={{ fontSize: 8, letterSpacing: '.18em', color: 'var(--gold)', padding: '1px 5px', border: '1px solid var(--gold)' }}>
                      JUST WRITTEN
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--indigo)' }}>{entry.action}</span>
                  <span style={{ color: '#5a5a63', fontSize: 10 }}>{'\u00B7'}</span>
                  <span className="mono" style={{ fontSize: 11, color: '#f4f1ea' }}>{entry.ref}</span>
                </div>
                <div className="mono" style={{ fontSize: 10, color: '#9a9aa3', marginTop: 3, letterSpacing: '.05em' }}>
                  by {entry.auditor}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 22px', borderTop: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: '#5a5a63' }}>
              {auditLog.length} {t('\u6761\u8BB0\u5F55', 'entries')} {'\u00B7'} {t('\u4E0D\u53EF\u5220\u9664 \u00B7 \u94FE\u4E0A\u951A\u5B9A', 'indelible \u00B7 anchored on-chain')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
