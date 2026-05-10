// Shared primitive components used across Nexum pages.
const { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;

// ─── Nexum Logo (Concept A) ────────────────────────────────
function NexumMark({ size = 32, muted = false }){
  const g = muted ? '#c9cbd6' : '#7cf0b5';
  const v = muted ? '#6b6e7d' : '#a78bfa';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{display:'block'}}>
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#0f1118" stroke="#262836"/>
      <path d="M13 34 L13 14 L35 34 L35 14" stroke={g} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="13" cy="14" r="2.4" fill={g}/>
      <circle cx="35" cy="34" r="2.4" fill={v}/>
      <path d="M13 34 Q 24 24 35 14" stroke={v} strokeWidth="1.2" strokeDasharray="2 3" fill="none" opacity=".85"/>
    </svg>
  );
}

// ─── Live slot counter ──────────────────────────────────────
function SlotCounter({ t }){
  const [slot, setSlot] = useState(312847291);
  useEffect(()=>{
    const id = setInterval(()=> setSlot(s => s + 1), 420);
    return ()=> clearInterval(id);
  },[]);
  return (
    <div className="pill">
      <span className="dot"/>
      <span>{t('slot')}</span>
      <span style={{color:'#c9cbd6'}}>{slot.toLocaleString()}</span>
    </div>
  );
}

// ─── Live settlement ticker ─────────────────────────────────
const TICKER_ITEMS = [
  { id:'SETL-8F2A…9C11', pair:'USDC/SOL',  cu:198412, age:'12s' },
  { id:'SETL-3C9B…4D88', pair:'USDC/USDT', cu:197310, age:'41s' },
  { id:'SETL-1E77…B502', pair:'USDC/SOL',  cu:199001, age:'02m' },
  { id:'AUDIT-72FE…0A',  pair:'MAS · SG',  cu: 86200, age:'04m', v:true },
  { id:'SETL-9001…5C3D', pair:'USDC/SOL',  cu:198002, age:'06m' },
  { id:'SETL-44BE…E812', pair:'SOL/wBTC',  cu:197880, age:'08m' },
  { id:'AUDIT-1CA3…9F',  pair:'SEC · US',  cu: 87100, age:'11m', v:true },
  { id:'SETL-FB20…770A', pair:'USDC/USDT', cu:196940, age:'14m' },
  { id:'SETL-0004…1199', pair:'USDC/SOL',  cu:198760, age:'18m' },
  { id:'SETL-AA12…EE91', pair:'SOL/wBTC',  cu:197501, age:'22m' },
];

function Ticker(){
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{position:'relative',overflow:'hidden',borderTop:'1px solid var(--line)',borderBottom:'1px solid var(--line)',background:'rgba(11,13,20,.6)',backdropFilter:'blur(8px)'}}>
      <div style={{display:'flex',gap:48,padding:'10px 0',animation:'marquee 80s linear infinite',whiteSpace:'nowrap'}}>
        {items.map((it,i)=>(
          <span key={i} className="mono" style={{fontSize:11,color:'var(--ink-dim)',letterSpacing:'.05em',display:'inline-flex',alignItems:'center',gap:12}}>
            <span className="dot" style={{width:6,height:6,borderRadius:3,background:it.v?'var(--violet)':'var(--accent)',display:'inline-block',animation:'pulse-dot 2s ease-in-out infinite'}}/>
            <span style={{color:it.v?'var(--violet)':'var(--accent)'}}>{it.id}</span>
            <span>· {it.pair}</span>
            <span>· {it.cu.toLocaleString()} CU</span>
            <span style={{color:'var(--ink-faint)'}}>· {it.age} ago</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Segmented control ─────────────────────────────────────
function Segmented({ options, value, onChange, variant='green' }){
  return (
    <div style={{display:'inline-flex',background:'var(--panel-2)',border:'1px solid var(--line-2)',borderRadius:8,padding:3,gap:3}}>
      {options.map(o=>{
        const active = value===o.value;
        const activeStyle = {
          green: {background:'var(--accent-soft)',color:'var(--accent)',boxShadow:'inset 0 0 0 1px var(--accent-line)'},
          violet: {background:'var(--violet-soft)',color:'var(--violet)',boxShadow:'inset 0 0 0 1px var(--violet-line)'},
        }[variant];
        return (
          <button key={o.value} onClick={()=>onChange(o.value)}
            className="mono"
            style={{padding:'8px 14px',borderRadius:6,fontSize:11,letterSpacing:'.1em',textTransform:'uppercase',color:active?undefined:'var(--ink-dim)',...(active?activeStyle:{})}}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Hashed digits "decrypting" effect ─────────────────────
function DigitScramble({ target, duration=900, running, decimals=2, suffix='' }){
  const [display, setDisplay] = useState('');
  useEffect(()=>{
    if(!running){ setDisplay(target.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})); return; }
    const start = performance.now();
    let raf;
    const tick = (now)=>{
      const p = Math.min(1,(now-start)/duration);
      const targetStr = target.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
      if(p>=1){ setDisplay(targetStr); return; }
      // show random digits for first 70%, stable reveal in last 30%
      const reveal = Math.floor(targetStr.length * Math.max(0,(p-.3)/.7));
      let out = '';
      for(let i=0;i<targetStr.length;i++){
        const ch = targetStr[i];
        if(i<reveal || /[,.\s]/.test(ch)) out += ch;
        else out += Math.floor(Math.random()*10);
      }
      setDisplay(out);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=> cancelAnimationFrame(raf);
  },[running,target,duration,decimals]);
  return <span>{display}{suffix}</span>;
}

// ─── Short hash / addr display ─────────────────────────────
function ShortHash({ value, prefix=6, suffix=4 }){
  if(!value) return <span>—</span>;
  if(value.length <= prefix+suffix+1) return <span className="mono">{value}</span>;
  return <span className="mono">{value.slice(0,prefix)}…{value.slice(-suffix)}</span>;
}

// ─── Utility: generate pseudo-hex ──────────────────────────
function hex(len){
  const chars='0123456789abcdef';
  let s=''; for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*16)];
  return s;
}
function groupedHex(len, group=4){
  const h = hex(len);
  let out=''; for(let i=0;i<h.length;i+=group){ out += h.slice(i,i+group)+' '; }
  return out.trim();
}

Object.assign(window, {
  NexumMark, SlotCounter, Ticker, Segmented, DigitScramble, ShortHash, hex, groupedHex,
  TICKER_ITEMS,
});
