// Three-Act stage: Initiate → Accept → Execute
// The signature centerpiece of v3. Each act has its own choreography.
const { useState: tS, useEffect: tE, useRef: tR, useMemo: tM } = React;

// Acts: 0 idle, 1 initiate, 2 waiting, 3 accept(symmetric lock), 4 prove, 5 execute, 6 done
function ThreeActStage({ lang, autoplay=false, demoTrigger }){
  const [act, setAct] = tS(0);
  const [progress, setProgress] = tS(0); // act-internal 0..1
  const t = (zh,en)=> lang==='zh'?zh:en;

  // auto-advance via internal timer when running
  tE(()=>{
    if(act===0) return;
    const durations = [0, 2200, 4500, 1800, 3000, 1600, 2400];
    const dur = durations[act];
    const start = performance.now();
    let raf;
    const tick=(now)=>{
      const p = Math.min(1,(now-start)/dur);
      setProgress(p);
      if(p<1) raf=requestAnimationFrame(tick);
      else if(act<6) setAct(a=>a+1);
    };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[act]);

  tE(()=>{ if(demoTrigger){ setAct(0); setProgress(0); setTimeout(()=>setAct(1),200); } },[demoTrigger]);

  const start = ()=>{ setAct(0); setProgress(0); setTimeout(()=>setAct(1),100); };
  const reset = ()=>{ setAct(0); setProgress(0); };

  return (
    <section className="dark" style={{padding:'80px 48px',marginTop:64}}>
      <div style={{maxWidth:1500,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:36,paddingBottom:18,borderBottom:'1px solid var(--d-line-2)'}}>
          <div>
            <div className="mono" style={{fontSize:10.5,letterSpacing:'.28em',color:'#9a9aa3'}}>FIG. 02 — THREE-ACT SETTLEMENT</div>
            <h2 className="serif" style={{margin:'10px 0 0',fontSize:54,fontWeight:300,letterSpacing:'-.025em',lineHeight:1,color:'#f4f1ea'}}>
              {t('三幕，原子，对称。','Three acts. Atomic. Symmetric.')}
            </h2>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn" onClick={act===0?start:reset} style={{borderColor:'#f4f1ea',color:'#f4f1ea'}}>
              {act===0? t('▶ 开始演示','▶ PLAY') : t('■ 重置','■ RESET')}
            </button>
          </div>
        </div>

        {/* Act tabs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:0,border:'1px solid var(--d-line-2)',marginBottom:32}}>
          <ActTab num="I" label={t('承诺','COMMIT')} sub="initiate_commit" active={act>=1 && act<=2} done={act>2} accent="var(--accent)"/>
          <ActTab num="II" label={t('对称双锁','SYMMETRIC LOCK')} sub="accept_commit" active={act===3} done={act>3} accent="var(--gold)"/>
          <ActTab num="III" label={t('双证执行','DUAL PROOF EXEC')} sub="execute_settle" active={act>=4 && act<=5} done={act>=6} accent="var(--green)"/>
        </div>

        {/* Stage area */}
        <div style={{position:'relative',minHeight:480,background:'var(--d-bg-2)',border:'1px solid var(--d-line-2)',padding:'32px 40px',overflow:'hidden'}}>
          {/* Two-party tracks always visible */}
          <PartyTracks act={act} progress={progress} t={t}/>

          {/* Act-specific overlays */}
          {act>=1 && act<=2 && <Act1Initiate progress={act===1?progress:1} t={t}/>}
          {act===3 && <Act2Accept progress={progress} t={t}/>}
          {act>=4 && <Act3Execute act={act} progress={progress} t={t}/>}

          {act===0 && (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
              <div style={{textAlign:'center'}}>
                <div className="serif" style={{fontStyle:'italic',fontSize:40,color:'#5a5a63',letterSpacing:'-.02em'}}>
                  {t('点击 ▶ 播放，见证一次结算的三幕剧','Press ▶ to witness the three acts')}
                </div>
                <div className="mono" style={{fontSize:11,letterSpacing:'.2em',color:'#3a3a48',marginTop:14}}>I · COMMIT &nbsp; → &nbsp; II · LOCK &nbsp; → &nbsp; III · EXECUTE</div>
              </div>
            </div>
          )}
        </div>

        {/* Narration strip */}
        <NarrationStrip act={act} t={t}/>
      </div>
    </section>
  );
}

function ActTab({num,label,sub,active,done,accent}){
  return (
    <div style={{padding:'18px 22px',borderRight:'1px solid var(--d-line-2)',background:active?'var(--d-bg-2)':'transparent',position:'relative',overflow:'hidden'}}>
      {active && <span style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:accent,animation:'ink-pulse 1.4s infinite'}}/>}
      <div style={{display:'flex',alignItems:'baseline',gap:14}}>
        <span className="serif" style={{fontStyle:'italic',fontSize:32,fontWeight:300,color:active?accent:done?'#f4f1ea':'#3a3a48',transition:'color .3s'}}>{num}</span>
        <div>
          <div className="grot" style={{fontSize:18,color:active||done?'#f4f1ea':'#5a5a63',letterSpacing:'-.01em'}}>{label}</div>
          <div className="mono" style={{fontSize:10,letterSpacing:'.18em',color:active?accent:'#5a5a63',marginTop:3}}>{done?'✓ ':' '}{sub}</div>
        </div>
      </div>
    </div>
  );
}

function PartyTracks({act, progress, t}){
  // shows the two parties' status visualised as horizontal bars
  const aStatus = act===0?'Active': act===1?'Pending Initiator': act===2?'Pending Initiator': act===3?'Both Pending': act>=4&&act<=5?'Both Pending': 'Active ✓';
  const bStatus = act===0?'Active': act<3?'Active': act===3?'Pending Counterparty': act>=4&&act<=5?'Pending Counterparty': 'Active ✓';
  const aLocked = act>=1 && act<6;
  const bLocked = act>=3 && act<6;
  return (
    <div style={{position:'absolute',top:32,left:40,right:40,display:'flex',flexDirection:'column',gap:10,zIndex:1}}>
      <PartyRail label="A · INITIATOR" addr="7xKp…mNqR" status={aStatus} locked={aLocked} done={act>=6}/>
      <PartyRail label="B · COUNTERPARTY" addr="2vBa…zL9o" status={bStatus} locked={bLocked} done={act>=6}/>
    </div>
  );
}

function PartyRail({label,addr,status,locked,done}){
  const c = done?'var(--green)': locked?'var(--accent)':'#5a5a63';
  return (
    <div style={{display:'grid',gridTemplateColumns:'180px 140px 1fr 200px',gap:14,alignItems:'center',padding:'10px 14px',border:`1px solid ${locked?c:'var(--d-line-2)'}`,background: locked?'rgba(226,80,43,.05)':'transparent',transition:'all .4s'}}>
      <span className="mono" style={{fontSize:10.5,letterSpacing:'.18em',color:c}}>● {label}</span>
      <span className="mono" style={{fontSize:11,color:'#9a9aa3'}}>{addr}</span>
      <div style={{height:4,background:'#1f1f28',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:`repeating-linear-gradient(45deg, ${c} 0 6px, transparent 6px 12px)`,opacity:locked?.6:0,transition:'opacity .4s'}}/>
      </div>
      <span className="mono" style={{fontSize:10,color:c,letterSpacing:'.12em',textAlign:'right'}}>{status.toUpperCase()}</span>
    </div>
  );
}

// ── ACT I — Initiate: a "stamp" comes down and seals a 32-byte hash ──
function Act1Initiate({progress, t}){
  const hashBytes = tM(()=>{
    const c='0123456789abcdef'; let s=''; for(let i=0;i<64;i++) s+=c[Math.floor(Math.random()*16)]; return s;
  },[]);
  const visible = Math.floor(progress*64);
  const stampDown = progress>0.4;
  return (
    <div style={{position:'absolute',top:160,left:40,right:40,bottom:24,display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,alignItems:'center'}}>
      <div style={{position:'relative'}}>
        <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)',marginBottom:14}}>STEP I.1 · OFF-CHAIN COMPUTE</div>
        <div style={{padding:'18px 20px',border:'1px solid var(--d-line-2)',background:'var(--d-bg-3)'}}>
          <div className="mono" style={{fontSize:10,color:'#5a5a63',letterSpacing:'.15em',marginBottom:10}}>SHA256(120 BYTES)</div>
          <div className="mono" style={{fontSize:11.5,color:'#f4f1ea',lineHeight:1.7}}>
            <div>nonce <span style={{color:'#5a5a63'}}>·</span> <span style={{color:'#9a9aa3'}}>0x 4f 7a 02 e9 11 00 c3 d2</span></div>
            <div>amount_lo/hi <span style={{color:'var(--accent)'}}>· 500,000.00 USDC</span></div>
            <div>asset_a <span style={{color:'#5a5a63'}}>·</span> <span style={{color:'#9a9aa3'}}>USDC</span></div>
            <div>asset_b <span style={{color:'#5a5a63'}}>·</span> <span style={{color:'#9a9aa3'}}>SOL</span></div>
            <div>counterparty <span style={{color:'#5a5a63'}}>·</span> <span style={{color:'#9a9aa3'}}>2vBa…zL9o</span></div>
            <div>expiry <span style={{color:'#5a5a63'}}>·</span> <span style={{color:'var(--gold)'}}>now + 60s</span></div>
          </div>
        </div>
        <div style={{textAlign:'center',padding:'14px 0',color:'#5a5a63'}} className="serif italic">↓</div>
        <div className="mono" style={{fontSize:11,color:'var(--accent)',padding:'12px 16px',background:'var(--d-bg-3)',border:`1px solid var(--accent)`,wordBreak:'break-all',lineHeight:1.6}}>
          0x{hashBytes.slice(0,visible)}<span style={{color:'#5a5a63'}}>{hashBytes.slice(visible)}</span>
          {visible<64 && <span className="cursor"/>}
        </div>
      </div>

      <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)',marginBottom:18,alignSelf:'flex-start'}}>STEP I.2 · ON-CHAIN ANCHOR</div>
        <div style={{position:'relative',width:300,height:240,display:'flex',alignItems:'center',justifyContent:'center'}}>
          {/* the parchment — CommitSlot 204 bytes */}
          <div style={{width:240,height:160,background:'#f4f1ea',color:'#0a0a0c',padding:20,position:'relative',boxShadow:stampDown?'0 8px 24px rgba(0,0,0,.4)':'none',transition:'box-shadow .3s'}}>
            <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--ink-3)'}}>COMMIT_SLOT · 204B</div>
            <div className="serif" style={{fontStyle:'italic',fontSize:13,color:'var(--ink-2)',marginTop:8}}>only the hash, expiry, parties.</div>
            <div className="mono" style={{fontSize:9,marginTop:14,color:'var(--ink-3)'}}>commitment_hash · 32B<br/>expiry_init · 8B<br/>nonce · 8B<br/>parties · 64B</div>

            {/* The descending stamp */}
            {stampDown && (
              <div style={{position:'absolute',right:-18,bottom:-18,width:90,height:90,border:'2px solid var(--accent)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(244,241,234,.95)',transform:'rotate(-12deg)',animation:'seal-down .55s cubic-bezier(.5,1.5,.5,1)'}}>
                <div style={{textAlign:'center'}}>
                  <div className="serif" style={{fontStyle:'italic',fontSize:16,color:'var(--accent)',lineHeight:1}}>commit</div>
                  <div className="mono" style={{fontSize:8,letterSpacing:'.18em',color:'var(--accent)',marginTop:2}}>SEALED</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="mono" style={{fontSize:10,color:'#5a5a63',letterSpacing:'.15em',marginTop:12}}>50K CU · NO ZK · IRREVOCABLE WITHIN 60s</div>
      </div>
    </div>
  );
}

// ── ACT II — Accept: a ring closes, both rails get hatched ──
function Act2Accept({progress, t}){
  const r=68, c=2*Math.PI*r, off=c*(1-progress);
  return (
    <div style={{position:'absolute',top:160,left:40,right:40,bottom:24,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:24}}>
      <div style={{display:'flex',alignItems:'center',gap:48}}>
        <div style={{textAlign:'right'}}>
          <div className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--accent)'}}>● A · LOCKED</div>
          <div className="serif" style={{fontStyle:'italic',fontSize:36,color:'#f4f1ea',lineHeight:1.1,marginTop:4}}>500,000<br/>USDC</div>
        </div>

        <div style={{position:'relative',width:180,height:180}}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            {/* outer ring */}
            <circle cx="90" cy="90" r={r} stroke="var(--d-line-2)" strokeWidth="1" fill="none"/>
            {/* the closing ring */}
            <circle cx="90" cy="90" r={r} stroke="var(--accent)" strokeWidth="3" fill="none"
              strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 90 90)"/>
            {/* ticks */}
            {Array.from({length:24}).map((_,i)=>{
              const a=i*Math.PI/12, x1=90+Math.cos(a)*(r-10), y1=90+Math.sin(a)*(r-10), x2=90+Math.cos(a)*(r-4), y2=90+Math.sin(a)*(r-4);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--d-line-2)" strokeWidth=".8"/>;
            })}
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <div className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'var(--accent)'}}>BOTH PENDING</div>
            <div className="serif" style={{fontStyle:'italic',fontSize:36,fontWeight:300,color:'#f4f1ea',lineHeight:1,marginTop:4}}>{Math.ceil(30*(1-progress))}<span style={{fontSize:14,color:'#5a5a63',marginLeft:2}}>s</span></div>
            <div className="mono" style={{fontSize:8,letterSpacing:'.2em',color:'#5a5a63',marginTop:4}}>EXEC WINDOW</div>
          </div>
        </div>

        <div>
          <div className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--accent)'}}>● B · LOCKED</div>
          <div className="serif" style={{fontStyle:'italic',fontSize:36,color:'#f4f1ea',lineHeight:1.1,marginTop:4}}>2,381.4<br/>SOL</div>
        </div>
      </div>

      <div className="serif italic" style={{fontSize:18,color:'#9a9aa3',textAlign:'center',maxWidth:600,fontStyle:'italic'}}>
        {t('一旦 B 接受，双方的余额在同一刻被对称冻结。期权窗口归零。','The instant B accepts, both balances freeze in the same heartbeat. The option window collapses to zero.')}
      </div>
    </div>
  );
}

// ── ACT III — Execute: two ZK proofs fire simultaneously ──
function Act3Execute({act, progress, t}){
  const proving = act===4;
  const settled = act>=6;
  const p = proving? progress : (act>4?1:0);
  return (
    <div style={{position:'absolute',top:160,left:40,right:40,bottom:24,display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,alignItems:'center'}}>
      <ProverBlock party="A" label="proof_a · 12,778 cnstr" progress={p} settled={settled}/>
      <ProverBlock party="B" label="proof_b · 12,778 cnstr" progress={p} settled={settled}/>

      {settled && (
        <div style={{gridColumn:'1 / -1',marginTop:12,padding:'14px 20px',border:'1px solid var(--green)',background:'rgba(31,111,62,.1)',display:'flex',alignItems:'center',justifyContent:'space-between',animation:'shrink-in .4s ease'}}>
          <div className="mono" style={{fontSize:11,letterSpacing:'.18em',color:'var(--green)'}}>✓ SETTLEMENT_RECORD WRITTEN · COMMIT_SLOT CLOSED · RENT REFUNDED</div>
          <div className="mono" style={{fontSize:11,color:'#9a9aa3'}}>SETL-1E77…B502 · BLOCK 312,847,291</div>
        </div>
      )}
    </div>
  );
}

function ProverBlock({party, label, progress, settled}){
  const ROWS=10, COLS=42, TOT=ROWS*COLS;
  const lit = Math.floor(TOT*progress);
  return (
    <div style={{padding:'16px 20px',border:`1px solid ${settled?'var(--green)':'var(--accent)'}`,background:'var(--d-bg-3)'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:settled?'var(--green)':'var(--accent)'}}>● PARTY {party}</span>
        <span className="mono" style={{fontSize:10,color:'#5a5a63'}}>{label}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${COLS}, 1fr)`,gap:3}}>
        {Array.from({length:TOT}).map((_,i)=>(
          <span key={i} style={{width:3,height:3,borderRadius:'50%',background: i<lit?(settled?'var(--green)':'var(--accent)'):'#2a2a35',justifySelf:'center',transition:'background .1s'}}/>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:10}}>
        <span className="mono" style={{fontSize:9,letterSpacing:'.15em',color:'#5a5a63'}}>{Math.floor(12778*progress).toLocaleString()} / 12,778 LIT</span>
        <span className="mono" style={{fontSize:9,letterSpacing:'.15em',color: settled?'var(--green)':'var(--accent)'}}>{settled?'✓ VERIFIED':proving(progress)}</span>
      </div>
    </div>
  );
}
function proving(p){ return p>=1?'✓ READY':`PROVING · ${(p*3).toFixed(1)}s`; }

function NarrationStrip({act,t}){
  const lines = [
    null,
    [t('I · 承诺 / Commit','I · Commit'), t('A 在链下计算 SHA-256(120B)，把唯一的 32 字节哈希压上链。无密文，无 ZK，仅有时间戳和不可篡改的法律锚点。','A computes SHA-256(120B) off-chain and stamps the resulting 32-byte hash on-chain. No ciphertext, no ZK — just an immutable legal anchor in time.')],
    [t('I · 等待 / Waiting','I · Waiting'), t('60 秒倒计时启动。B 通过链下信道得知明文金额，本地重算哈希并验证一致——这是协议外的"信任面谈"。','A 60-second countdown begins. B learns the plaintext amount through an off-chain channel, recomputes and verifies the hash — the protocol\'s "trust interview".')],
    [t('II · 对称双锁 / Symmetric Lock','II · Symmetric Lock'), t('B 提交 accept_commit 的瞬间，B 的余额也被冻结。期权窗口在同一帧归零——这是 v3.0 最锋利的博弈一刀。','The instant B submits accept_commit, B\'s balance also freezes. The option window collapses to zero in the same frame — v3.0\'s sharpest game-theoretic edge.')],
    [t('III · 双证执行 / Dual-Proof Execute','III · Dual-Proof Execute'), t('双方并行生成 Groth16 证明（约 4 秒）。承诺哈希在合约里被重算并校验：execute 时的金额必须与 initiate 时承诺的完全一致。','Both parties generate Groth16 proofs in parallel (~4s). The commitment hash is recomputed on-chain: the executing amount must match what was committed.')],
    [t('III · 写入','III · Write'), t('约 220K CU 的单笔交易完成原子结算。CommitSlot 关闭，租金返还，Settlement Record 永久存档。','A single ~220K CU transaction performs the atomic settlement. CommitSlot closes, rent is refunded, the Settlement Record is archived forever.')],
    [t('III · 完成','III · Done'), t('双方均回到 Active 状态。链上留下不可抵赖的承诺、对称锁定、双方证明、最终结算——完整的法律证据链。','Both parties return to Active. The chain retains an irrefutable record: commitment, symmetric lock, both proofs, final settlement — a complete legal evidence chain.')],
  ];
  const line = lines[act];
  return (
    <div style={{marginTop:24,padding:'18px 24px',border:'1px solid var(--d-line-2)',background:'var(--d-bg-2)',minHeight:96,display:'flex',alignItems:'center',gap:24}}>
      {line ? <>
        <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--accent)',whiteSpace:'nowrap'}}>{line[0]}</span>
        <span style={{width:1,height:30,background:'var(--d-line-2)'}}/>
        <span className="serif italic" style={{fontStyle:'italic',fontSize:17,color:'#f4f1ea',lineHeight:1.5,textWrap:'pretty'}}>{line[1]}</span>
      </> : <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'#5a5a63'}}>· STANDBY · PRESS PLAY ·</span>}
    </div>
  );
}

window.ThreeActStage = ThreeActStage;
