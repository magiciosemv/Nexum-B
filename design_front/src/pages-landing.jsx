// P1 Landing + P2 Role Select
const { useState: useState1, useEffect: useEffect1 } = React;

function Nav({ lang, setLang, t, onLaunch, current, setPage }){
  return (
    <nav style={{position:'relative',zIndex:3,maxWidth:1280,margin:'0 auto',padding:'24px 40px',display:'flex',alignItems:'center',gap:16}}>
      <button onClick={()=>setPage('landing')} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
        <NexumMark size={30}/>
        <span style={{fontWeight:700,letterSpacing:'-.01em',fontSize:16}}>Nexum<span style={{color:'var(--accent)',margin:'0 4px'}}>·</span><span style={{color:'var(--ink-dim)',fontWeight:500,fontSize:13}}>PROTOCOL</span></span>
      </button>
      <div style={{flex:1}}/>
      <div style={{display:'flex',gap:28,marginRight:20}}>
        {[
          ['product',t('nav_product')],
          ['docs',t('nav_docs')],
          ['circuit',t('nav_circuit')],
          ['github',t('nav_github')],
        ].map(([k,v])=>(
          <span key={k} className="mono" style={{fontSize:11,letterSpacing:'.15em',textTransform:'uppercase',color:'var(--ink-dim)',cursor:'pointer'}}>{v}</span>
        ))}
      </div>
      <button className="pill" onClick={()=>setLang(lang==='zh'?'en':'zh')} style={{cursor:'pointer'}}>
        <span style={{color:'var(--ink)'}}>{t('lang_toggle')}</span>
      </button>
      <button className="btn primary" onClick={onLaunch}>{t('launch_app')}</button>
    </nav>
  );
}

// ── P1 Landing ─────────────────────────────────────────────
function Landing({ t, lang, onLaunch }){
  return (
    <div>
      {/* hero */}
      <div style={{maxWidth:1280,margin:'0 auto',padding:'48px 40px 0',display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:32,position:'relative',zIndex:2}}>
        <div>
          <div className="eyebrow" style={{marginBottom:20}}>{t('hero_eyebrow')}</div>
          <h1 style={{fontSize:72,lineHeight:1.02,letterSpacing:'-.025em',fontWeight:800,margin:'0 0 14px',textWrap:'balance'}}>
            {t('hero_h1')}<br/><span style={{color:'var(--accent)'}}>{t('hero_h2')}</span>
          </h1>
          <p style={{color:'#b9bbc6',fontSize:17,lineHeight:1.55,maxWidth:620,marginTop:22}}>{t('hero_lede')}</p>

          <div style={{display:'flex',gap:12,marginTop:34}}>
            <button className="btn primary" onClick={onLaunch} style={{padding:'14px 22px',fontSize:12}}>{t('cta_start')}</button>
            <button className="btn ghost" style={{padding:'14px 22px',fontSize:12}}>{t('cta_docs')}</button>
          </div>

          {/* inline proof-points row */}
          <div style={{display:'flex',gap:32,marginTop:48,paddingTop:24,borderTop:'1px solid var(--line)'}}>
            {[
              ['198k','CU / settle'],
              ['12,778','R1CS constraints'],
              ['256 B','Groth16 proof'],
              ['0','plaintext on-chain'],
            ].map(([n,l],i)=>(
              <div key={i}>
                <div className="mono" style={{fontSize:22,fontWeight:700,color:i===3?'var(--accent)':'var(--ink)',letterSpacing:'-.02em'}}>{n}</div>
                <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em',textTransform:'uppercase',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* architecture schematic */}
        <ArchSchematic t={t}/>
      </div>

      <div style={{maxWidth:1280,margin:'72px auto 0',padding:'0 40px'}}>
        <Ticker/>
      </div>

      {/* feature cards */}
      <div style={{maxWidth:1280,margin:'40px auto 0',padding:'0 40px 72px',display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:16}}>
        <FeatureCard t={t} kind="green" titleKey="feat_1_title" subKey="feat_1_sub" statKey="feat_1_stat" statSubKey="feat_1_stat_sub">
          <MiniCrypt/>
        </FeatureCard>
        <FeatureCard t={t} kind="green" titleKey="feat_2_title" subKey="feat_2_sub" statKey="feat_2_stat" statSubKey="feat_2_stat_sub">
          <MiniCU/>
        </FeatureCard>
        <FeatureCard t={t} kind="violet" titleKey="feat_3_title" subKey="feat_3_sub" statKey="feat_3_stat" statSubKey="feat_3_stat_sub">
          <MiniTee/>
        </FeatureCard>
      </div>
    </div>
  );
}

function FeatureCard({ t, kind, titleKey, subKey, statKey, statSubKey, children }){
  const statColor = kind==='violet'?'var(--violet)':'var(--accent)';
  return (
    <div className="panel" style={{padding:24,display:'flex',flexDirection:'column',gap:18,minHeight:260}}>
      <div>{children}</div>
      <div>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:'-.005em'}}>{t(titleKey)}</div>
        <div style={{color:'var(--ink-dim)',fontSize:12.5,marginTop:6,lineHeight:1.55}}>{t(subKey)}</div>
      </div>
      <div style={{marginTop:'auto',paddingTop:18,borderTop:'1px solid var(--line)',display:'flex',alignItems:'baseline',gap:10}}>
        <span className="mono" style={{fontSize:24,fontWeight:700,color:statColor,letterSpacing:'-.02em'}}>{t(statKey)}</span>
        <span className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.12em',textTransform:'uppercase'}}>{t(statSubKey)}</span>
      </div>
    </div>
  );
}

function MiniCrypt(){
  const [rev,setRev] = useState1(0);
  useEffect1(()=>{
    const id = setInterval(()=> setRev(r=>(r+1)%3), 1800);
    return ()=>clearInterval(id);
  },[]);
  return (
    <div style={{height:72,display:'flex',alignItems:'center',gap:10,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
      <div style={{flex:1}}>
        <div style={{color:'var(--ink-faint)',fontSize:9,letterSpacing:'.15em',marginBottom:6}}>BALANCE · ON-CHAIN</div>
        <div style={{color:'var(--accent)',wordBreak:'break-all',lineHeight:1.5}}>
          {rev===0 && '0x 2b4f 9c02 aa1e ef02 11a3 cd88 d81a'}
          {rev===1 && '0x 71fc 3e12 8801 2e90 00b2 4a7f 90b2'}
          {rev===2 && '0x aa14 cc02 11bc 9901 f342 e089 0017'}
        </div>
      </div>
    </div>
  );
}
function MiniCU(){
  return (
    <div style={{height:72,display:'flex',alignItems:'flex-end',gap:4}}>
      {[64,62,28,18,8,18].map((v,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
          <div style={{width:'100%',height:v,background:'var(--gold)',opacity:.4+i*0.08,borderRadius:'2px 2px 0 0'}}/>
        </div>
      ))}
    </div>
  );
}
function MiniTee(){
  return (
    <div style={{height:72,display:'flex',alignItems:'center',justifyContent:'center',gap:6,flexDirection:'column'}}>
      <svg viewBox="0 0 120 60" style={{width:'100%',height:60}}>
        {[0,1,2].map(i=>(
          <circle key={i} cx="60" cy="30" r={10+i*8} fill="none" stroke="var(--violet)" strokeWidth="1.2" opacity={0.9-i*0.25} strokeDasharray="3 3"/>
        ))}
        <circle cx="60" cy="30" r="4" fill="var(--violet)"/>
        <text x="60" y="54" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill="var(--ink-faint)" letterSpacing="2">PCR0/1/2</text>
      </svg>
    </div>
  );
}

// ── Architecture schematic ─────────────────────────────────
function ArchSchematic({ t }){
  const [pulse,setPulse] = useState1(0);
  useEffect1(()=>{
    const id = setInterval(()=> setPulse(p=>(p+1)%3), 2200);
    return ()=>clearInterval(id);
  },[]);
  return (
    <div className="panel" style={{padding:22,display:'flex',flexDirection:'column',gap:14,position:'relative',overflow:'hidden'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span className="kicker">{t('arch_live')}</span>
        <span className="pill"><span className="dot"/>READY</span>
      </div>

      <LedgerBox label={t('arch_ledger_a')} active={pulse===0}/>
      <LedgerBox label={t('arch_ledger_b')} active={pulse===1}/>

      {/* connector line down */}
      <div style={{position:'relative',height:26,display:'flex',justifyContent:'center'}}>
        <svg width="2" height="26"><line x1="1" y1="0" x2="1" y2="26" stroke="var(--line-3)" strokeDasharray="3 4"/></svg>
      </div>

      <div style={{border:'1px solid var(--violet-line)',background:'var(--violet-soft)',borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:10}}>
        <span style={{width:8,height:8,borderRadius:4,background:'var(--violet)',boxShadow:pulse===2?'0 0 12px var(--violet)':'none',transition:'box-shadow .4s'}}/>
        <span className="mono" style={{fontSize:11,color:'var(--violet)',letterSpacing:'.08em',textTransform:'uppercase'}}>{t('arch_settle')}</span>
      </div>

      <div style={{position:'relative',height:24,display:'flex',justifyContent:'center'}}>
        <svg width="2" height="24"><line x1="1" y1="0" x2="1" y2="24" stroke="var(--line-3)" strokeDasharray="3 4"/></svg>
      </div>

      <div style={{alignSelf:'center',border:'1px solid var(--gold-line)',background:'var(--gold-soft)',borderRadius:999,padding:'6px 14px'}}>
        <span className="mono" style={{fontSize:10,color:'var(--gold)',letterSpacing:'.15em',textTransform:'uppercase'}}>{t('arch_tee')}</span>
      </div>
    </div>
  );
}

function LedgerBox({ label, active }){
  return (
    <div style={{border:'1px solid var(--line-2)',background:'var(--panel-2)',borderRadius:10,padding:'12px 14px',position:'relative',overflow:'hidden'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:11,color:'var(--ink-dim)'}}>{label}</span>
        <span className="mono" style={{fontSize:9,color:'var(--ink-faint)',letterSpacing:'.15em'}}>PDA</span>
      </div>
      <div className="mono" style={{marginTop:6,fontSize:11,color:'var(--accent)',letterSpacing:'.04em',overflow:'hidden',whiteSpace:'nowrap'}}>
        balance_ct{' '}
        <span style={{background:active?'linear-gradient(90deg,rgba(124,240,181,.35),rgba(124,240,181,0) 70%)':'none',padding:'2px 0'}}>
          ████████████████████████
        </span>
      </div>
    </div>
  );
}

// ── P2 Role Select ─────────────────────────────────────────
function RoleSelect({ t, setPage, lang, setLang }){
  return (
    <div style={{minHeight:'calc(100vh - 48px)',display:'flex',flexDirection:'column',position:'relative',zIndex:2}}>
      <div style={{maxWidth:1280,margin:'0 auto',width:'100%',padding:'24px 40px',display:'flex',alignItems:'center',gap:16}}>
        <button className="pill" onClick={()=>setPage('landing')} style={{cursor:'pointer'}}>{t('return_home')}</button>
        <div style={{flex:1}}/>
        <span className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.2em',textTransform:'uppercase'}}>{t('gate_restricted')}</span>
        <button className="pill" onClick={()=>setLang(lang==='zh'?'en':'zh')} style={{cursor:'pointer'}}>
          <span style={{color:'var(--ink)'}}>{t('lang_toggle')}</span>
        </button>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px 40px 80px'}}>
        <div className="mono" style={{fontSize:11,color:'var(--ink-faint)',letterSpacing:'.3em',textTransform:'uppercase',marginBottom:18}}>{t('gate_eyebrow')}</div>
        <h1 style={{fontSize:52,fontWeight:800,letterSpacing:'-.02em',margin:'0 0 48px'}}>{t('brand')}</h1>

        <div style={{display:'grid',gridTemplateColumns:'repeat(3, 300px)',gap:22}}>
          <RoleCard variant="green" t={t} titleKey="role_trader" subKey="role_trader_sub" reqKey="role_trader_req" ctaKey="role_trader_cta" onClick={()=>setPage('trader')} icon={<TraderIcon/>}/>
          <RoleCard variant="violet" t={t} titleKey="role_reg" subKey="role_reg_sub" reqKey="role_reg_req" ctaKey="role_reg_cta" onClick={()=>setPage('regulator')} icon={<RegIcon/>}/>
          <RoleCard variant="gold" t={t} titleKey="role_dev" subKey="role_dev_sub" reqKey="role_dev_req" ctaKey="role_dev_cta" onClick={()=>alert('Dev view · coming soon')} icon={<DevIcon/>} disabled/>
        </div>

        {/* tech badges */}
        <div style={{marginTop:56,display:'flex',gap:14,flexWrap:'wrap',justifyContent:'center'}}>
          {[
            ['◉ BABY JUBJUB','v1.0'],
            ['◉ GROTH16 BN254','12,778 cnstr'],
            ['◉ NITRO ENCLAVE','PCR ✓'],
          ].map(([a,b],i)=>(
            <div key={i} className="mono" style={{padding:'8px 16px',border:'1px solid var(--line-2)',borderRadius:999,background:'var(--panel-2)',fontSize:10.5,display:'inline-flex',gap:10,alignItems:'center'}}>
              <span style={{color:'var(--ink-dim)',letterSpacing:'.15em'}}>{a}</span>
              <span style={{color:'var(--ink-faint)',letterSpacing:'.1em'}}>{b}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoleCard({ variant, t, titleKey, subKey, reqKey, ctaKey, onClick, icon, disabled }){
  const stripe = { green:'var(--accent)', violet:'var(--violet)', gold:'var(--gold)' }[variant];
  const soft   = { green:'var(--accent-soft)', violet:'var(--violet-soft)', gold:'var(--gold-soft)' }[variant];
  const line   = { green:'var(--accent-line)', violet:'var(--violet-line)', gold:'var(--gold-line)' }[variant];
  const [hover,setHover] = useState1(false);
  return (
    <div className="panel" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{padding:0,overflow:'hidden',display:'flex',flexDirection:'column',transition:'transform .25s, border-color .25s',transform:hover?'translateY(-3px)':'none',borderColor:hover?line:'var(--line)',opacity:disabled?.55:1}}>
      <div style={{height:4,background:stripe}}/>
      <div style={{padding:26,display:'flex',flexDirection:'column',gap:14,flex:1}}>
        <div style={{width:48,height:48,borderRadius:10,background:soft,border:`1px solid ${line}`,display:'grid',placeItems:'center'}}>{icon}</div>
        <div style={{fontSize:22,fontWeight:700,letterSpacing:'-.01em'}}>{t(titleKey)}</div>
        <div style={{color:'var(--ink-dim)',fontSize:13,lineHeight:1.55,minHeight:40}}>{t(subKey)}</div>
        <div className="mono" style={{fontSize:10,color:'var(--ink-faint)',letterSpacing:'.15em',textTransform:'uppercase',marginTop:10}}>{t(reqKey)}</div>
        <button className={'btn '+(variant==='violet'?'violet':variant==='green'?'primary':'ghost')} onClick={onClick} disabled={disabled}
          style={{marginTop:'auto',padding:'12px 16px',justifyContent:'center',fontSize:11}}>
          {t(ctaKey)}
        </button>
      </div>
    </div>
  );
}

function TraderIcon(){
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 17 L8 12 L12 15 L21 6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="21" cy="6" r="1.8" fill="var(--accent)"/></svg>;
}
function RegIcon(){
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="var(--violet)" strokeWidth="1.6"/><circle cx="12" cy="12" r="3.5" stroke="var(--violet)" strokeWidth="1.6"/><circle cx="12" cy="12" r="1.2" fill="var(--violet)"/></svg>;
}
function DevIcon(){
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 8 L4 12 L8 16 M16 8 L20 12 L16 16 M14 6 L10 18" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

Object.assign(window, { Nav, Landing, RoleSelect });
