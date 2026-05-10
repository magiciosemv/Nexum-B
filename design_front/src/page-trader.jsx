// P5 Trader Settlement Terminal — the core page
const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM } = React;

// Phases of the settlement state machine
const PHASES = ['idle','proving','exchanging','submitting','success'];

function SettlementTerminal({ t, lang, setPage, demoTrigger }){
  const [phase, setPhase] = uS('idle');
  const [amount, setAmount] = uS('500000');
  const [role, setRole] = uS('sender'); // sender | receiver
  const [progress, setProgress] = uS(0);   // 0..1 for prover
  const [cpLockedIn, setCpLockedIn] = uS(false);
  const [settledAt, setSettledAt] = uS(null);
  const [localDecrypted, setLocalDecrypted] = uS(false);

  // bal auto-decrypts on mount (BSGS lookup)
  uE(()=>{
    const t1 = setTimeout(()=> setLocalDecrypted(true), 1600);
    return ()=> clearTimeout(t1);
  },[]);

  // state machine driver
  uE(()=>{
    if(phase==='proving'){
      const start = performance.now();
      const dur = 3000;
      let raf;
      const tick = (now)=>{
        const p = Math.min(1,(now-start)/dur);
        setProgress(p);
        if(p<1) raf = requestAnimationFrame(tick);
        else { setPhase('exchanging'); setTimeout(()=>setCpLockedIn(true), 400); }
      };
      raf = requestAnimationFrame(tick);
      return ()=> cancelAnimationFrame(raf);
    }
    if(phase==='exchanging'){
      const id = setTimeout(()=> setPhase('submitting'), 1500);
      return ()=> clearTimeout(id);
    }
    if(phase==='submitting'){
      const id = setTimeout(()=>{ setPhase('success'); setSettledAt(Date.now()); }, 1400);
      return ()=> clearTimeout(id);
    }
  },[phase]);

  uE(()=>{
    if(demoTrigger){
      setPhase('idle'); setProgress(0); setCpLockedIn(false); setSettledAt(null);
      setTimeout(()=> setPhase('proving'), 200);
    }
  },[demoTrigger]);

  const amt = Math.max(0, parseFloat(amount.replace(/,/g,'')||'0'));
  const oldBal = 1250000;
  const newBal = role==='sender' ? oldBal - amt : oldBal + amt;
  const canProve = amt>0 && amt<=oldBal && phase==='idle';

  const start = ()=>{ if(canProve){ setPhase('proving'); setProgress(0); setCpLockedIn(false); setSettledAt(null); }};
  const reset = ()=>{ setPhase('idle'); setProgress(0); setCpLockedIn(false); setSettledAt(null); };

  return (
    <div style={{maxWidth:1400,margin:'0 auto',padding:'20px 32px 32px',position:'relative',zIndex:2}}>
      <TraderTopbar t={t} phase={phase} onReset={reset}/>

      <div style={{display:'grid',gridTemplateColumns:'340px 1fr 320px',gap:16,marginTop:16}}>
        <ConfigPanel t={t} amount={amount} setAmount={setAmount} role={role} setRole={setRole}
                     oldBal={oldBal} newBal={newBal} amt={amt} localDecrypted={localDecrypted}
                     canProve={canProve} phase={phase} onStart={start}/>
        <ProverStage t={t} phase={phase} progress={progress}/>
        <HandshakeAndCU t={t} phase={phase} cpLockedIn={cpLockedIn}/>
      </div>

      <DiffViewer t={t} phase={phase} settledAt={settledAt}/>
    </div>
  );
}

// ─── Topbar with page tabs + demo button ─────────────────
function TraderTopbar({ t, phase, onReset }){
  const label = {
    idle:'READY', proving:t('term_generating'), exchanging:t('term_exchanging'),
    submitting:t('term_submitting'), success:t('term_success')
  }[phase];
  const color = phase==='success'?'var(--accent)':phase==='idle'?'var(--ink-dim)':'var(--gold)';
  return (
    <div className="panel" style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:18}}>
      <NexumMark size={24}/>
      <span className="mono" style={{fontSize:11,letterSpacing:'.15em'}}>NEXUM<span style={{color:'var(--ink-faint)'}}> · </span><span style={{color:'var(--accent)'}}>TRADER</span></span>
      <div style={{flex:1}}/>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{width:8,height:8,borderRadius:4,background:color,boxShadow:phase!=='idle'?`0 0 10px ${color}`:'none',animation:phase!=='idle'&&phase!=='success'?'pulse-dot 1.2s infinite':'none'}}/>
        <span className="mono" style={{fontSize:11,color,letterSpacing:'.15em',textTransform:'uppercase'}}>{label}</span>
      </div>
      <div style={{width:1,height:18,background:'var(--line-2)'}}/>
      <SlotCounter t={t}/>
      {phase==='success' && (
        <button className="btn" onClick={onReset} style={{padding:'8px 12px',fontSize:10.5}}>RESET</button>
      )}
    </div>
  );
}

// ─── LEFT: config panel ────────────────────────────────────
function ConfigPanel({ t, amount, setAmount, role, setRole, oldBal, newBal, amt, localDecrypted, canProve, phase, onStart }){
  const pctOfLedger = oldBal>0 ? (amt/oldBal*100).toFixed(1) : '0.0';
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:16,alignSelf:'start'}}>
      <div className="kicker">{t('term_trade_intent')}</div>

      <div>
        <div style={{fontSize:11,color:'var(--ink-dim)',marginBottom:6}}>{t('term_cpty')}</div>
        <div className="panel-2" style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:10}}>
          <span className="mono" style={{fontSize:11,color:'var(--accent)'}}>2vBa…zL9o</span>
          <span style={{flex:1}}/>
          <span className="mono" style={{fontSize:9,color:'var(--accent)',letterSpacing:'.15em'}}>{t('term_kyb')} ✓</span>
        </div>
      </div>

      <div>
        <div style={{fontSize:11,color:'var(--ink-dim)',marginBottom:6}}>{t('term_role')}</div>
        <Segmented
          variant="green"
          value={role}
          onChange={setRole}
          options={[
            {value:'sender', label:t('term_sender')},
            {value:'receiver', label:t('term_receiver')},
          ]}
        />
      </div>

      <div>
        <div style={{fontSize:11,color:'var(--ink-dim)',marginBottom:6}}>{t('term_amount')}</div>
        <div className="panel-2" style={{padding:'14px 14px',display:'flex',alignItems:'baseline',gap:10}}>
          <input
            className="mono"
            value={Number(amount.replace(/,/g,'')||0).toLocaleString()}
            onChange={e=> setAmount(e.target.value.replace(/[^\d]/g,'') || '0')}
            style={{flex:1,background:'transparent',border:0,outline:'none',color:'var(--ink)',fontWeight:800,fontSize:26,fontFamily:'Inter, system-ui, sans-serif',width:0,minWidth:0}}
          />
          <span className="mono" style={{fontSize:11,color:'var(--ink-dim)'}}>USDC</span>
        </div>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',marginTop:6,letterSpacing:'.1em',textTransform:'uppercase'}}>≈ {pctOfLedger}% of ledger</div>
      </div>

      <div style={{height:1,background:'var(--line)'}}/>

      <div className="kicker">{t('term_preview')}</div>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--ink-dim)'}}>{t('term_old_bal')}</span>
          <span className="mono" style={{fontSize:12,color:'var(--accent)',fontWeight:600}}>
            {localDecrypted
              ? <DigitScramble target={oldBal} running={false} decimals={2}/>
              : <span style={{letterSpacing:'.1em'}}>████████████</span>}
          </span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--ink-dim)'}}>{role==='sender'?t('term_transfer'):'+ '+t('term_receiver').replace('+ ','')}</span>
          <span className="mono" style={{fontSize:12,color:role==='sender'?'var(--danger)':'var(--accent)',fontWeight:600}}>
            {role==='sender'?'−':'+'} {amt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
        </div>
        <div style={{height:1,background:'var(--line)'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,fontWeight:600}}>{t('term_new_bal')}</span>
          <span className="mono" style={{fontSize:14,color:newBal<0?'var(--danger)':'var(--accent)',fontWeight:700}}>
            {newBal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
        </div>
      </div>

      <button className="btn primary" onClick={onStart} disabled={!canProve}
        style={{padding:'14px 16px',justifyContent:'center',fontSize:11.5,marginTop:4}}>
        {phase==='idle'? t('term_generate') : phase==='success'? t('term_success') : '...'}
      </button>
    </div>
  );
}

// ─── CENTER: prover stage ──────────────────────────────────
function ProverStage({ t, phase, progress }){
  // 12,778 abstract constraints → 170 dots across 15 rows = 2550 slots, we style-animate subset
  const ROWS = 17, COLS = 46;
  const TOTAL = ROWS*COLS;
  const lit = Math.floor(TOTAL * progress);
  const litConstraints = Math.floor(12778 * progress);

  // phases within proving
  const stage = progress<.25?0 : progress<.6?1 : progress<.9?2 : 3;
  const stageLabels = [t('prover_witness'), t('prover_msm'), t('prover_pairing'), t('prover_serialize')];

  const proofBytes = uM(()=>{
    // deterministic-ish hex so it doesn't re-shuffle every frame
    const seed = Math.floor(progress*1000);
    let s='';
    const chars='0123456789abcdef';
    let x = seed*9301+49297;
    for(let i=0;i<60;i++){
      x = (x*1103515245+12345) & 0x7fffffff;
      s += chars[x&15];
      if(i%4===3) s+=' ';
    }
    return s.trim();
  },[progress]);

  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:16,minHeight:560}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="kicker">{t('prover_title')}</span>
        {phase!=='idle' && <span className="tag green">ACTIVE</span>}
      </div>

      {/* constraint grid */}
      <div className="panel-2" style={{padding:'18px 20px',position:'relative',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${COLS}, 1fr)`,gap:6,padding:'4px 0'}}>
          {Array.from({length:TOTAL}).map((_,i)=>{
            const on = i < lit;
            return <span key={i} style={{
              width:3,height:3,borderRadius:'50%',
              background: on?'#7cf0b5':'#2a2d3a',
              boxShadow: on && i > lit-40 ? '0 0 6px rgba(124,240,181,.8)' : 'none',
              transition:'background .1s, box-shadow .1s',
              justifySelf:'center',
            }}/>;
          })}
        </div>
        <div style={{marginTop:14,display:'flex',justifyContent:'center',alignItems:'center',gap:10}}>
          <span className="mono" style={{fontSize:10,color:'var(--ink-dim)',letterSpacing:'.2em',textTransform:'uppercase'}}>
            {t('prover_constraints')} · {litConstraints.toLocaleString()} / 12,778
          </span>
        </div>
      </div>

      {/* four-phase progress */}
      <div className="panel-2" style={{padding:'14px 18px'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
          {stageLabels.map((l,i)=>{
            const done = phase!=='idle' && phase!=='proving' || i<stage;
            const curr = phase==='proving' && i===stage;
            return (
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',gap:6,alignItems:'center'}}>
                <span className="mono" style={{fontSize:10,color: done?'var(--accent)': curr?'var(--gold)':'var(--ink-faint)',letterSpacing:'.12em',textTransform:'uppercase'}}>
                  {done?'✓ ':curr?'▸ ':'· '}{l}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:12,height:6,background:'#1a1d26',borderRadius:3,overflow:'hidden'}}>
          <div style={{width:`${Math.round(progress*100)}%`,height:'100%',background:'linear-gradient(90deg,var(--accent),rgba(124,240,181,.5))',transition:'width .1s linear'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
          <span className="mono" style={{fontSize:10,color:'var(--ink-faint)'}}>{(progress*3).toFixed(1)}s / ~3.0s</span>
          <span className="mono" style={{fontSize:10,color:'var(--ink-faint)'}}>{Math.round(progress*100)}%</span>
        </div>
      </div>

      {/* proof output */}
      <div className="panel-2" style={{padding:'14px 18px'}}>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.18em',textTransform:'uppercase',marginBottom:8}}>{t('prover_output')}</div>
        <div className="mono" style={{fontSize:11.5,color:phase==='idle'?'var(--ink-faint)':'var(--accent)',letterSpacing:'.04em',wordBreak:'break-all',lineHeight:1.7,minHeight:40}}>
          {phase==='idle' ? '— awaiting input —' :
            phase==='proving' ? proofBytes :
            '0x 1b3f 9c02 aa1e ef02 11a3 cd88 d81a 7c0d 0f91 22e4 5b10 8e4f 72a9 00e4'
          }
        </div>
        <div className="mono" style={{fontSize:9,color:'var(--ink-faint)',marginTop:6,letterSpacing:'.1em'}}>[ A (64B) | B (128B) | C (64B) ]</div>
      </div>
    </div>
  );
}

// ─── RIGHT: handshake + CU meter ───────────────────────────
function HandshakeAndCU({ t, phase, cpLockedIn }){
  const active = phase==='exchanging' || phase==='submitting' || phase==='success';
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:14,alignSelf:'start'}}>
      <div className="kicker">{t('hs_title')}</div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,position:'relative'}}>
        <PartyBox side="A" t={t} active={phase!=='idle'} label={t('hs_you')} role="is_sender = 1"/>
        <PartyBox side="B" t={t} active={cpLockedIn} label={t('hs_cpty')} role="is_sender = 0"/>
        {/* connector */}
        <div style={{position:'absolute',top:'50%',left:'50%',width:6,height:6,borderRadius:3,background:cpLockedIn?'var(--gold)':'var(--line-3)',transform:'translate(-50%,-50%)',boxShadow:cpLockedIn?'0 0 12px var(--gold)':'none',transition:'all .4s'}}/>
      </div>

      <div style={{border:'1px solid var(--gold-line)',background:'var(--gold-soft)',borderRadius:10,padding:'12px 14px'}}>
        <div className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:6}}>{t('hs_consistency')}</div>
        <div className="mono" style={{fontSize:11,color:'var(--gold)',lineHeight:1.6}}>
          audit_ct_a ⊟ audit_ct_b
          <br/>= (r_a − r_b) · audit_pk
        </div>
        <div className="mono" style={{fontSize:10,color: cpLockedIn?'var(--accent)':'var(--ink-faint)',marginTop:8,letterSpacing:'.15em',textTransform:'uppercase'}}>
          {cpLockedIn? t('hs_eq_ok') : '· pending'}
        </div>
      </div>

      <div style={{height:1,background:'var(--line)'}}/>

      <CUMeter t={t} active={active} success={phase==='success'}/>
    </div>
  );
}

function PartyBox({ side, t, active, label, role }){
  const isA = side==='A';
  const color = isA?'var(--accent)':'var(--violet)';
  const soft = isA?'var(--accent-soft)':'var(--violet-soft)';
  const line = isA?'var(--accent-line)':'var(--violet-line)';
  return (
    <div style={{border:`1px solid ${active?line:'var(--line-2)'}`,background:active?soft:'var(--panel-2)',borderRadius:10,padding:'12px 12px',display:'flex',flexDirection:'column',gap:6,transition:'all .3s'}}>
      <div className="mono" style={{fontSize:10,color:active?color:'var(--ink-faint)',letterSpacing:'.15em',textTransform:'uppercase'}}>{label}</div>
      <div className="mono" style={{fontSize:11,color:active?color:'var(--ink-faint)'}}>proof_{side.toLowerCase()} {active?'✓':'·'}</div>
      <div className="mono" style={{fontSize:11,color:active?color:'var(--ink-faint)'}}>audit_ct_{side.toLowerCase()} {active?'✓':'·'}</div>
      <div className="mono" style={{fontSize:9,color:'var(--ink-faint)',marginTop:2}}>{role}</div>
    </div>
  );
}

function CUMeter({ t, active, success }){
  const TOTAL = 400000;
  const lines = [
    ['verify_a',      64000, 'var(--gold)'],
    ['verify_b',      64000, 'var(--gold)'],
    ['ledger_update', 30000, 'var(--gold)'],
    ['settle_create', 15000, 'var(--gold)'],
    ['amt_consistency', 5000, 'var(--gold)'],
    ['runtime',       20000, 'var(--ink-dim)'],
  ];
  const used = lines.reduce((a,b)=>a+b[1],0);
  return (
    <div>
      <div className="kicker" style={{marginBottom:10}}>{t('cu_title')}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8}}>
        <span className="mono" style={{fontSize:32,fontWeight:800,color:active?'var(--gold)':'var(--ink-faint)',letterSpacing:'-.02em'}}>
          {active? used.toLocaleString() : '0'}
        </span>
        <span className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em'}}>/ {TOTAL.toLocaleString()}</span>
      </div>
      <div className="mono" style={{fontSize:10,color:'var(--ink-dim)'}}>{active?(used/TOTAL*100).toFixed(1):'0.0'}% {t('cu_budget')}</div>

      <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:7}}>
        {lines.map(([lbl,v,c],i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'80px 1fr 52px',gap:8,alignItems:'center'}}>
            <span className="mono" style={{fontSize:9.5,color:'var(--ink-faint)',letterSpacing:'.08em'}}>{lbl}</span>
            <div style={{height:6,background:'#1a1d26',borderRadius:3,overflow:'hidden'}}>
              <div style={{width: active? `${(v/TOTAL*100).toFixed(1)}%` : 0, height:'100%', background:c, transition:`width ${0.4+i*0.08}s ease-out`, transitionDelay:`${i*0.1}s`}}/>
            </div>
            <span className="mono" style={{fontSize:9.5,color:active?'var(--gold)':'var(--ink-faint)',textAlign:'right'}}>{active? v.toLocaleString():'—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BOTTOM: ledger diff ───────────────────────────────────
function DiffViewer({ t, phase, settledAt }){
  const done = phase==='success';
  return (
    <div className="panel" style={{padding:22,marginTop:16,display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="kicker">{t('diff_title')}</span>
        {done && <span className="tag green">WRITTEN AT BLOCK · 312,847,291</span>}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <DiffCard label={t('diff_my_ledger')} written={done}
          oldHex="0x 2b4f 9c02 aa1e ef02 11a3 cd88 d81a"
          newHex="0x 71fc 3e12 8801 2e90 00b2 4a7f 90b2"
          oldV={7} newV={8} bytes={26}
          t={t}/>
        <DiffCard label={t('diff_cpty_ledger')} written={done}
          oldHex="0x 44be e781 0011 22aa b0c4 9e32 e812"
          newHex="0x 9001 5c3d 771a 2e44 0129 bb77 5c3d"
          oldV={3} newV={4} bytes={30}
          t={t}/>
      </div>
    </div>
  );
}

function DiffCard({ label, oldHex, newHex, oldV, newV, bytes, written, t }){
  return (
    <div className="panel-2" style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:8}}>
      <div className="mono" style={{fontSize:10,color:'var(--ink-dim)',letterSpacing:'.12em'}}>{label}</div>
      <div className="mono" style={{fontSize:11,color: written?'var(--danger)':'var(--ink-faint)',textDecoration:written?'line-through':'none',transition:'all .3s'}}>
        {oldHex}
      </div>
      <div className="mono" style={{fontSize:11,color: written?'var(--accent)':'var(--ink-faint)',transition:'all .3s'}}>
        {written ? newHex : '— pending settlement —'}
      </div>
      <div style={{display:'flex',gap:14,marginTop:2}}>
        <span className="mono" style={{fontSize:10,color:'var(--ink-faint)'}}>
          {t('diff_version')} <span style={{color:written?'var(--danger)':'var(--ink-faint)',textDecoration:written?'line-through':'none'}}>{oldV}</span>
          {written && <span style={{color:'var(--accent)'}}> → {newV}</span>}
        </span>
        {written && <span className="mono" style={{fontSize:10,color:'var(--ink-dim)'}}>· {bytes} {t('diff_bytes')}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { SettlementTerminal });
