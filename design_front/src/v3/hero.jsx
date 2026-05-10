// v3 Hero — bone paper, oversized serif/grotesk mix, three-act prologue
const { useState: hS, useEffect: hE, useRef: hR, useMemo: hM } = React;

function HeroV3({ onLaunch, onPlay, lang, setLang }){
  return (
    <section style={{position:'relative',padding:'24px 48px 0',maxWidth:1500,margin:'0 auto'}}>
      {/* Top rail */}
      <div style={{display:'flex',alignItems:'center',gap:24,paddingBottom:18,borderBottom:'1px solid var(--ink)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <NexumSeal size={36}/>
          <Wordmark/>
        </div>
        <div style={{flex:1}}/>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--ink-3)'}}>SCHEME B · v3.0</span>
        <span style={{width:1,height:14,background:'var(--line-2)'}}/>
        <Slot/>
        <span style={{width:1,height:14,background:'var(--line-2)'}}/>
        <button onClick={()=>setLang(lang==='zh'?'en':'zh')} className="mono" style={{fontSize:11,letterSpacing:'.15em',color:'var(--ink)'}}>{lang==='zh'?'EN':'中'}</button>
      </div>

      {/* Folio number + meta — like a magazine cover */}
      <div style={{display:'grid',gridTemplateColumns:'120px 1fr 200px',gap:24,paddingTop:24,alignItems:'start'}}>
        <div>
          <div className="serif" style={{fontSize:96,lineHeight:.85,letterSpacing:'-.04em',color:'var(--ink)'}}>03</div>
          <div className="mono" style={{fontSize:9,letterSpacing:'.25em',color:'var(--ink-3)',marginTop:6}}>SCHEMES / B</div>
        </div>

        <div>
          <div className="eyebrow" style={{marginBottom:12}}>PRODUCTION FINAL · 2026</div>
          <h1 style={{margin:0,fontFamily:'Fraunces, serif',fontWeight:300,fontSize:'clamp(56px, 7vw, 110px)',lineHeight:.92,letterSpacing:'-.035em',textWrap:'balance'}}>
            <span>{lang==='zh'? '锁定，是双方的': 'Lock-in,'}</span><br/>
            <span style={{fontStyle:'italic'}}>{lang==='zh'? '同时': 'symmetric.'}</span>
          </h1>
          <h2 className="grot" style={{margin:'18px 0 0',fontSize:'clamp(28px, 3.2vw, 48px)',lineHeight:1,letterSpacing:'-.025em',color:'var(--ink-2)',fontStretch:'75%',fontWeight:600}}>
            {lang==='zh'?
              <>承诺 <span style={{color:'var(--accent)',fontStyle:'italic',fontFamily:'Fraunces, serif',fontWeight:300}}>·</span> 接受 <span style={{color:'var(--accent)',fontStyle:'italic',fontFamily:'Fraunces, serif',fontWeight:300}}>·</span> 双证执行</>
              :
              <>COMMIT <span style={{color:'var(--accent)'}}>·</span> ACCEPT <span style={{color:'var(--accent)'}}>·</span> EXECUTE</>
            }
          </h2>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:8,paddingTop:18,borderTop:'1px solid var(--ink)'}}>
          <div className="mono" style={{fontSize:9.5,letterSpacing:'.2em',color:'var(--ink-3)'}}>EDITORIAL · NEXUM PROTOCOL</div>
          <div className="serif" style={{fontStyle:'italic',fontSize:14,color:'var(--ink-2)',lineHeight:1.5}}>
            {lang==='zh'?'在不完全信任的机构间，构建一个对称、原子、可审计的暗池结算协议。':'A symmetric, atomic, auditable dark-pool settlement protocol — for institutions that do not yet trust one another.'}
          </div>
        </div>
      </div>

      {/* Lede */}
      <div style={{marginTop:48,display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:64,alignItems:'end'}}>
        <div>
          <div className="serif" style={{fontStyle:'italic',fontSize:18,lineHeight:1.55,color:'var(--ink-2)',maxWidth:480,textWrap:'pretty'}}>
            {lang==='zh'
              ? <>方案 A 在双方都诚实时是完美的。<br/>方案 B v3.0 解决了一个更难的问题——<br/><span style={{color:'var(--accent)',fontWeight:500,fontStyle:'normal'}}>当对手方可能反悔时，要如何用密码学和博弈论让他付出代价。</span></>
              : <>Scheme A is perfect when both parties stay honest.<br/>Scheme B v3.0 answers a harder question:<br/><span style={{color:'var(--accent)',fontWeight:500,fontStyle:'normal'}}>how do you make a counterparty pay — cryptographically and game-theoretically — for walking away.</span></>
            }
          </div>
          <div style={{display:'flex',gap:10,marginTop:32}}>
            <button className="btn solid lg" onClick={onLaunch}>
              {lang==='zh'?'进入终端':'ENTER TERMINAL'}
              <span style={{fontSize:13}}>↗</span>
            </button>
            <button className="btn lg" onClick={onPlay}>
              {lang==='zh'?'▶ 播放三幕':'▶ PLAY 3-ACT'}
            </button>
          </div>
        </div>

        <ProtocolDiagram lang={lang}/>
      </div>

      {/* Stat strip */}
      <div style={{marginTop:56,padding:'20px 0',borderTop:'2px solid var(--ink)',borderBottom:'1px solid var(--ink)',display:'grid',gridTemplateColumns:'repeat(5, 1fr)',gap:1,background:'var(--ink)'}}>
        {[
          [lang==='zh'?'链上交易':'on-chain tx','3', lang==='zh'?'承诺 / 接受 / 执行':'commit / accept / execute'],
          [lang==='zh'?'CommitSlot 大小':'commit slot size','204',  'BYTES · −84% v1.0'],
          [lang==='zh'?'对称锁定窗口':'symmetric lock','60→30','sec init→exec'],
          [lang==='zh'?'版本槽并发':'version slots','×20', lang==='zh'?'流水线 3.5 倍':'pipeline 3.5×'],
          [lang==='zh'?'残余期权':'residual option','6k','USDC / 10M trade'],
        ].map(([k,n,sub],i)=>(
          <div key={i} style={{background:'var(--bg)',padding:'18px 20px',display:'flex',flexDirection:'column',gap:6}}>
            <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--ink-3)'}}>{k.toUpperCase()}</div>
            <div className="serif" style={{fontSize:36,fontWeight:300,lineHeight:1,letterSpacing:'-.02em',color:i===3?'var(--accent)':'var(--ink)',fontVariantNumeric:'tabular-nums'}}>{n}</div>
            <div className="mono" style={{fontSize:9.5,color:'var(--ink-faint)',letterSpacing:'.08em'}}>{sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Protocol diagram: a small 3-act flow drawing
function ProtocolDiagram({ lang }){
  return (
    <div style={{position:'relative',padding:'28px 32px',border:'1px solid var(--ink)',background:'var(--bg-2)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <span className="label-ink">FIG. 01 — PROTOCOL SEQUENCE</span>
        <span className="mono" style={{fontSize:9.5,color:'var(--ink-3)',letterSpacing:'.15em'}}>SCALE 1:1</span>
      </div>

      <svg viewBox="0 0 600 220" style={{width:'100%',height:220}}>
        {/* timeline */}
        <line x1="40" y1="170" x2="560" y2="170" stroke="var(--ink)" strokeWidth="1"/>
        {[40, 200, 360, 520].map((x,i)=>(
          <g key={i}>
            <line x1={x} y1="165" x2={x} y2="175" stroke="var(--ink)" strokeWidth="1"/>
            <text x={x} y="195" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="1.5" fill="var(--ink-3)">T+{i*30}s</text>
          </g>
        ))}

        {/* party A track */}
        <text x="40" y="40" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2" fill="var(--ink-3)">PARTY · A</text>
        <line x1="40" y1="60" x2="560" y2="60" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 3"/>
        {/* party B track */}
        <text x="40" y="105" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="2" fill="var(--ink-3)">PARTY · B</text>
        <line x1="40" y1="125" x2="560" y2="125" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 3"/>

        {/* event marks */}
        {/* T0: A initiate */}
        <circle cx="80" cy="60" r="7" fill="var(--accent)"/>
        <text x="80" y="50" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--accent)" letterSpacing="1">INITIATE</text>
        {/* T+25: B accept */}
        <circle cx="280" cy="125" r="7" fill="var(--accent)"/>
        <text x="280" y="148" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--accent)" letterSpacing="1">ACCEPT</text>
        {/* both pending bracket between A track and B track from T+25 to T+50 */}
        <rect x="280" y="60" width="160" height="65" fill="var(--accent)" opacity="0.08"/>
        <text x="360" y="92" textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="14" fill="var(--ink-2)">both_pending — 30s</text>
        {/* T+50: execute (both submit) */}
        <circle cx="440" cy="60" r="6" fill="var(--green)"/>
        <circle cx="440" cy="125" r="6" fill="var(--green)"/>
        <line x1="440" y1="60" x2="440" y2="125" stroke="var(--green)" strokeWidth="1.5"/>
        <text x="440" y="50" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--green)" letterSpacing="1">EXECUTE_SETTLE</text>

        {/* commitment hash arrow A→B (off-chain) */}
        <path d="M 90 60 C 130 30, 230 30, 270 125" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 3" fill="none"/>
        <text x="180" y="22" textAnchor="middle" fontFamily="Fraunces" fontStyle="italic" fontSize="11" fill="var(--ink-3)">off-chain · plaintext + hash</text>

        {/* connector: settlement */}
        <text x="500" y="92" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="var(--green)" letterSpacing="1">2× zk</text>
      </svg>
    </div>
  );
}

window.HeroV3 = HeroV3;
