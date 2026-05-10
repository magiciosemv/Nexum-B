// P3 Guided Demo + Tweaks panel + App shell
const { useState: aS, useEffect: aE, useRef: aR } = React;

// Demo script: (page, narration_zh, narration_en, highlight_selector, duration_ms)
const DEMO_SCRIPT = [
  ['landing',  '欢迎使用 Nexum。Solana 上首个机构级加密余额暗池结算协议。',        'Welcome to Nexum — the first institutional dark-pool settlement protocol on Solana.',          null, 4200],
  ['role',     '选择角色。以交易员身份进入可亲自生成 ZK 证明；以监管身份进入可对结算进行合规审计。', 'Pick a role. Traders generate ZK proofs. Regulators audit settlements for compliance.', null, 4600],
  ['trader',   '进入交易员终端。左侧配置对手方 + 金额；本地已完成密文余额解密。',  'Trader terminal. Configure counterparty and amount on the left — your ciphertext balance has been decrypted locally.',   null, 4600],
  ['trader',   '点击「生成证明」。12,778 个约束逐个点亮 — 这是 Groth16 在浏览器内的 3 秒证明。', 'Hit "generate proof". 12,778 constraints light up — that\'s Groth16 proving in 3 seconds in the browser.',   '__trigger_prove', 4200],
  ['trader',   '双方证明握手完成后，链上 Ledger PDA 字节级变化就此可见 — 一笔结算共耗 198k CU。', 'Once both proofs handshake, the on-chain Ledger PDA changes byte-by-byte — total cost ~198k CU.',   null, 5400],
  ['regulator','切换到监管终端。PCR0/1/2 对 TEE 飞地进行远程证明。',                 'Switch to Regulator. PCR0/1/2 attests the TEE enclave.',                                         '__trigger_audit', 4200],
  ['regulator','飞地解密密文 — 同时强制写入 AuditLog PDA，被审计用户永久可见。',    'The enclave decrypts the ciphertext — and mandatorily writes an AuditLog PDA that the audited user sees forever.', null, 5800],
];

function GuidedDemo({ active, step, onExit, lang }){
  if(!active) return null;
  const s = DEMO_SCRIPT[step];
  if(!s) return null;
  const narr = lang==='zh'?s[1]:s[2];
  const pct = (step+1)/DEMO_SCRIPT.length;
  return (
    <div style={{
      position:'fixed',left:0,right:0,bottom:0,zIndex:40,
      background:'linear-gradient(to top, rgba(7,7,10,.98) 60%, rgba(7,7,10,.6))',
      padding:'28px 32px 24px',
      borderTop:'1px solid var(--line-2)',
      backdropFilter:'blur(10px)',
      animation:'slideUp .3s ease'
    }}>
      <div style={{maxWidth:1280,margin:'0 auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
          <span className="tag green" style={{animation:'pulse-dot 1.6s infinite'}}>● GUIDED DEMO</span>
          <span className="mono" style={{fontSize:11,color:'var(--ink-dim)',letterSpacing:'.12em'}}>STEP {step+1} / {DEMO_SCRIPT.length}</span>
          <div style={{flex:1,height:2,background:'var(--line-2)',borderRadius:1,overflow:'hidden'}}>
            <div style={{width:`${pct*100}%`,height:'100%',background:'var(--accent)',transition:'width .4s'}}/>
          </div>
          <button className="btn" onClick={onExit} style={{padding:'6px 12px',fontSize:10}}>■ EXIT</button>
        </div>
        <div style={{fontSize:18,lineHeight:1.55,color:'var(--ink)',textWrap:'pretty',maxWidth:1100}}>{narr}</div>
      </div>
    </div>
  );
}

// ─── Tweaks panel ─────────────────────────────────────────
function TweaksPanel({ open, onClose, state, setState, setPage, lang, t }){
  if(!open) return null;
  const setK = (k,v)=> setState(s=>({...s,[k]:v}));
  return (
    <div style={{
      position:'fixed',right:20,bottom:20,zIndex:50,width:300,
      background:'var(--panel)',border:'1px solid var(--line-2)',borderRadius:14,
      padding:18,display:'flex',flexDirection:'column',gap:16,
      boxShadow:'0 20px 60px rgba(0,0,0,.6)',
      animation:'slideUp .2s ease'
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="mono" style={{fontSize:11,letterSpacing:'.2em',textTransform:'uppercase',color:'var(--ink-dim)'}}>{t('tweaks_title')}</span>
        <button onClick={onClose} style={{color:'var(--ink-dim)',fontSize:16,padding:4,cursor:'pointer'}}>×</button>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em'}}>{t('tweak_page')}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {[['landing',t('page_landing')],['role',t('page_role')],['trader',t('page_trader')],['regulator',t('page_regulator')]].map(([v,l])=>(
            <button key={v} className="btn" onClick={()=>setPage(v)} style={{padding:'8px 10px',fontSize:10,justifyContent:'center'}}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em'}}>{t('tweak_accent')}</div>
        <div style={{display:'flex',gap:8}}>
          {[
            ['#7cf0b5','green'],
            ['#6ad0ff','blue'],
            ['#ffb86b','amber'],
            ['#ff8fb1','rose'],
          ].map(([c,n])=>(
            <button key={n} onClick={()=>setK('accent',c)}
              style={{width:28,height:28,borderRadius:'50%',background:c,border: state.accent===c?'2px solid #fff':'1px solid var(--line-2)',cursor:'pointer'}}/>
          ))}
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em'}}>{t('tweak_motion')}</div>
        <div style={{display:'flex',gap:6}}>
          {['calm','normal','amped'].map(m=>(
            <button key={m} onClick={()=>setK('motion',m)} className="btn"
              style={{padding:'7px 10px',fontSize:10,flex:1,justifyContent:'center',
                background: state.motion===m?'var(--accent-soft)':'var(--panel-2)',
                color: state.motion===m?'var(--accent)':'var(--ink-dim)',
                borderColor: state.motion===m?'var(--accent-line)':'var(--line-2)'}}>{m}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── App shell ───────────────────────────────────────────
function App(){
  const [lang, setLang] = aS('zh');
  const [page, setPage] = aS(()=> {
    try { return localStorage.getItem('nexum_page') || 'landing'; } catch(e){ return 'landing'; }
  });
  const [tweaksOpen, setTweaksOpen] = aS(false);
  const [tweaks, setTweaks] = aS({ accent:'#7cf0b5', motion:'normal' });
  const [demoActive, setDemoActive] = aS(false);
  const [demoStep, setDemoStep] = aS(0);
  const [proveTrigger, setProveTrigger] = aS(0);
  const [auditTrigger, setAuditTrigger] = aS(0);

  const t = useT(lang);

  aE(()=>{ try { localStorage.setItem('nexum_page', page); } catch(e){} },[page]);

  aE(()=>{
    document.documentElement.style.setProperty('--accent', tweaks.accent);
    document.documentElement.style.setProperty('--accent-soft', hexToRgba(tweaks.accent,.10));
    document.documentElement.style.setProperty('--accent-line', hexToRgba(tweaks.accent,.35));
  },[tweaks.accent]);

  // Demo step driver
  aE(()=>{
    if(!demoActive) return;
    const s = DEMO_SCRIPT[demoStep];
    if(!s){ setDemoActive(false); return; }
    if(s[0] !== page) setPage(s[0]);
    if(s[3]==='__trigger_prove') setTimeout(()=> setProveTrigger(x=>x+1), 800);
    if(s[3]==='__trigger_audit') setTimeout(()=> setAuditTrigger(x=>x+1), 800);
    const id = setTimeout(()=> setDemoStep(v=>v+1), s[4]);
    return ()=> clearTimeout(id);
  },[demoActive, demoStep]);

  const startDemo = ()=>{ setDemoStep(0); setDemoActive(true); };
  const exitDemo = ()=> setDemoActive(false);

  const pageBg = page==='landing' ? 'backdrop' : 'backdrop dense';

  return (
    <div style={{minHeight:'100vh',position:'relative'}} data-screen-label={`0${['landing','role','trader','regulator'].indexOf(page)+1} ${page}`}>
      <div className={pageBg}/>

      {/* floating controls (always available) */}
      <FloatingControls
        t={t} lang={lang} setLang={setLang}
        page={page}
        onToggleTweaks={()=>setTweaksOpen(v=>!v)}
        onDemo={demoActive?exitDemo:startDemo}
        demoActive={demoActive}
      />

      {page==='landing' && (
        <>
          <Nav lang={lang} setLang={setLang} t={t} onLaunch={()=>setPage('role')} current={page} setPage={setPage}/>
          <Landing t={t} lang={lang} onLaunch={()=>setPage('role')}/>
        </>
      )}
      {page==='role' && (
        <RoleSelect t={t} setPage={setPage} lang={lang} setLang={setLang}/>
      )}
      {page==='trader' && (
        <div style={{paddingTop:20}}>
          <SettlementTerminal t={t} lang={lang} setPage={setPage} demoTrigger={proveTrigger}/>
          <PageSwitcher t={t} page={page} setPage={setPage}/>
        </div>
      )}
      {page==='regulator' && (
        <div style={{paddingTop:20}}>
          <RegulatorTerminal t={t} lang={lang} setPage={setPage} demoTrigger={auditTrigger}/>
          <PageSwitcher t={t} page={page} setPage={setPage}/>
        </div>
      )}

      <TweaksPanel open={tweaksOpen} onClose={()=>setTweaksOpen(false)} state={tweaks} setState={setTweaks} setPage={setPage} lang={lang} t={t}/>
      <GuidedDemo active={demoActive} step={demoStep} onExit={exitDemo} lang={lang}/>
    </div>
  );
}

function FloatingControls({ t, lang, setLang, page, onToggleTweaks, onDemo, demoActive }){
  // on landing the Nav handles lang; elsewhere show floater
  const showLang = page !== 'landing' && page !== 'role';
  return (
    <div style={{position:'fixed',top:20,right:20,zIndex:30,display:'flex',gap:8,alignItems:'center'}}>
      {showLang && (
        <button className="pill" onClick={()=>setLang(lang==='zh'?'en':'zh')} style={{cursor:'pointer'}}>
          <span style={{color:'var(--ink)'}}>{t('lang_toggle')}</span>
        </button>
      )}
      {page !== 'landing' && page !== 'role' && (
        <button className={'btn '+(demoActive?'':'primary')} onClick={onDemo} style={{padding:'8px 12px',fontSize:10.5}}>
          {demoActive? t('guided_exit'): t('guided_demo')}
        </button>
      )}
    </div>
  );
}

function PageSwitcher({ t, page, setPage }){
  return (
    <div style={{maxWidth:1400,margin:'24px auto 40px',padding:'0 32px',display:'flex',gap:10,justifyContent:'center'}}>
      <button className="pill" onClick={()=>setPage('landing')} style={{cursor:'pointer'}}>← {t('page_landing')}</button>
      <button className="pill" onClick={()=>setPage('role')} style={{cursor:'pointer'}}>{t('page_role')}</button>
      <button className={"pill "+(page==='trader'?'':'')} onClick={()=>setPage('trader')} style={{cursor:'pointer',background: page==='trader'?'var(--accent-soft)':undefined,color:page==='trader'?'var(--accent)':undefined}}>{t('page_trader')}</button>
      <button className={"pill "+(page==='regulator'?'violet':'')} onClick={()=>setPage('regulator')} style={{cursor:'pointer',background:page==='regulator'?'var(--violet-soft)':undefined,color:page==='regulator'?'var(--violet)':undefined}}>{t('page_regulator')}</button>
    </div>
  );
}

function hexToRgba(hex, a){
  const h = hex.replace('#','');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
