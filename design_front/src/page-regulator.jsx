// P7 Regulator Audit — PCR lock ring ceremony + AuditLog enforcement
const { useState: rS, useEffect: rE, useMemo: rM, useRef: rR } = React;

const REG_RECORDS = [
  { id:'SETL-1E77…B502', pair:'USDC/SOL',  age_zh:'刚刚',   age_en:'just now', filter:'MAS', amount:500000, initiator:'7xKp…mNqR', cpty:'2vBa…zL9o' },
  { id:'SETL-8F2A…9C11', pair:'USDC/SOL',  age_zh:'2天前',  age_en:'2d ago',    filter:'—',  amount:250000, initiator:'9jLp…tt4R', cpty:'2vBa…zL9o' },
  { id:'SETL-3C9B…4D88', pair:'USDC/USDT', age_zh:'3天前',  age_en:'3d ago',    filter:'—',  amount:180000, initiator:'5kKp…aaAR', cpty:'0uBa…zX1o' },
];

const AUDITED_LIST = [
  { id:'AUDIT-72FE…0A', ref:'SETL-1E77…B502', region:'MAS · SG', t:'just decrypted' },
  { id:'AUDIT-1CA3…9F', ref:'SETL-9001…5C3D', region:'SEC · US', t:'11m ago' },
  { id:'AUDIT-BB04…1F', ref:'SETL-3C9B…4D88', region:'FCA · UK', t:'1h ago' },
];

function RegulatorTerminal({ t, lang, setPage, demoTrigger }){
  const [sel, setSel] = rS(0);
  const [stage, setStage] = rS('idle'); // idle → attesting → bsgs → decrypted
  const [scanPhase, setScanPhase] = rS(0); // 0..3 for PCR0/1/2/kms
  const [auditLog, setAuditLog] = rS(null);

  rE(()=>{
    if(stage==='attesting'){
      const steps = [
        [300,  ()=> setScanPhase(1)],
        [700,  ()=> setScanPhase(2)],
        [1100, ()=> setScanPhase(3)],
        [1500, ()=>{ setStage('bsgs'); setScanPhase(4); }],
        [2300, ()=>{ setStage('decrypted'); setAuditLog({id:'AUDIT-72FE…'+Math.random().toString(16).slice(2,4).toUpperCase(), at: Date.now()}); }],
      ];
      const ids = steps.map(([ms,fn])=> setTimeout(fn,ms));
      return ()=> ids.forEach(clearTimeout);
    }
    if(stage==='idle'){ setScanPhase(0); setAuditLog(null); }
  },[stage]);

  rE(()=>{ if(demoTrigger){ setStage('idle'); setTimeout(()=> setStage('attesting'), 300); } },[demoTrigger]);

  const record = REG_RECORDS[sel];

  return (
    <div style={{maxWidth:1400,margin:'0 auto',padding:'20px 32px 32px',position:'relative',zIndex:2}}>
      <RegTopbar t={t}/>

      <div style={{display:'grid',gridTemplateColumns:'340px 1fr 340px',gap:16,marginTop:16}}>
        <RecordsColumn t={t} lang={lang} sel={sel} setSel={(i)=>{ setSel(i); setStage('idle'); }} stage={stage} record={record}/>
        <EnclaveColumn t={t} stage={stage} setStage={setStage} scanPhase={scanPhase}/>
        <ResultColumn t={t} stage={stage} record={record} auditLog={auditLog}/>
      </div>

      <AuditedStream t={t}/>
    </div>
  );
}

function RegTopbar({ t }){
  return (
    <div className="panel" style={{padding:'10px 18px',display:'flex',alignItems:'center',gap:18}}>
      <NexumMark size={24}/>
      <span className="mono" style={{fontSize:11,letterSpacing:'.15em'}}>{t('reg_title').toUpperCase()}</span>
      <div style={{flex:1}}/>
      <SlotCounter t={t}/>
      <span className="tag violet">◉ {t('reg_pcr_ok')}</span>
    </div>
  );
}

// ─── Left column: records list ─────────────────────────────
function RecordsColumn({ t, lang, sel, setSel, stage, record }){
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:12,alignSelf:'start'}}>
      <div className="kicker">{t('reg_step1')}</div>
      <div style={{color:'var(--ink-dim)',fontSize:11}}>{t('reg_records')}</div>

      {REG_RECORDS.map((r,i)=>{
        const active = i===sel;
        return (
          <button key={i} onClick={()=>setSel(i)}
            className="panel-2"
            style={{
              padding:'14px 14px',
              borderColor: active?'var(--violet-line)':'var(--line-2)',
              background: active?'var(--violet-soft)':'var(--panel-2)',
              textAlign:'left',cursor:'pointer',display:'flex',flexDirection:'column',gap:6,transition:'all .2s',
              position:'relative',overflow:'hidden'
            }}>
            {active && <span style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:'var(--violet)'}}/>}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingLeft:active?6:0,transition:'padding .2s'}}>
              <span className="mono" style={{fontSize:11,color:active?'var(--violet)':'#c9cbd6'}}>{r.id}</span>
              {r.filter==='MAS' && <span className="tag violet" style={{fontSize:9}}>{r.filter}</span>}
            </div>
            <div style={{color:'var(--ink-dim)',fontSize:11,paddingLeft:active?6:0,transition:'padding .2s'}}>
              {lang==='zh'?r.age_zh:r.age_en} · {r.pair}
            </div>
            <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',paddingLeft:active?6:0,transition:'padding .2s'}}>
              {r.initiator} ↔ {r.cpty}
            </div>
          </button>
        );
      })}

      <div style={{marginTop:'auto',paddingTop:14,borderTop:'1px solid var(--line)'}}>
        <div className="kicker" style={{marginBottom:8}}>SELECTED RECORD</div>
        <div className="mono" style={{fontSize:11,color:'var(--violet)'}}>{record.id}</div>
        <div style={{color:'var(--ink-dim)',fontSize:11,marginTop:4}}>Audit ciphertexts available</div>
      </div>
    </div>
  );
}

// ─── Middle: enclave ceremony ─────────────────────────────
function EnclaveColumn({ t, stage, setStage, scanPhase }){
  const spinning = stage==='attesting';
  const progress = Math.min(1, scanPhase/4);
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:16,minHeight:560}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="kicker">{t('reg_step2')}</span>
        <span className="tag violet">{stage==='idle'?'STANDBY': stage==='decrypted'?'AUTHORIZED':'ATTESTING'}</span>
      </div>

      {/* PCR Lock Ring */}
      <div style={{position:'relative',height:300,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <svg viewBox="0 0 400 300" style={{width:'100%',maxWidth:400,height:300}}>
          <defs>
            <filter id="glowv" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <g transform="translate(200 150)">
            {/* three concentric rings, each rotates when its PCR matches */}
            {[0,1,2].map(i=>{
              const r = 140 - i*36;
              const lit = scanPhase > i;
              return (
                <g key={i}>
                  <circle r={r} fill="none" stroke="#262836" strokeWidth="1"/>
                  <g style={{animation: lit && spinning ? `spin ${3+i}s linear infinite` : 'none', transformOrigin:'center', transformBox:'fill-box'}}>
                    <path d={`M 0 -${r} A ${r} ${r} 0 0 1 ${r*0.7} -${r*0.7}`}
                      fill="none" stroke={lit?'#a78bfa':'#3a3c48'} strokeWidth="3" strokeLinecap="round"
                      filter={lit?'url(#glowv)':''}
                    />
                    <circle cx="0" cy={-r} r="3" fill={lit?'#a78bfa':'#3a3c48'}/>
                  </g>
                  {/* segment ticks */}
                  {Array.from({length:8}).map((_,k)=>{
                    const ang = k*Math.PI/4;
                    return <line key={k} x1={Math.cos(ang)*(r-4)} y1={Math.sin(ang)*(r-4)} x2={Math.cos(ang)*(r+4)} y2={Math.sin(ang)*(r+4)} stroke={lit?'#a78bfa':'#333545'} strokeWidth="1" opacity={lit?0.6:0.3}/>;
                  })}
                </g>
              );
            })}
            <text y="-4" textAnchor="middle" className="mono" fontSize="11" fill={scanPhase>=3?'#a78bfa':'#5a5d6b'} letterSpacing="2">PCR0/1/2</text>
            <text y="16" textAnchor="middle" className="mono" fontSize="9" fill={stage==='attesting'?'#a78bfa': stage==='decrypted'?'#7cf0b5':'#5a5d6b'} letterSpacing="2">
              {stage==='idle'?'STANDBY': stage==='decrypted'?'✓ UNLOCKED':'ATTESTING…'}
            </text>
          </g>
        </svg>
      </div>

      {/* PCR values */}
      <div style={{display:'flex',flexDirection:'column',gap:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
        {[
          ['PCR0','0x a1b2 c3d4 e5f6', 1],
          ['PCR1','0x 7c0d 99aa 9b41', 2],
          ['PCR2','0x ff22 7133 1030', 3],
        ].map(([k,v,phase])=>{
          const done = scanPhase >= phase;
          return (
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 12px',background:'var(--panel-2)',border:'1px solid var(--line-2)',borderRadius:6}}>
              <span style={{color:'var(--ink-dim)'}}>{k}</span>
              <span style={{color: done?'var(--violet)':'var(--ink-faint)'}}>{v} {done?'✓':'·'}</span>
            </div>
          );
        })}
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:6,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
        <div style={{display:'flex',justifyContent:'space-between',padding:'6px 12px'}}>
          <span style={{color:'var(--ink-dim)'}}>{t('reg_kms_release')}</span>
          <span style={{color: scanPhase>=4?'var(--accent)':'var(--ink-faint)'}}>{scanPhase>=4?'✓ 127 ms':'· —'}</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'6px 12px'}}>
          <span style={{color:'var(--ink-dim)'}}>{t('reg_bsgs')}</span>
          <span style={{color: stage==='decrypted'?'var(--accent)':'var(--ink-faint)'}}>{stage==='decrypted'?'✓ 201 ms':'· —'}</span>
        </div>
      </div>

      <button
        className={"btn "+(stage==='idle'?'violet':'')}
        disabled={stage!=='idle'}
        onClick={()=> setStage('attesting')}
        style={{padding:'12px 14px',justifyContent:'center',fontSize:11}}>
        {stage==='idle'? t('reg_decrypt') : stage==='decrypted'? t('reg_decrypted'):'· '+t('reg_decrypting')}
      </button>
    </div>
  );
}

// ─── Right: result + AuditLog enforcement ──────────────────
function ResultColumn({ t, stage, record, auditLog }){
  const done = stage==='decrypted';
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:14,alignSelf:'start'}}>
      <div className="kicker">{t('reg_step3')}</div>

      <div style={{border:'1px solid '+(done?'var(--violet-line)':'var(--line-2)'),background:done?'var(--violet-soft)':'var(--panel-2)',borderRadius:10,padding:'16px 16px',transition:'all .3s'}}>
        <div className="mono" style={{fontSize:10,color:done?'var(--violet)':'var(--ink-faint)',letterSpacing:'.15em',marginBottom:10}}>
          {done? 'DECRYPTED · '+record.id : '· LOCKED · '+record.id}
        </div>
        <div style={{fontWeight:800,fontSize:32,letterSpacing:'-.02em',color:done?'#fff':'var(--ink-faint)',fontFamily:"Inter, system-ui, sans-serif",minHeight:42}}>
          {done ? <DigitScramble target={record.amount} running={true} duration={1100} decimals={2}/> : '████████.██'}
        </div>
        <div style={{color:'var(--ink-dim)',fontSize:12,marginTop:4}}>USDC · 1 USD peg</div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8,padding:'0 2px'}}>
        <KV label={t('reg_initiator')} value={record.initiator}/>
        <KV label={t('reg_counterparty')} value={record.cpty}/>
        <KV label={t('reg_jurisdiction')} value="MAS · Singapore"/>
        <KV label={t('reg_reason')} value="sha256 · 0x aa12…ee91"/>
      </div>

      <div style={{height:1,background:'var(--line)'}}/>

      {/* AuditLog enforcement block */}
      <div style={{
        border:'1px solid '+(done?'var(--gold-line)':'var(--line-2)'),
        background:done?'var(--gold-soft)':'var(--panel-2)',
        borderRadius:10,padding:'14px 16px',transition:'all .4s',
        position:'relative',overflow:'hidden',
        animation: done?'slideUp .5s ease':'none'
      }}>
        <div className="mono" style={{fontSize:10,color:done?'var(--gold)':'var(--ink-faint)',letterSpacing:'.15em',marginBottom:10,textTransform:'uppercase'}}>
          ⚠ {t('reg_enforce_title')}
        </div>
        <div style={{fontSize:14,fontWeight:700,color:done?'var(--gold)':'var(--ink-faint)',marginBottom:6}}>
          {t('reg_enforce_1')}
        </div>
        <div style={{color:'var(--ink-dim)',fontSize:12,lineHeight:1.55}}>{t('reg_enforce_2')}</div>
        <div style={{color:'var(--ink-dim)',fontSize:12,lineHeight:1.55,marginTop:2}}>{t('reg_enforce_3')}</div>
        {done && auditLog && (
          <div className="mono" style={{fontSize:10,color:'var(--gold)',marginTop:10,letterSpacing:'.08em'}}>
            ↗ audit_log/{auditLog.id.slice(6)}
          </div>
        )}
      </div>

      <button className="btn" style={{padding:'10px 14px',justifyContent:'center',fontSize:10.5}} disabled={!done}>
        ↗ {t('reg_export')}
      </button>
    </div>
  );
}

function KV({ label, value }){
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.12em',textTransform:'uppercase'}}>{label}</span>
      <span className="mono" style={{fontSize:11,color:'#c9cbd6'}}>{value}</span>
    </div>
  );
}

// ─── Audited log stream ───────────────────────────────────
function AuditedStream({ t }){
  return (
    <div className="panel" style={{padding:22,marginTop:16}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <span className="kicker">{t('reg_audited')} · PERMANENT · IMMUTABLE</span>
        <span className="tag violet">{AUDITED_LIST.length} RECORDS</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:12}}>
        {AUDITED_LIST.map((a,i)=>(
          <div key={i} className="panel-2" style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span className="mono" style={{fontSize:11,color:'var(--violet)'}}>{a.id}</span>
              <span className="tag green" style={{fontSize:9}}>✓ decrypted</span>
            </div>
            <div className="mono" style={{fontSize:10.5,color:'#c9cbd6'}}>{a.ref}</div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--ink-faint)',fontFamily:"'JetBrains Mono',monospace"}}>
              <span>{a.region}</span><span>{a.t}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { RegulatorTerminal });
