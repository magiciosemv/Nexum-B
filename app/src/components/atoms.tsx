// Shared atoms for Nexum v3 design system
import { useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';

// ── Logo: a sealed envelope mark — three-act commitment glyph ──
interface NexumSealProps {
  size?: number;
  dark?: boolean;
}

export function NexumSeal({ size = 40, dark = false }: NexumSealProps) {
  const ink = dark ? '#f4f1ea' : '#0a0a0c';
  const acc = '#e2502b';
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none" style={{ display: 'block' }}>
      <rect x="2" y="2" width="56" height="56" stroke={ink} strokeWidth="1.5" />
      <path d="M14 42 L14 18 L46 42 L46 18" stroke={ink} strokeWidth="2.4" strokeLinecap="square" fill="none" />
      <circle cx="46" cy="18" r="3.2" fill={acc} />
      <path d="M2 8 L8 8 M52 8 L58 8 M2 52 L8 52 M52 52 L58 52" stroke={ink} strokeWidth="1" />
    </svg>
  );
}

// ── Wordmark with thin caps ──
interface WordmarkProps {
  dark?: boolean;
  sub?: string;
}

export function Wordmark({ dark = false, sub = 'PROTOCOL · v3.0' }: WordmarkProps) {
  const c1 = dark ? '#f4f1ea' : '#0a0a0c';
  const c2 = dark ? '#9a9aa3' : '#4a4a55';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, letterSpacing: '-.02em' }}>
      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 600, fontSize: 22, color: c1, letterSpacing: '-.01em' }}>Nexum</span>
      <span style={{ width: 1, height: 14, background: c2, opacity: .5, alignSelf: 'center' }} />
      <span className="mono" style={{ fontSize: 9.5, letterSpacing: '.22em', color: c2, paddingTop: 4 }}>{sub}</span>
    </div>
  );
}

// ── Live-ish solana slot ──
interface SlotProps {
  dark?: boolean;
}

export function Slot({ dark = false }: SlotProps) {
  const [s, setS] = useState(312847291);
  useEffect(() => {
    const id = setInterval(() => setS(x => x + 1 + Math.floor(Math.random() * 2)), 420);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="mono" style={{ fontSize: 11, color: dark ? '#9a9aa3' : 'var(--ink-3)', letterSpacing: '.08em' }}>
      <span style={{ color: dark ? '#5a5a63' : 'var(--ink-faint)' }}>SLOT </span>{s.toLocaleString()}
    </span>
  );
}

// ── Atomic countdown ring ──
interface CountdownRingProps {
  duration?: number;
  running?: boolean;
  onEnd?: () => void;
  size?: number;
  label?: string;
  sublabel?: string;
  accent?: string;
}

export function CountdownRing({
  duration = 60,
  running = true,
  onEnd,
  size = 180,
  label,
  sublabel,
  accent = 'var(--accent)',
}: CountdownRingProps) {
  const [t, setT] = useState(duration);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) { setT(duration); startRef.current = null; return; }
    startRef.current = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = (now - startRef.current!) / 1000;
      const remaining = Math.max(0, duration - elapsed);
      setT(remaining);
      if (remaining > 0) raf = requestAnimationFrame(tick);
      else if (onEnd) onEnd();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, duration, onEnd]);

  const pct = t / duration;
  const r = size * 0.42, c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  const danger = pct < 0.25;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="1" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={danger ? 'var(--accent)' : accent} strokeWidth="2.5" fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="butt"
          style={{ transition: 'stroke-dashoffset .15s linear, stroke .3s' }} />
        {Array.from({ length: Math.floor(duration / 5) }).map((_, i) => {
          const a = (i / (duration / 5)) * Math.PI * 2;
          const x1 = size / 2 + Math.cos(a) * (r + 6);
          const y1 = size / 2 + Math.sin(a) * (r + 6);
          const x2 = size / 2 + Math.cos(a) * (r + 12);
          const y2 = size / 2 + Math.sin(a) * (r + 12);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-2)" strokeWidth="0.8" />;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        {label && <div className="label" style={{ fontSize: 9, letterSpacing: '.25em', color: 'var(--ink-faint)' }}>{label}</div>}
        <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: size * 0.32, letterSpacing: '-.04em', color: danger ? 'var(--accent)' : 'var(--ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {t.toFixed(1)}<span style={{ fontSize: size * 0.13, color: 'var(--ink-faint)', marginLeft: 4 }}>s</span>
        </div>
        {sublabel && <div className="mono" style={{ fontSize: 9, letterSpacing: '.18em', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>{sublabel}</div>}
      </div>
    </div>
  );
}

// ── Marquee strip ──
export function ParchmentTicker() {
  const items = [
    'COMMIT 8F2A·9C11', 'USDC/SOL · 198.4k CU', 'EXEC 3.0s', '\u2503',
    'COMMIT 3C9B·4D88', 'USDC/USDT · 197.3k CU', 'ACCEPT IN 12s', '\u2503',
    'CANCEL_MUTUAL FB20·770A', 'BOTH RELEASED', '\u2503',
    'COMMIT 1E77·B502', 'SOL/wBTC · 199.0k CU', 'ACCEPT IN 41s', '\u2503',
    'VERSION_SLOTS RESERVED \u00d720', 'MM-DESK-04', '\u2503',
    'EXECUTE 9001·5C3D', 'PARALLEL \u00d75', '6.5s TOTAL', '\u2503',
    'COMMITMENT_HASH MISMATCH (rejected)', 'SLOT FB12·E9', '\u2503',
  ];
  const row = items.concat(items);
  return (
    <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', background: 'var(--bg)', overflow: 'hidden', height: 36, display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'inline-flex', gap: 32, whiteSpace: 'nowrap', animation: 'marquee-x 60s linear infinite', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.12em', color: 'var(--ink-2)' }}>
        {row.map((it, i) => (
          <span key={i} style={{
            color: it.includes('COMMIT') && !it.includes('HASH') ? 'var(--accent)'
              : it.includes('EXECUTE') || it.includes('EXEC') ? 'var(--green)'
                : it.includes('CANCEL') || it.includes('MISMATCH') ? 'var(--danger)'
                  : it === '\u2503' ? 'var(--line-2)' : 'var(--ink-3)'
          }}>{it}</span>
        ))}
      </div>
    </div>
  );
}
