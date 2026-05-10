// Version-Slot Pipeline — serial vs parallel side-by-side
const { useState: pS, useEffect: pE, useMemo: pM } = React;

function VersionSlots({ lang }){
  const [t1, setT1] = pS(0);
  const [running, setRunning] = pS(false);
  const t = (zh,en)=> lang==='zh'?zh:en;
  const N = 5;
  const SERIAL_TOTAL = N*(4+0.5); // 22.5s
  const PARALLEL_TOTAL = 4 + N*0.5; // 6.5s

  pE(()=>{
    if(!running) return;
    const start=performance.now();
    let raf;
    const tick=(now)=>{
      const e=(now-start)/1000;
      setT1(e);
      if(e<SERIAL_TOTAL+1) raf=requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf=requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(raf);
  },[running]);

  const reset = ()=>{ setT1(0); setRunning(false); };
  const play = ()=>{ setT1(0); setRunning(true); };

  return (
    <section style={{padding:'80px 48px',background:'var(--bg)',borderTop:'1px solid var(--ink)'}}>
      <div style={{maxWidth:1500,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:48,marginBottom:32,paddingBottom:18,borderBottom:'1px solid var(--ink)'}}>
          <div>
            <div className="mono" style={{fontSize:10.5,letterSpacing:'.28em',color:'var(--ink-3)'}}>FIG. 03 — VERSION SLOTS</div>
            <h2 className="serif" style={{margin:'10px 0 0',fontSize:54,fontWeight:300,letterSpacing:'-.025em',lineHeight:1}}>
              {t('做市商，并发引擎。','Market makers, in parallel.')}
            </h2>
          </div>
          <div style={{paddingTop:8,display:'flex',flexDirection:'column',gap:14}}>
            <div className="serif italic" style={{fontStyle:'italic',fontSize:18,color:'var(--ink-2)',lineHeight:1.55,maxWidth:680}}>
              {t('ZK 证明依赖账本版本号，让多笔结算天然串行。版本槽预分配把这个串行死锁拆成流水线——5 笔证明同时计算，按序上链。','ZK proofs depend on the ledger version number, forcing serial execution. Pre-reserving version slots breaks the deadlock — 5 proofs computed in parallel, submitted in order.')}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn solid" onClick={running?reset:play}>
                {running? t('■ 停止','■ STOP') : t('▶ 对比演示','▶ COMPARE')}
              </button>
              <span className="mono" style={{fontSize:10,letterSpacing:'.18em',color:'var(--ink-3)',alignSelf:'center'}}>RESERVE_VERSION_SLOTS(5)</span>
            </div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
          <PipelineColumn label={t('串行 / SERIAL','SERIAL')} mode="serial" t1={t1} N={N} totalSec={SERIAL_TOTAL} t={t}/>
          <PipelineColumn label={t('并行 / PARALLEL','PARALLEL')} mode="parallel" t1={t1} N={N} totalSec={PARALLEL_TOTAL} t={t} accent/>
        </div>

        {/* the kicker stat */}
        <div style={{marginTop:32,padding:'24px 32px',border:'1px solid var(--ink)',background:'var(--bg-2)',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:32}}>
          <div>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--ink-3)'}}>SERIAL</div>
            <div className="serif" style={{fontSize:42,fontWeight:300,letterSpacing:'-.02em',color:'var(--ink-2)',marginTop:4}}>22.5<span style={{fontSize:18,color:'var(--ink-3)'}}>s</span></div>
          </div>
          <div>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)'}}>PARALLEL</div>
            <div className="serif" style={{fontSize:42,fontWeight:300,letterSpacing:'-.02em',color:'var(--accent)',marginTop:4}}>6.5<span style={{fontSize:18,color:'var(--ink-3)'}}>s</span></div>
          </div>
          <div style={{textAlign:'right'}}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--ink-3)'}}>SPEEDUP</div>
            <div className="serif italic" style={{fontStyle:'italic',fontSize:42,fontWeight:300,letterSpacing:'-.02em',color:'var(--ink)',marginTop:4}}>3.5×</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PipelineColumn({label, mode, t1, N, totalSec, t, accent}){
  const lanes = Array.from({length:N});
  return (
    <div style={{padding:'22px 26px',border:`1px solid ${accent?'var(--accent)':'var(--ink)'}`,background:accent?'var(--accent-soft)':'transparent'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:18}}>
        <span className="grot" style={{fontSize:22,letterSpacing:'-.01em',color:accent?'var(--accent)':'var(--ink)'}}>{label}</span>
        <span className="mono" style={{fontSize:10,letterSpacing:'.18em',color:'var(--ink-3)'}}>EST. {totalSec.toFixed(1)}s</span>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {lanes.map((_,i)=>{
          const proveStart = mode==='serial' ? i*4.5 : 0;
          const proveEnd = proveStart + 4;
          const submitStart = mode==='serial' ? proveEnd : 4 + i*0.5;
          const submitEnd = submitStart + 0.5;
          const proveProgress = Math.max(0, Math.min(1, (t1-proveStart)/4));
          const submitProgress = Math.max(0, Math.min(1, (t1-submitStart)/0.5));
          const done = t1 >= submitEnd;
          return (
            <div key={i} style={{display:'grid',gridTemplateColumns:'70px 1fr 70px',alignItems:'center',gap:12,height:24}}>
              <span className="mono" style={{fontSize:10,letterSpacing:'.12em',color:'var(--ink-3)'}}>SLOT {i+1}</span>
              <div style={{position:'relative',height:14,background:'var(--bg-2)',border:'1px solid var(--line)'}}>
                {/* total bar background as time scale */}
                {/* prove segment */}
                <div style={{position:'absolute',left:`${(proveStart/totalSec)*100}%`,top:0,bottom:0,width:`${(4/totalSec)*100*proveProgress}%`,background: accent?'var(--accent)':'var(--ink-3)',transition:'width .05s linear'}}/>
                {/* submit segment */}
                <div style={{position:'absolute',left:`${(submitStart/totalSec)*100}%`,top:0,bottom:0,width:`${(0.5/totalSec)*100*submitProgress}%`,background:'var(--green)',transition:'width .05s linear'}}/>
              </div>
              <span className="mono" style={{fontSize:10,letterSpacing:'.12em',color:done?'var(--green)':'var(--ink-faint)',textAlign:'right'}}>{done?'✓ V'+(i+1):''}</span>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between'}}>
        <span className="mono" style={{fontSize:9,letterSpacing:'.12em',color:'var(--ink-3)'}}>▮ PROVE &nbsp; ▮ SUBMIT</span>
        <span className="mono" style={{fontSize:10,color:'var(--ink-2)',letterSpacing:'.1em'}}>t = {t1.toFixed(1)}s</span>
      </div>
    </div>
  );
}

window.VersionSlots = VersionSlots;
