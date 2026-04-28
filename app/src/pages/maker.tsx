import { useState, useEffect, useRef, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { NexumSeal, Wordmark, Slot } from '../components/atoms';
import { useAnchorContext } from '../context/WalletProvider';

interface MakerDashboardProps {
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

export default function MakerDashboard({ lang, setLang }: MakerDashboardProps) {
  const { program, wallet } = useAnchorContext();
  const navigate = useNavigate();
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;

  // Form state
  const [mintAddress, setMintAddress] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC devnet
  const [reserveCount, setReserveCount] = useState(5);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((kind: LogKind, line: string) => {
    setLogs(l => [...l, { ts: new Date().toLocaleTimeString('en-GB'), kind, line }]);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Reserve version slots
  const handleReserve = async () => {
    if (!program || !wallet) return;
    setLoading(true);
    setError('');
    try {
      appendLog('info', t('预留版本槽中…', 'Reserving version slots…'));

      // Find ledger PDA
      const [ledgerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('ledger'), wallet.publicKey.toBuffer(), new PublicKey(mintAddress).toBuffer()],
        program.programId
      );

      // Derive slot PDAs for remaining_accounts
      const slotAccounts: PublicKey[] = [];
      for (let i = 0; i < reserveCount; i++) {
        const [slotPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('vslot'), ledgerPda.toBuffer(), Buffer.from(new Uint8Array(8).fill(0).map((_, j) => j === 0 ? i : 0))],
          program.programId
        );
        slotAccounts.push(slotPda);
      }

      // Note: reserveVersionSlots may not be registered in lib.rs yet
      // This is a UI-ready implementation
      appendLog('tx', `reserve_version_slots(${reserveCount})`);

      // Try to call the instruction
      try {
        const tx = await program.methods
          .reserveVersionSlots(reserveCount)
          .accounts({
            owner: wallet.publicKey,
            ledger: ledgerPda,
            systemProgram: PublicKey.default,
          })
          .remainingAccounts(slotAccounts.map(pubkey => ({ pubkey, isWritable: true, isSigner: false })))
          .rpc();

        appendLog('ok', `TX: ${tx.slice(0, 20)}…`);
        appendLog('ok', t(`${reserveCount} 个版本槽已预留`, `${reserveCount} version slots reserved`));

        // Update slot display
        setSlots(prev => [
          ...prev,
          ...slotAccounts.map((pubkey, i) => ({
            index: prev.length + i,
            address: pubkey.toBase58(),
            status: 'Free' as const,
            version: 0,
            expiresAt: Date.now() / 1000 + 300,
          }))
        ]);
      } catch (ixErr: any) {
        appendLog('err', t('后端指令未注册 — 需要在 lib.rs 注册 reserve_version_slots', 'Backend instruction not registered — reserve_version_slots needs registration in lib.rs'));
        appendLog('err', ixErr.message?.slice(0, 100) || String(ixErr));
      }
    } catch (e: any) {
      setError(e.message || String(e));
      appendLog('err', e.message?.slice(0, 100) || String(e));
    } finally {
      setLoading(false);
    }
  };

  // Release a slot
  const handleRelease = async (slot: SlotInfo) => {
    if (!program || !wallet) return;
    appendLog('info', t(`释放槽 ${slot.index}…`, `Releasing slot ${slot.index}…`));
    try {
      const slotPubkey = new PublicKey(slot.address);
      const tx = await program.methods
        .releaseVersionSlot()
        .accounts({
          owner: wallet.publicKey,
          versionSlot: slotPubkey,
          systemProgram: PublicKey.default,
        })
        .rpc();
      appendLog('ok', `Released slot ${slot.index} · TX: ${tx.slice(0, 20)}…`);
      setSlots(prev => prev.filter(s => s.index !== slot.index));
    } catch (e: any) {
      appendLog('err', t('释放失败 — 指令可能未注册', 'Release failed — instruction may not be registered'));
      appendLog('err', e.message?.slice(0, 100) || String(e));
    }
  };

  return (
    <div className="dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top rail */}
      <div style={{ padding: '14px 36px', display: 'flex', alignItems: 'center', gap: 20, borderBottom: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
        <NexumSeal size={28} dark />
        <Wordmark dark sub="MAKER · VERSION SLOTS" />
        <span style={{ width: 1, height: 14, background: 'var(--d-line-2)' }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--accent)' }}>● MAKER · {wallet?.publicKey?.toBase58().slice(0, 8)}…</span>
        <div style={{ flex: 1 }} />
        <Slot dark />
        <span style={{ width: 1, height: 14, background: 'var(--d-line-2)' }} />
        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="mono" style={{ fontSize: 11, letterSpacing: '.15em', color: '#f4f1ea' }}>{lang === 'zh' ? 'EN' : '中'}</button>
        <button onClick={() => navigate('/')} className="btn" style={{ padding: '8px 14px', fontSize: 10, borderColor: '#f4f1ea', color: '#f4f1ea' }}>{t('返回', 'BACK')}</button>
      </div>

      {/* Header */}
      <div style={{ padding: '28px 36px', borderBottom: '1px solid var(--d-line-2)', background: 'var(--d-bg)' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: '#9a9aa3' }}>FOLIO 03 · VERSION SLOT PIPELINE</div>
        <h1 className="serif" style={{ margin: '8px 0 0', fontSize: 'clamp(40px,4vw,56px)', fontWeight: 300, letterSpacing: '-.025em', lineHeight: 1, color: '#f4f1ea' }}>
          {t('做市商，并发引擎。', 'Market makers, in parallel.')}
        </h1>
        <div className="serif" style={{ fontStyle: 'italic', fontSize: 15, color: '#9a9aa3', marginTop: 10, maxWidth: 680, lineHeight: 1.5 }}>
          {t('版本槽预分配将 ZK 证明串行死锁拆成流水线。预留 N 个版本号，并行生成证明，按序上链。', 'Pre-reserving version slots breaks the serial ZK proof deadlock. Reserve N version numbers, generate proofs in parallel, submit in order.')}
        </div>
      </div>

      {/* Main content: 2 columns */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 1, background: 'var(--d-line)', minHeight: 0 }}>
        {/* Left — controls + pipeline */}
        <div style={{ background: 'var(--d-bg)', padding: '28px 36px', overflowY: 'auto' }}>
          {/* Reserve controls */}
          <div style={{ padding: '24px 28px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)', marginBottom: 28 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--accent)', marginBottom: 14 }}>I · RESERVE ENGINE</div>

            <div style={{ marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '.22em', color: '#9a9aa3', marginBottom: 6 }}>{t('资产 Mint 地址', 'ASSET MINT ADDRESS')}</div>
              <input value={mintAddress} onChange={e => setMintAddress(e.target.value)} disabled={loading}
                style={{ width: '100%', background: 'var(--d-bg-3)', border: '1px solid var(--d-line-2)', color: '#f4f1ea', padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, outline: 'none' }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: '.22em', color: '#9a9aa3', marginBottom: 6 }}>{t('预留数量', 'RESERVE COUNT')} ({t('最大', 'max')} 20)</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="range" min={1} max={20} value={reserveCount} onChange={e => setReserveCount(+e.target.value)} disabled={loading} style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 16, color: 'var(--accent)', width: 36, textAlign: 'right' }}>{reserveCount}</span>
              </div>
            </div>

            <button onClick={handleReserve} disabled={loading || !program} className="btn accent lg" style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t('预留中…', 'RESERVING…') : t(`▶ 预留 ${reserveCount} 个版本槽`, `▶ RESERVE ${reserveCount} SLOTS`)}
            </button>

            {error && (
              <div className="mono" style={{ fontSize: 11, color: 'var(--danger)', padding: '10px 12px', border: '1px solid var(--danger)', background: 'rgba(181,61,32,.08)', marginTop: 14, wordBreak: 'break-all' }}>
                ! {error}
              </div>
            )}
          </div>

          {/* Slot pipeline */}
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: '#9a9aa3', marginBottom: 14 }}>II · SLOT PIPELINE</div>
          {slots.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', border: '1px dashed var(--d-line-2)' }}>
              <div className="serif" style={{ fontStyle: 'italic', fontSize: 22, color: '#5a5a63' }}>{t('暂无版本槽', 'No version slots')}</div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '.15em', color: '#3a3a48', marginTop: 8 }}>{t('预留后槽位将显示于此', 'Slots will appear here after reservation')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slots.map(slot => (
                <div key={slot.index} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px', gap: 12, alignItems: 'center', padding: '12px 16px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)' }}>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em', color: 'var(--ink-3)' }}>SLOT {slot.index}</span>
                  <span className="mono" style={{ fontSize: 10, color: '#9a9aa3', wordBreak: 'break-all' }}>{slot.address.slice(0, 16)}…</span>
                  <span className="mono" style={{ fontSize: 10, color: slot.status === 'Done' ? 'var(--green)' : 'var(--accent)', letterSpacing: '.1em' }}>● {slot.status.toUpperCase()}</span>
                  <button onClick={() => handleRelease(slot)} className="mono" style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '4px 8px', textAlign: 'center' }}>{t('释放', 'RELEASE')}</button>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          {slots.length > 0 && (
            <div style={{ marginTop: 20, padding: '16px 20px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-3)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
              <div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: '#5a5a63' }}>TOTAL</div>
                <div className="serif" style={{ fontSize: 32, fontWeight: 300, color: '#f4f1ea', letterSpacing: '-.02em', lineHeight: 1, marginTop: 4 }}>{slots.length}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--accent)' }}>FREE</div>
                <div className="serif" style={{ fontSize: 32, fontWeight: 300, color: 'var(--accent)', letterSpacing: '-.02em', lineHeight: 1, marginTop: 4 }}>{slots.filter(s => s.status === 'Free').length}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--green)' }}>DONE</div>
                <div className="serif" style={{ fontSize: 32, fontWeight: 300, color: 'var(--green)', letterSpacing: '-.02em', lineHeight: 1, marginTop: 4 }}>{slots.filter(s => s.status === 'Done').length}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right — terminal */}
        <div style={{ background: 'var(--d-bg)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--d-line-2)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: '#9a9aa3' }}>III · CONSOLE</div>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: '#5a5a63' }}>RPC · solana.devnet</div>
          </div>
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 22px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, lineHeight: 1.65 }}>
            {logs.length === 0 && (
              <div style={{ color: '#3a3a48', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, marginBottom: 8 }}>console idle</div>
                <div style={{ fontSize: 10, letterSpacing: '.15em' }}>{t('操作日志将显示于此', 'Logs will appear here')}</div>
              </div>
            )}
            {logs.map((l, i) => (
              <LogLine key={i} entry={l} />
            ))}
            {loading && <div style={{ color: '#5a5a63' }}>$ <span className="cursor" /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom';

type LogKind = 'info' | 'ok' | 'tx' | 'warn' | 'err';
interface LogEntry { ts: string; kind: LogKind; line: string; }
interface SlotInfo { index: number; address: string; status: 'Free' | 'Bound' | 'Done'; version: number; expiresAt: number; }

// ── Log line ──────────────────────────────────────────────────────────
function LogLine({ entry }: { entry: LogEntry }) {
  const colors: Record<LogKind, string> = { info: '#9a9aa3', ok: 'var(--green)', tx: 'var(--accent)', warn: 'var(--gold)', err: 'var(--danger)' };
  const sigil: Record<LogKind, string> = { info: '·', ok: '✓', tx: '◆', warn: '!', err: '×' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '62px 14px 1fr', gap: 6, padding: '2px 0' }}>
      <span style={{ color: '#3a3a48' }}>{entry.ts}</span>
      <span style={{ color: colors[entry.kind] }}>{sigil[entry.kind]}</span>
      <span style={{ color: '#dadbde', wordBreak: 'break-all' }}>{entry.line}</span>
    </div>
  );
}
