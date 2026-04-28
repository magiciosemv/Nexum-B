import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NexumSeal, Wordmark, Slot, CountdownRing, ParchmentTicker } from '../components/atoms';

interface HomePageProps {
  lang: 'zh' | 'en';
  setLang: (lang: 'zh' | 'en') => void;
}

export default function HomePage({ lang, setLang }: HomePageProps) {
  const navigate = useNavigate();
  const [demoTrigger, setDemoTrigger] = useState(0);
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const launch = () => navigate('/login');
  const play = () => {
    document.getElementById('act-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setDemoTrigger(x => x + 1), 600);
  };

  return (
    <>
      <HeroV3 onLaunch={launch} onPlay={play} lang={lang} setLang={setLang} />
      <div style={{ marginTop: 48 }}><ParchmentTicker /></div>
      <div id="act-section"><ThreeActStage lang={lang} demoTrigger={demoTrigger} /></div>
      <VersionSlotsSection lang={lang} />
      <GameMatrix lang={lang} />
      {/* CTA strip */}
      <section style={{ padding: '80px 48px', background: 'var(--ink)', color: 'var(--bg)', borderTop: '2px solid var(--ink)' }}>
        <div style={{ maxWidth: 1500, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 32, alignItems: 'end' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.28em', color: '#9a9aa3' }}>FOLIO 99 · ENTRY</div>
            <h2 className="serif" style={{ margin: '10px 0 0', fontSize: 'clamp(40px,4.6vw,72px)', fontWeight: 300, letterSpacing: '-.03em', lineHeight: .95, color: 'var(--bg)' }}>
              {lang === 'zh' ? <>选择你的<br /><em style={{ fontStyle: 'italic' }}>身份。</em></> : <>Choose your<br /><em style={{ fontStyle: 'italic' }}>station.</em></>}
            </h2>
          </div>
          <button onClick={() => navigate('/trader')} style={{ textAlign: 'left', padding: '28px 28px', border: '1px solid var(--bg)', background: 'transparent', color: 'var(--bg)', cursor: 'pointer', transition: 'background .2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,241,234,.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--accent)' }}>TRADER · DESK</div>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 38, fontWeight: 300, marginTop: 8, letterSpacing: '-.02em', lineHeight: 1 }}>{lang === 'zh' ? '交易员' : 'Trader'}</div>
            <div className="mono" style={{ fontSize: 11, marginTop: 14, letterSpacing: '.12em', color: '#dadbde' }}>ENTER TERMINAL →</div>
          </button>
          <button onClick={() => navigate('/regulator')} style={{ textAlign: 'left', padding: '28px 28px', border: '1px solid var(--bg)', background: 'transparent', color: 'var(--bg)', cursor: 'pointer', transition: 'background .2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,241,234,.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: '#9eb3e8' }}>AUDITOR · CHAMBERS</div>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 38, fontWeight: 300, marginTop: 8, letterSpacing: '-.02em', lineHeight: 1 }}>{lang === 'zh' ? '监察机构' : 'Regulator'}</div>
            <div className="mono" style={{ fontSize: 11, marginTop: 14, letterSpacing: '.12em', color: '#dadbde' }}>ENTER CHAMBER →</div>
          </button>
        </div>
      </section>
      <FooterColophon lang={lang} />
    </>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────
function HeroV3({ onLaunch, onPlay, lang, setLang }: { onLaunch: () => void; onPlay: () => void; lang: 'zh' | 'en'; setLang: (l: 'zh' | 'en') => void }) {
  return (
    <section style={{ position: 'relative', padding: '24px 48px 0', maxWidth: 1500, margin: '0 auto' }}>
      {/* Top rail */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, paddingBottom: 18, borderBottom: '1px solid var(--ink)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NexumSeal size={36} />
          <Wordmark />
        </div>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--ink-3)' }}>SCHEME B · v3.0</span>
        <span style={{ width: 1, height: 14, background: 'var(--line-2)' }} />
        <Slot />
        <span style={{ width: 1, height: 14, background: 'var(--line-2)' }} />
        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="mono" style={{ fontSize: 11, letterSpacing: '.15em', color: 'var(--ink)' }}>{lang === 'zh' ? 'EN' : '中'}</button>
      </div>

      {/* Folio + headline */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 200px', gap: 24, paddingTop: 24, alignItems: 'start' }}>
        <div>
          <div className="serif" style={{ fontSize: 96, lineHeight: .85, letterSpacing: '-.04em', color: 'var(--ink)' }}>03</div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: '.25em', color: 'var(--ink-3)', marginTop: 6 }}>SCHEMES / B</div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>PRODUCTION FINAL · 2026</div>
          <h1 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 'clamp(56px, 7vw, 110px)', lineHeight: .92, letterSpacing: '-.035em', textWrap: 'balance' as const }}>
            <span>{lang === 'zh' ? '锁定，是双方的' : 'Lock-in,'}</span><br />
            <span style={{ fontStyle: 'italic' }}>{lang === 'zh' ? '同时' : 'symmetric.'}</span>
          </h1>
          <h2 className="grot" style={{ margin: '18px 0 0', fontSize: 'clamp(28px, 3.2vw, 48px)', lineHeight: 1, letterSpacing: '-.025em', color: 'var(--ink-2)', fontStretch: '75%', fontWeight: 600 }}>
            {lang === 'zh'
              ? <>承诺 <span style={{ color: 'var(--accent)', fontStyle: 'italic', fontFamily: 'Fraunces, serif', fontWeight: 300 }}>·</span> 接受 <span style={{ color: 'var(--accent)', fontStyle: 'italic', fontFamily: 'Fraunces, serif', fontWeight: 300 }}>·</span> 双证执行</>
              : <>COMMIT <span style={{ color: 'var(--accent)' }}>·</span> ACCEPT <span style={{ color: 'var(--accent)' }}>·</span> EXECUTE</>
            }
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 18, borderTop: '1px solid var(--ink)' }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: '.2em', color: 'var(--ink-3)' }}>EDITORIAL · NEXUM PROTOCOL</div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {lang === 'zh' ? '在不完全信任的机构间，构建一个对称、原子、可审计的暗池结算协议。' : 'A symmetric, atomic, auditable dark-pool settlement protocol — for institutions that do not yet trust one another.'}
          </div>
        </div>
      </div>

      {/* Lede + diagram */}
      <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 64, alignItems: 'end' }}>
        <div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 18, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 480, textWrap: 'pretty' as const }}>
            {lang === 'zh'
              ? <>方案 A 在双方都诚实时是完美的。<br />方案 B v3.0 解决了一个更难的问题——<br /><span style={{ color: 'var(--accent)', fontWeight: 500, fontStyle: 'normal' }}>当对手方可能反悔时，要如何用密码学和博弈论让他付出代价。</span></>
              : <>Scheme A is perfect when both parties stay honest.<br />Scheme B v3.0 answers a harder question:<br /><span style={{ color: 'var(--accent)', fontWeight: 500, fontStyle: 'normal' }}>how do you make a counterparty pay — cryptographically and game-theoretically — for walking away.</span></>
            }
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
            <button className="btn solid lg" onClick={onLaunch}>
              {lang === 'zh' ? '进入终端' : 'ENTER TERMINAL'}
              <span style={{ fontSize: 13 }}>↗</span>
            </button>
            <button className="btn lg" onClick={onPlay}>
              {lang === 'zh' ? '▶ 播放三幕' : '▶ PLAY 3-ACT'}
            </button>
          </div>
        </div>
        <ProtocolDiagram lang={lang} />
      </div>

      {/* Stat strip */}
      <div style={{ marginTop: 56, padding: '20px 0', borderTop: '2px solid var(--ink)', borderBottom: '1px solid var(--ink)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--ink)' }}>
        {[
          [lang === 'zh' ? '链上交易' : 'on-chain tx', '3', lang === 'zh' ? '承诺 / 接受 / 执行' : 'commit / accept / execute'],
          [lang === 'zh' ? 'CommitSlot 大小' : 'commit slot size', '204', 'BYTES · −84% v1.0'],
          [lang === 'zh' ? '对称锁定窗口' : 'symmetric lock', '60→30', 'sec init→exec'],
          [lang === 'zh' ? '版本槽并发' : 'version slots', '×20', lang === 'zh' ? '流水线 3.5 倍' : 'pipeline 3.5×'],
          [lang === 'zh' ? '残余期权' : 'residual option', '6k', 'USDC / 10M trade'],
        ].map(([k, n, sub], i) => (
          <div key={i} style={{ background: 'var(--bg)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-3)' }}>{k.toUpperCase()}</div>
            <div className="serif" style={{ fontSize: 36, fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em', color: i === 3 ? 'var(--accent)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{n}</div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-faint)', letterSpacing: '.08em' }}>{sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Protocol Diagram ──────────────────────────────────────────────────
function ProtocolDiagram({ lang }: { lang: string }) {
  return (
    <div style={{ position: 'relative', padding: '28px 32px', border: '1px solid var(--ink)', background: 'var(--bg-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span className="label-ink">FIG. 01 — PROTOCOL SEQUENCE</span>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '.15em' }}>SCALE 1:1</span>
      </div>
      <svg viewBox="0 0 600 220" style={{ width: '100%', height: 220 }}>
        <line x1="40" y1="170" x2="560" y2="170" stroke="var(--ink)" strokeWidth="1" />
        {[40, 200, 360, 520].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="165" x2={x} y2="175" stroke="var(--ink)" strokeWidth="1" />
            <text x={x} y="195" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1.5" fill="var(--ink-3)">T+{i * 30}s</text>
          </g>
        ))}
        <text x="40" y="40" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2" fill="var(--ink-3)">PARTY · A</text>
        <line x1="40" y1="60" x2="560" y2="60" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 3" />
        <text x="40" y="105" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2" fill="var(--ink-3)">PARTY · B</text>
        <line x1="40" y1="125" x2="560" y2="125" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx="80" cy="60" r="7" fill="var(--accent)" />
        <text x="80" y="50" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--accent)" letterSpacing="1">INITIATE</text>
        <circle cx="280" cy="125" r="7" fill="var(--accent)" />
        <text x="280" y="148" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--accent)" letterSpacing="1">ACCEPT</text>
        <rect x="280" y="60" width="160" height="65" fill="var(--accent)" opacity="0.08" />
        <text x="360" y="92" textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="14" fill="var(--ink-2)">both_pending — 30s</text>
        <circle cx="440" cy="60" r="6" fill="var(--green)" />
        <circle cx="440" cy="125" r="6" fill="var(--green)" />
        <line x1="440" y1="60" x2="440" y2="125" stroke="var(--green)" strokeWidth="1.5" />
        <text x="440" y="50" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--green)" letterSpacing="1">EXECUTE_SETTLE</text>
        <path d="M 90 60 C 130 30, 230 30, 270 125" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <text x="180" y="22" textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="11" fill="var(--ink-3)">{lang === 'zh' ? '链下 · 明文 + 哈希' : 'off-chain · plaintext + hash'}</text>
        <text x="500" y="92" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--green)" letterSpacing="1">2× zk</text>
      </svg>
    </div>
  );
}

// ── Three-Act Stage ───────────────────────────────────────────────────
function ThreeActStage({ lang, demoTrigger }: { lang: string; demoTrigger: number }) {
  const [act, setAct] = useState(0);
  const [progress, setProgress] = useState(0);
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;

  useEffect(() => {
    if (act === 0) return;
    const durations = [0, 2200, 4500, 1800, 3000, 1600, 2400];
    const dur = durations[act];
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else if (act < 6) setAct(a => a + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [act]);

  useEffect(() => {
    if (demoTrigger) { setAct(0); setProgress(0); setTimeout(() => setAct(1), 200); }
  }, [demoTrigger]);

  const start = () => { setAct(0); setProgress(0); setTimeout(() => setAct(1), 100); };
  const reset = () => { setAct(0); setProgress(0); };

  return (
    <section className="dark" style={{ padding: '80px 48px', marginTop: 64 }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 36, paddingBottom: 18, borderBottom: '1px solid var(--d-line-2)' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.28em', color: '#9a9aa3' }}>FIG. 02 — THREE-ACT SETTLEMENT</div>
            <h2 className="serif" style={{ margin: '10px 0 0', fontSize: 54, fontWeight: 300, letterSpacing: '-.025em', lineHeight: 1, color: '#f4f1ea' }}>
              {t('三幕，原子，对称。', 'Three acts. Atomic. Symmetric.')}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={act === 0 ? start : reset} style={{ borderColor: '#f4f1ea', color: '#f4f1ea' }}>
              {act === 0 ? t('▶ 开始演示', '▶ PLAY') : t('■ 重置', '■ RESET')}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid var(--d-line-2)', marginBottom: 32 }}>
          <ActTab num="I" label={t('承诺', 'COMMIT')} sub="initiate_commit" active={act >= 1 && act <= 2} done={act > 2} accent="var(--accent)" />
          <ActTab num="II" label={t('对称双锁', 'SYMMETRIC LOCK')} sub="accept_commit" active={act === 3} done={act > 3} accent="var(--gold)" />
          <ActTab num="III" label={t('双证执行', 'DUAL PROOF EXEC')} sub="execute_settle" active={act >= 4 && act <= 5} done={act >= 6} accent="var(--green)" />
        </div>

        <div style={{ position: 'relative', minHeight: 480, background: 'var(--d-bg-2)', border: '1px solid var(--d-line-2)', padding: '32px 40px', overflow: 'hidden' }}>
          <PartyTracks act={act} progress={progress} t={t} />
          {act >= 1 && act <= 2 && <Act1Initiate progress={act === 1 ? progress : 1} t={t} />}
          {act === 3 && <Act2Accept progress={progress} />}
          {act >= 4 && <Act3Execute act={act} progress={progress} />}
          {act === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="serif" style={{ fontStyle: 'italic', fontSize: 40, color: '#5a5a63', letterSpacing: '-.02em' }}>
                  {t('点击 ▶ 播放，见证一次结算的三幕剧', 'Press ▶ to witness the three acts')}
                </div>
                <div className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: '#3a3a48', marginTop: 14 }}>I · COMMIT &nbsp; → &nbsp; II · LOCK &nbsp; → &nbsp; III · EXECUTE</div>
              </div>
            </div>
          )}
        </div>

        <NarrationStrip act={act} t={t} />
      </div>
    </section>
  );
}

function ActTab({ num, label, sub, active, done, accent }: { num: string; label: string; sub: string; active: boolean; done: boolean; accent: string }) {
  return (
    <div style={{ padding: '18px 22px', borderRight: '1px solid var(--d-line-2)', background: active ? 'var(--d-bg-2)' : 'transparent', position: 'relative', overflow: 'hidden' }}>
      {active && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent, animation: 'ink-pulse 1.4s infinite' }} />}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span className="serif" style={{ fontStyle: 'italic', fontSize: 32, fontWeight: 300, color: active ? accent : done ? '#f4f1ea' : '#3a3a48', transition: 'color .3s' }}>{num}</span>
        <div>
          <div className="grot" style={{ fontSize: 18, color: active || done ? '#f4f1ea' : '#5a5a63', letterSpacing: '-.01em' }}>{label}</div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.18em', color: active ? accent : '#5a5a63', marginTop: 3 }}>{done ? '✓ ' : ' '}{sub}</div>
        </div>
      </div>
    </div>
  );
}

function PartyTracks({ act, progress, t }: { act: number; progress: number; t: (z: string, e: string) => string }) {
  const aStatus = act === 0 ? 'Active' : act === 1 ? 'Pending Initiator' : act === 2 ? 'Pending Initiator' : act === 3 ? 'Both Pending' : act >= 4 && act <= 5 ? 'Both Pending' : 'Active ✓';
  const bStatus = act === 0 ? 'Active' : act < 3 ? 'Active' : act === 3 ? 'Pending Counterparty' : act >= 4 && act <= 5 ? 'Pending Counterparty' : 'Active ✓';
  const aLocked = act >= 1 && act < 6;
  const bLocked = act >= 3 && act < 6;
  return (
    <div style={{ position: 'absolute', top: 32, left: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 1 }}>
      <PartyRail label="A · INITIATOR" addr="7xKp…mNqR" status={aStatus} locked={aLocked} done={act >= 6} />
      <PartyRail label="B · COUNTERPARTY" addr="2vBa…zL9o" status={bStatus} locked={bLocked} done={act >= 6} />
    </div>
  );
}

function PartyRail({ label, addr, status, locked, done }: { label: string; addr: string; status: string; locked: boolean; done: boolean }) {
  const c = done ? 'var(--green)' : locked ? 'var(--accent)' : '#5a5a63';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 140px 1fr 200px', gap: 14, alignItems: 'center', padding: '10px 14px', border: `1px solid ${locked ? c : 'var(--d-line-2)'}`, background: locked ? 'rgba(226,80,43,.05)' : 'transparent', transition: 'all .4s' }}>
      <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.18em', color: c }}>● {label}</span>
      <span className="mono" style={{ fontSize: 11, color: '#9a9aa3' }}>{addr}</span>
      <div style={{ height: 4, background: '#1f1f28', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(45deg, ${c} 0 6px, transparent 6px 12px)`, opacity: locked ? .6 : 0, transition: 'opacity .4s' }} />
      </div>
      <span className="mono" style={{ fontSize: 10, color: c, letterSpacing: '.12em', textAlign: 'right' }}>{status.toUpperCase()}</span>
    </div>
  );
}

function Act1Initiate({ progress, t }: { progress: number; t: (z: string, e: string) => string }) {
  const hashBytes = useMemo(() => { const c = '0123456789abcdef'; let s = ''; for (let i = 0; i < 64; i++) s += c[Math.floor(Math.random() * 16)]; return s; }, []);
  const visible = Math.floor(progress * 64);
  const stampDown = progress > 0.4;
  return (
    <div style={{ position: 'absolute', top: 160, left: 40, right: 40, bottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
      <div style={{ position: 'relative' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--accent)', marginBottom: 14 }}>STEP I.1 · OFF-CHAIN COMPUTE</div>
        <div style={{ padding: '18px 20px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-3)' }}>
          <div className="mono" style={{ fontSize: 10, color: '#5a5a63', letterSpacing: '.15em', marginBottom: 10 }}>SHA256(120 BYTES)</div>
          <div className="mono" style={{ fontSize: 11.5, color: '#f4f1ea', lineHeight: 1.7 }}>
            <div>nonce <span style={{ color: '#5a5a63' }}>·</span> <span style={{ color: '#9a9aa3' }}>0x 4f 7a 02 e9 11 00 c3 d2</span></div>
            <div>amount_lo/hi <span style={{ color: 'var(--accent)' }}>· 500,000.00 USDC</span></div>
            <div>asset_a <span style={{ color: '#5a5a63' }}>·</span> <span style={{ color: '#9a9aa3' }}>USDC</span></div>
            <div>asset_b <span style={{ color: '#5a5a63' }}>·</span> <span style={{ color: '#9a9aa3' }}>SOL</span></div>
            <div>counterparty <span style={{ color: '#5a5a63' }}>·</span> <span style={{ color: '#9a9aa3' }}>2vBa…zL9o</span></div>
            <div>expiry <span style={{ color: '#5a5a63' }}>·</span> <span style={{ color: 'var(--gold)' }}>now + 60s</span></div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '14px 0', color: '#5a5a63' }} className="serif">↓</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', padding: '12px 16px', background: 'var(--d-bg-3)', border: '1px solid var(--accent)', wordBreak: 'break-all', lineHeight: 1.6 }}>
          0x{hashBytes.slice(0, visible)}<span style={{ color: '#5a5a63' }}>{hashBytes.slice(visible)}</span>
          {visible < 64 && <span className="cursor" />}
        </div>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--accent)', marginBottom: 18, alignSelf: 'flex-start' }}>STEP I.2 · ON-CHAIN ANCHOR</div>
        <div style={{ position: 'relative', width: 300, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 240, height: 160, background: '#f4f1ea', color: '#0a0a0c', padding: 20, position: 'relative', boxShadow: stampDown ? '0 8px 24px rgba(0,0,0,.4)' : 'none', transition: 'box-shadow .3s' }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.2em', color: 'var(--ink-3)' }}>COMMIT_SLOT · 204B</div>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ink-2)', marginTop: 8 }}>only the hash, expiry, parties.</div>
            <div className="mono" style={{ fontSize: 9, marginTop: 14, color: 'var(--ink-3)' }}>commitment_hash · 32B<br />expiry_init · 8B<br />nonce · 8B<br />parties · 64B</div>
            {stampDown && (
              <div style={{ position: 'absolute', right: -18, bottom: -18, width: 90, height: 90, border: '2px solid var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(244,241,234,.95)', transform: 'rotate(-12deg)', animation: 'seal-down .55s cubic-bezier(.5,1.5,.5,1)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="serif" style={{ fontStyle: 'italic', fontSize: 16, color: 'var(--accent)', lineHeight: 1 }}>commit</div>
                  <div className="mono" style={{ fontSize: 8, letterSpacing: '.18em', color: 'var(--accent)', marginTop: 2 }}>SEALED</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10, color: '#5a5a63', letterSpacing: '.15em', marginTop: 12 }}>50K CU · NO ZK · IRREVOCABLE WITHIN 60s</div>
      </div>
    </div>
  );
}

function Act2Accept({ progress }: { progress: number }) {
  const r = 68, c = 2 * Math.PI * r, off = c * (1 - progress);
  return (
    <div style={{ position: 'absolute', top: 160, left: 40, right: 40, bottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--accent)' }}>● A · LOCKED</div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 36, color: '#f4f1ea', lineHeight: 1.1, marginTop: 4 }}>500,000<br />USDC</div>
        </div>
        <div style={{ position: 'relative', width: 180, height: 180 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r={r} stroke="var(--d-line-2)" strokeWidth="1" fill="none" />
            <circle cx="90" cy="90" r={r} stroke="var(--accent)" strokeWidth="3" fill="none" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 90 90)" />
            {Array.from({ length: 24 }).map((_, i) => {
              const a = i * Math.PI / 12;
              return <line key={i} x1={90 + Math.cos(a) * (r - 10)} y1={90 + Math.sin(a) * (r - 10)} x2={90 + Math.cos(a) * (r - 4)} y2={90 + Math.sin(a) * (r - 4)} stroke="var(--d-line-2)" strokeWidth=".8" />;
            })}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '.22em', color: 'var(--accent)' }}>BOTH PENDING</div>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 36, fontWeight: 300, color: '#f4f1ea', lineHeight: 1, marginTop: 4 }}>{Math.ceil(30 * (1 - progress))}<span style={{ fontSize: 14, color: '#5a5a63', marginLeft: 2 }}>s</span></div>
            <div className="mono" style={{ fontSize: 8, letterSpacing: '.2em', color: '#5a5a63', marginTop: 4 }}>EXEC WINDOW</div>
          </div>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--accent)' }}>● B · LOCKED</div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 36, color: '#f4f1ea', lineHeight: 1.1, marginTop: 4 }}>2,381.4<br />SOL</div>
        </div>
      </div>
    </div>
  );
}

function Act3Execute({ act, progress }: { act: number; progress: number }) {
  const settled = act >= 6;
  const p = act === 4 ? progress : act > 4 ? 1 : 0;
  return (
    <div style={{ position: 'absolute', top: 160, left: 40, right: 40, bottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
      <ProverBlock party="A" label="proof_a · 12,778 cnstr" progress={p} settled={settled} />
      <ProverBlock party="B" label="proof_b · 12,778 cnstr" progress={p} settled={settled} />
      {settled && (
        <div style={{ gridColumn: '1 / -1', marginTop: 12, padding: '14px 20px', border: '1px solid var(--green)', background: 'rgba(31,111,62,.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'shrink-in .4s ease' }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '.18em', color: 'var(--green)' }}>✓ SETTLEMENT_RECORD WRITTEN · COMMIT_SLOT CLOSED · RENT REFUNDED</div>
          <div className="mono" style={{ fontSize: 11, color: '#9a9aa3' }}>SETL-1E77…B502 · BLOCK 312,847,291</div>
        </div>
      )}
    </div>
  );
}

function ProverBlock({ party, label, progress, settled }: { party: string; label: string; progress: number; settled: boolean }) {
  const ROWS = 10, COLS = 42, TOT = ROWS * COLS;
  const lit = Math.floor(TOT * progress);
  return (
    <div style={{ padding: '16px 20px', border: `1px solid ${settled ? 'var(--green)' : 'var(--accent)'}`, background: 'var(--d-bg-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: settled ? 'var(--green)' : 'var(--accent)' }}>● PARTY {party}</span>
        <span className="mono" style={{ fontSize: 10, color: '#5a5a63' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 3 }}>
        {Array.from({ length: TOT }).map((_, i) => (
          <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: i < lit ? (settled ? 'var(--green)' : 'var(--accent)') : '#2a2a35', justifySelf: 'center', transition: 'background .1s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '.15em', color: '#5a5a63' }}>{Math.floor(12778 * progress).toLocaleString()} / 12,778 LIT</span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '.15em', color: settled ? 'var(--green)' : 'var(--accent)' }}>{settled ? '✓ VERIFIED' : progress >= 1 ? '✓ READY' : `PROVING · ${(progress * 3).toFixed(1)}s`}</span>
      </div>
    </div>
  );
}

function NarrationStrip({ act, t }: { act: number; t: (z: string, e: string) => string }) {
  const lines: (null | [string, string])[] = [
    null,
    [t('I · 承诺 / Commit', 'I · Commit'), t('A 在链下计算 SHA-256(120B)，把唯一的 32 字节哈希压上链。无密文，无 ZK，仅有时间戳和不可篡改的法律锚点。', 'A computes SHA-256(120B) off-chain and stamps the resulting 32-byte hash on-chain. No ciphertext, no ZK — just an immutable legal anchor in time.')],
    [t('I · 等待 / Waiting', 'I · Waiting'), t('60 秒倒计时启动。B 通过链下信道得知明文金额，本地重算哈希并验证一致。', 'A 60-second countdown begins. B learns the plaintext amount through an off-chain channel, recomputes and verifies the hash.')],
    [t('II · 对称双锁 / Symmetric Lock', 'II · Symmetric Lock'), t('B 提交 accept_commit 的瞬间，B 的余额也被冻结。期权窗口在同一帧归零——这是 v3.0 最锋利的博弈一刀。', "The instant B submits accept_commit, B's balance also freezes. The option window collapses to zero in the same frame — v3.0's sharpest game-theoretic edge.")],
    [t('III · 双证执行 / Dual-Proof Execute', 'III · Dual-Proof Execute'), t('双方并行生成 Groth16 证明（约 4 秒）。承诺哈希在合约里被重算并校验。', 'Both parties generate Groth16 proofs in parallel (~4s). The commitment hash is recomputed on-chain and verified.')],
    [t('III · 写入', 'III · Write'), t('约 220K CU 的单笔交易完成原子结算。CommitSlot 关闭，租金返还，SettlementRecord 永久存档。', 'A single ~220K CU transaction performs the atomic settlement. CommitSlot closes, rent is refunded, the Settlement Record is archived forever.')],
    [t('III · 完成', 'III · Done'), t('双方均回到 Active 状态。链上留下不可抵赖的承诺、对称锁定、双方证明、最终结算——完整的法律证据链。', 'Both parties return to Active. The chain retains an irrefutable record: commitment, symmetric lock, both proofs, final settlement — a complete legal evidence chain.')],
  ];
  const line = lines[act];
  return (
    <div style={{ marginTop: 24, padding: '18px 24px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)', minHeight: 96, display: 'flex', alignItems: 'center', gap: 24 }}>
      {line ? <>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{line[0]}</span>
        <span style={{ width: 1, height: 30, background: 'var(--d-line-2)' }} />
        <span className="serif" style={{ fontStyle: 'italic', fontSize: 17, color: '#f4f1ea', lineHeight: 1.5, textWrap: 'pretty' as const }}>{line[1]}</span>
      </> : <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: '#5a5a63' }}>· STANDBY · PRESS PLAY ·</span>}
    </div>
  );
}

// ── Version Slots ─────────────────────────────────────────────────────
function VersionSlotsSection({ lang }: { lang: string }) {
  const [t1, setT1] = useState(0);
  const [running, setRunning] = useState(false);
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const N = 5;
  const SERIAL_TOTAL = N * (4 + 0.5);
  const PARALLEL_TOTAL = 4 + N * 0.5;

  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const e = (now - start) / 1000;
      setT1(e);
      if (e < SERIAL_TOTAL + 1) raf = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const reset = () => { setT1(0); setRunning(false); };
  const play = () => { setT1(0); setRunning(true); };

  return (
    <section style={{ padding: '80px 48px', background: 'var(--bg)', borderTop: '1px solid var(--ink)' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, marginBottom: 32, paddingBottom: 18, borderBottom: '1px solid var(--ink)' }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.28em', color: 'var(--ink-3)' }}>FIG. 03 — VERSION SLOTS</div>
            <h2 className="serif" style={{ margin: '10px 0 0', fontSize: 54, fontWeight: 300, letterSpacing: '-.025em', lineHeight: 1 }}>
              {t('做市商，并发引擎。', 'Market makers, in parallel.')}
            </h2>
          </div>
          <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 680 }}>
              {t('ZK 证明依赖账本版本号，让多笔结算天然串行。版本槽预分配把这个串行死锁拆成流水线——5 笔证明同时计算，按序上链。', 'ZK proofs depend on the ledger version number, forcing serial execution. Pre-reserving version slots breaks the deadlock — 5 proofs computed in parallel, submitted in order.')}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn solid" onClick={running ? reset : play}>
                {running ? t('■ 停止', '■ STOP') : t('▶ 对比演示', '▶ COMPARE')}
              </button>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)', alignSelf: 'center' }}>RESERVE_VERSION_SLOTS(5)</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <PipelineColumn label={t('串行 / SERIAL', 'SERIAL')} mode="serial" t1={t1} N={N} totalSec={SERIAL_TOTAL} />
          <PipelineColumn label={t('并行 / PARALLEL', 'PARALLEL')} mode="parallel" t1={t1} N={N} totalSec={PARALLEL_TOTAL} accent />
        </div>

        <div style={{ marginTop: 32, padding: '24px 32px', border: '1px solid var(--ink)', background: 'var(--bg-2)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--ink-3)' }}>SERIAL</div>
            <div className="serif" style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-.02em', color: 'var(--ink-2)', marginTop: 4 }}>22.5<span style={{ fontSize: 18, color: 'var(--ink-3)' }}>s</span></div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--accent)' }}>PARALLEL</div>
            <div className="serif" style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-.02em', color: 'var(--accent)', marginTop: 4 }}>6.5<span style={{ fontSize: 18, color: 'var(--ink-3)' }}>s</span></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--ink-3)' }}>SPEEDUP</div>
            <div className="serif" style={{ fontStyle: 'italic', fontSize: 42, fontWeight: 300, letterSpacing: '-.02em', color: 'var(--ink)', marginTop: 4 }}>3.5×</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelineColumn({ label, mode, t1, N, totalSec, accent }: { label: string; mode: string; t1: number; N: number; totalSec: number; accent?: boolean }) {
  const lanes = Array.from({ length: N });
  return (
    <div style={{ padding: '22px 26px', border: `1px solid ${accent ? 'var(--accent)' : 'var(--ink)'}`, background: accent ? 'var(--accent-soft)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <span className="grot" style={{ fontSize: 22, letterSpacing: '-.01em', color: accent ? 'var(--accent)' : 'var(--ink)' }}>{label}</span>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--ink-3)' }}>EST. {totalSec.toFixed(1)}s</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lanes.map((_, i) => {
          const proveStart = mode === 'serial' ? i * 4.5 : 0;
          const submitStart = mode === 'serial' ? proveStart + 4 : 4 + i * 0.5;
          const submitEnd = submitStart + 0.5;
          const proveProgress = Math.max(0, Math.min(1, (t1 - proveStart) / 4));
          const submitProgress = Math.max(0, Math.min(1, (t1 - submitStart) / 0.5));
          const done = t1 >= submitEnd;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 70px', alignItems: 'center', gap: 12, height: 24 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em', color: 'var(--ink-3)' }}>SLOT {i + 1}</span>
              <div style={{ position: 'relative', height: 14, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
                <div style={{ position: 'absolute', left: `${(proveStart / totalSec) * 100}%`, top: 0, bottom: 0, width: `${(4 / totalSec) * 100 * proveProgress}%`, background: accent ? 'var(--accent)' : 'var(--ink-3)', transition: 'width .05s linear' }} />
                <div style={{ position: 'absolute', left: `${(submitStart / totalSec) * 100}%`, top: 0, bottom: 0, width: `${(0.5 / totalSec) * 100 * submitProgress}%`, background: 'var(--green)', transition: 'width .05s linear' }} />
              </div>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '.12em', color: done ? 'var(--green)' : 'var(--ink-faint)', textAlign: 'right' }}>{done ? `✓ V${i + 1}` : ''}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--ink-3)' }}>▮ PROVE &nbsp; ▮ SUBMIT</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', letterSpacing: '.1em' }}>t = {t1.toFixed(1)}s</span>
      </div>
    </div>
  );
}

// ── Game Matrix ───────────────────────────────────────────────────────
function GameMatrix({ lang }: { lang: string }) {
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const [hover, setHover] = useState<string | null>(null);
  const cells: Record<string, { title: string; tone: string; body: string }> = {
    aa: { title: t('结算成功', 'SETTLED'), tone: 'green', body: t('双方各得所需。CommitSlot 关闭。', 'Both get what they bargained for. Slot closes.') },
    an: { title: t('B 错失交易', 'B walks'), tone: 'gold', body: t('60s 后 A 调用 cancel_initiate，无损解锁。', 'After 60s, A cancels — unscathed.') },
    na: { title: t('B 锁死攻击', 'B grief'), tone: 'danger', body: t('30s 后任一方调用 cancel_mutual，双方解锁。B 仅损失 Gas。', '30s later either side cancels. B forfeits only gas.') },
    nn: { title: t('未发生', 'no protocol'), tone: 'ink', body: t('双方未上链，回到链下协商失败。', 'Nothing on chain. Pure off-chain failure.') },
  };

  const Cell = ({ k, label }: { k: string; label: string }) => {
    const c = cells[k];
    const tones: Record<string, string> = { green: 'var(--green)', gold: 'var(--gold)', danger: 'var(--danger)', ink: 'var(--ink-3)' };
    const tc = tones[c.tone];
    return (
      <button onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}
        style={{ padding: '24px 22px', border: `1px solid ${hover === k ? tc : 'var(--line-2)'}`, background: hover === k ? 'var(--bg-2)' : 'var(--bg)', transition: 'all .2s', textAlign: 'left', cursor: 'default', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}>
        <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.18em', color: 'var(--ink-3)' }}>{label}</span>
        <span className="serif" style={{ fontStyle: 'italic', fontSize: 24, color: tc, lineHeight: 1, letterSpacing: '-.01em' }}>{c.title}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 4 }}>{c.body}</span>
      </button>
    );
  };

  return (
    <section style={{ padding: '80px 48px', background: 'var(--bg-2)', borderTop: '1px solid var(--ink)' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 48, marginBottom: 32 }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.28em', color: 'var(--ink-3)' }}>FIG. 04 — GAME THEORY</div>
            <h2 className="serif" style={{ margin: '10px 0 0', fontSize: 54, fontWeight: 300, letterSpacing: '-.025em', lineHeight: 1 }}>
              {t('博弈，矩阵化。', 'Game, in a matrix.')}
            </h2>
          </div>
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 18, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 680, paddingTop: 8 }}>
            {t('每一格都是一个理性博弈结局。把光标放在格子上，看协议在每个分支里做了什么。', 'Each cell is a rational game outcome. Hover any cell to see what the protocol does in that branch.')}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 0 }}>
          <div />
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--ink)', textAlign: 'center' }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--ink)' }}>B · ACCEPT (60s)</span>
          </div>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--ink)', textAlign: 'center' }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--ink-3)' }}>B · NO ACCEPT</span>
          </div>
          <div style={{ padding: '24px 20px', borderRight: '1px solid var(--ink)', display: 'flex', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--ink)' }}>A · INITIATE</span>
          </div>
          <Cell k="aa" label="A · INITIATE × B · ACCEPT" />
          <Cell k="an" label="A · INITIATE × B · IGNORE" />
          <div style={{ padding: '24px 20px', borderRight: '1px solid var(--ink)', display: 'flex', alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '.2em', color: 'var(--ink-3)' }}>A · NO INITIATE</span>
          </div>
          <Cell k="na" label="(post-accept grief variant)" />
          <Cell k="nn" label="—" />
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────
function FooterColophon({ lang }: { lang: string }) {
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  return (
    <footer style={{ padding: '56px 48px 36px', background: 'var(--bg)', borderTop: '2px solid var(--ink)' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 32 }}>
        <div>
          <NexumSeal size={48} />
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 22, color: 'var(--ink)', marginTop: 18, letterSpacing: '-.01em', maxWidth: 380, lineHeight: 1.3 }}>
            {t('为彼此尚不信任的机构而生。', 'Built for institutions that do not yet trust one another.')}
          </div>
        </div>
        {[
          [t('协议', 'Protocol'), ['Scheme A', 'Scheme B v3.0', 'Audit Oracle', 'Whitepaper']],
          [t('开发', 'Build'), ['SDK', 'Circuits', 'RPC', 'Devnet']],
          [t('合规', 'Compliance'), ['MAS', 'SEC', 'FCA', 'Audit log']],
        ].map(([title, items], i) => (
          <div key={i}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '.22em', color: 'var(--ink-3)', marginBottom: 14 }}>{(title as string).toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(items as string[]).map((it, j) => (
                <a key={j} className="serif" style={{ fontSize: 15, color: 'var(--ink-2)' }}>{it} <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>↗</span></a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1500, margin: '40px auto 0', paddingTop: 18, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '.2em', color: 'var(--ink-3)' }}>NEXUM PROTOCOL · COLOSSEUM FRONTIER · 2026 · COLOPHON SET IN FRAUNCES &amp; INTER TIGHT</span>
        <span className="serif" style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--ink-3)' }}>{t('— 完 / fin —', '— fin —')}</span>
      </div>
    </footer>
  );
}
