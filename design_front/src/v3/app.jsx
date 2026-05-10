// App shell — composes routes: home (cover) | login | trader | regulator
const { useState: aS, useEffect: aE, useRef: aR } = React;

function FooterColophon({ lang }){
  const t=(zh,en)=>lang==='zh'?zh:en;
  return (
    <footer style={{padding:'56px 48px 36px',background:'var(--bg)',borderTop:'2px solid var(--ink)'}}>
      <div style={{maxWidth:1500,margin:'0 auto',display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:32}}>
        <div>
          <NexumSeal size={48}/>
          <div className="serif italic" style={{fontStyle:'italic',fontSize:22,color:'var(--ink)',marginTop:18,letterSpacing:'-.01em',maxWidth:380,lineHeight:1.3}}>
            {t('为彼此尚不信任的机构而生。','Built for institutions that do not yet trust one another.')}
          </div>
        </div>
        {[
          [t('协议','Protocol'), ['Scheme A','Scheme B v3.0','Audit Oracle','Whitepaper']],
          [t('开发','Build'),    ['SDK','Circuits','RPC','Devnet']],
          [t('合规','Compliance'),['MAS','SEC','FCA','Audit log']],
        ].map(([title,items],i)=>(
          <div key={i}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--ink-3)',marginBottom:14}}>{title.toUpperCase()}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {items.map((it,j)=>(<a key={j} className="serif" style={{fontSize:15,color:'var(--ink-2)'}}>{it} <span style={{color:'var(--ink-faint)',fontSize:12}}>↗</span></a>))}
            </div>
          </div>
        ))}
      </div>
      <div style={{maxWidth:1500,margin:'40px auto 0',paddingTop:18,borderTop:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--ink-3)'}}>NEXUM PROTOCOL · COLOSSEUM FRONTIER · 2026 · COLOPHON SET IN FRAUNCES &amp; INTER TIGHT</span>
        <span className="serif italic" style={{fontStyle:'italic',fontSize:13,color:'var(--ink-3)'}}>{t('— 完 / fin —','— fin —')}</span>
      </div>
    </footer>
  );
}

// Tweaks panel (minimal)
function Tweaks({ open, onClose, paper, setPaper, accent, setAccent, lang }){
  if(!open) return null;
  const t=(zh,en)=>lang==='zh'?zh:en;
  const papers = [['#f4f1ea','Bone'],['#ece8df','Buff'],['#d8d3c2','Stone'],['#f7f4ec','Cream']];
  const accents = [['#e2502b','Vermillion'],['#1d2a55','Indigo'],['#1f6f3e','Forest'],['#0a0a0c','Ink']];
  return (
    <div style={{position:'fixed',right:20,bottom:74,zIndex:60,width:300,background:'var(--bg)',border:'1px solid var(--ink)',padding:18,boxShadow:'0 12px 32px rgba(0,0,0,.18)',display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em'}}>{t('调节面板','TWEAKS')}</span>
        <button onClick={onClose} style={{fontSize:14}}>×</button>
      </div>
      <div>
        <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--ink-3)',marginBottom:8}}>{t('纸张','PAPER')}</div>
        <div style={{display:'flex',gap:6}}>
          {papers.map(([c,n])=>(
            <button key={n} onClick={()=>setPaper(c)} title={n} style={{width:36,height:36,background:c,border:paper===c?'2px solid var(--ink)':'1px solid var(--line-2)'}}/>
          ))}
        </div>
      </div>
      <div>
        <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'var(--ink-3)',marginBottom:8}}>{t('信号色','ACCENT')}</div>
        <div style={{display:'flex',gap:6}}>
          {accents.map(([c,n])=>(
            <button key={n} onClick={()=>setAccent(c)} title={n} style={{width:36,height:36,background:c,border:accent===c?'2px solid var(--ink)':'1px solid var(--line-2)'}}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomePage({ lang, setLang, onEnter, onPlayAct }){
  const [demoTrigger, setDemoTrigger] = aS(0);
  const launch = ()=>{ document.getElementById('act-section')?.scrollIntoView({behavior:'smooth',block:'start'}); };
  const play = ()=>{ launch(); setTimeout(()=> setDemoTrigger(x=>x+1), 600); };
  return (
    <>
      <HeroV3 onLaunch={onEnter} onPlay={play} lang={lang} setLang={setLang}/>
      <div style={{marginTop:48}}><ParchmentTicker/></div>
      <div id="act-section"><ThreeActStage lang={lang} demoTrigger={demoTrigger}/></div>
      <VersionSlots lang={lang}/>
      <GameMatrix lang={lang}/>
      {/* CTA strip */}
      <section style={{padding:'80px 48px',background:'var(--ink)',color:'var(--bg)',borderTop:'2px solid var(--ink)'}}>
        <div style={{maxWidth:1500,margin:'0 auto',display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:32,alignItems:'end'}}>
          <div>
            <div className="mono" style={{fontSize:10.5,letterSpacing:'.28em',color:'#9a9aa3'}}>FOLIO 99 · ENTRY</div>
            <h2 className="serif" style={{margin:'10px 0 0',fontSize:'clamp(40px,4.6vw,72px)',fontWeight:300,letterSpacing:'-.03em',lineHeight:.95,color:'var(--bg)'}}>
              {lang==='zh'? <>选择你的<br/><em style={{fontStyle:'italic'}}>身份。</em></> : <>Choose your<br/><em style={{fontStyle:'italic'}}>station.</em></>}
            </h2>
          </div>
          <button onClick={()=>onEnter('trader')} style={{textAlign:'left',padding:'28px 28px',border:'1px solid var(--bg)',background:'transparent',color:'var(--bg)',cursor:'pointer',transition:'background .2s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(244,241,234,.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--accent)'}}>TRADER · DESK</div>
            <div className="serif" style={{fontStyle:'italic',fontSize:38,fontWeight:300,marginTop:8,letterSpacing:'-.02em',lineHeight:1}}>{lang==='zh'?'交易员':'Trader'}</div>
            <div className="mono" style={{fontSize:11,marginTop:14,letterSpacing:'.12em',color:'#dadbde'}}>ENTER TERMINAL →</div>
          </button>
          <button onClick={()=>onEnter('regulator')} style={{textAlign:'left',padding:'28px 28px',border:'1px solid var(--bg)',background:'transparent',color:'var(--bg)',cursor:'pointer',transition:'background .2s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(244,241,234,.06)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'#9eb3e8'}}>AUDITOR · CHAMBERS</div>
            <div className="serif" style={{fontStyle:'italic',fontSize:38,fontWeight:300,marginTop:8,letterSpacing:'-.02em',lineHeight:1}}>{lang==='zh'?'监察机构':'Regulator'}</div>
            <div className="mono" style={{fontSize:11,marginTop:14,letterSpacing:'.12em',color:'#dadbde'}}>ENTER CHAMBER →</div>
          </button>
        </div>
      </section>
      <FooterColophon lang={lang}/>
    </>
  );
}

function App(){
  const [lang, setLang] = aS('zh');
  const [route, setRoute] = aS('home'); // home | login | trader | regulator
  const [tOpen, setTOpen] = aS(false);
  const [paper, setPaper] = aS('#f4f1ea');
  const [accent, setAccent] = aS('#e2502b');
  const [auditStash, setAuditStash] = aS([]); // settlements completed in trader → regulator can query

  aE(()=>{
    document.documentElement.style.setProperty('--bg', paper);
    document.documentElement.style.setProperty('--accent', accent);
    const r=parseInt(accent.slice(1,3),16),g=parseInt(accent.slice(3,5),16),b=parseInt(accent.slice(5,7),16);
    document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},.08)`);
  },[paper,accent]);

  aE(()=>{ window.scrollTo(0,0); },[route]);

  const goLogin = (intent)=>{
    if(intent==='trader' || intent==='regulator') setRoute(intent);
    else setRoute('login');
  };
  const onPick = (r)=>{
    if(r==='home') setRoute('home');
    else setRoute(r);
  };
  const onExit = ()=> setRoute('login');

  const onAuditStash = (entry)=>{
    setAuditStash(s => [...s, entry]);
  };

  return (
    <div style={{minHeight:'100vh',position:'relative'}}>
      {/* paper grain — only on bone routes */}
      {(route==='home' || route==='login') && (
        <svg className="grain" style={{position:'fixed',inset:0,zIndex:1,pointerEvents:'none',mixBlendMode:'multiply',opacity:.45}}>
          <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .12 0"/></filter>
          <rect width="100%" height="100%" filter="url(#n)"/>
        </svg>
      )}

      <div style={{position:'relative',zIndex:2}}>
        {route==='home' && <HomePage lang={lang} setLang={setLang} onEnter={goLogin} onPlayAct={()=>{}}/>}
        {route==='login' && <LoginPage onPick={onPick} lang={lang} setLang={setLang}/>}
        {route==='trader' && <TraderTerminal onExit={onExit} lang={lang} setLang={setLang} onAuditStash={onAuditStash}/>}
        {route==='regulator' && <RegulatorChamber onExit={onExit} lang={lang} setLang={setLang} stash={auditStash}/>}
      </div>

      {/* Floating tweaks button — only on home */}
      {route==='home' && <>
        <button className="btn solid" onClick={()=>setTOpen(true)} style={{position:'fixed',right:20,bottom:20,zIndex:55}}>
          ⚙ {lang==='zh'?'调节':'TWEAKS'}
        </button>
        <Tweaks open={tOpen} onClose={()=>setTOpen(false)} paper={paper} setPaper={setPaper} accent={accent} setAccent={setAccent} lang={lang}/>
      </>}

      {/* Persistent route switcher (always visible, top-right floating) */}
      {route!=='home' && (
        <div style={{position:'fixed',top:14,right:20,zIndex:50,display:'flex',gap:6}}>
          <button onClick={()=>setRoute('home')} className="mono" style={{fontSize:9,letterSpacing:'.18em',padding:'6px 10px',border:'1px solid #f4f1ea',color:'#f4f1ea',background:'rgba(10,10,12,.6)',backdropFilter:'blur(6px)'}}>← COVER</button>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
