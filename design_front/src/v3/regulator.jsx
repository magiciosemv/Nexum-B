// Regulator chamber — paste a settlement id + audit key, decrypt the audit_ct, write to audit log
const { useState: rgS, useEffect: rgE, useRef: rgR, useMemo: rgM } = React;

// Hardcoded sample dataset for demo
const SAMPLE_SETTLEMENTS = [
  {
    settlementId: 'SETL-A41F8C2E', hash: '0x9f3c8a2e44b1c7d3e6892f7a4c1b8e25', initiator: '7xKpQwmNqRvU', counterparty: '2vBaPq8wzL9o', assetA: 'USDC', assetB: 'SOL', amount: 500000, ts: '2026-04-22T08:14:32.117Z', execTx: 'TX-7A3F2B91', block: 312847291,
  },
  {
    settlementId: 'SETL-3C9B4D88', hash: '0x44ad28e7b193f02c1e7d5912a8c0bc4f', initiator: '5fXkLmaRpQzS', counterparty: '9YzWxQ3vPqLm', assetA: 'USDC', assetB: 'USDT', amount: 2_300_000, ts: '2026-04-22T09:02:11.847Z', execTx: 'TX-1F22B77E', block: 312849022,
  },
  {
    settlementId: 'SETL-1E77B502', hash: '0x6e22d4a8f7c19b03e8d54fa921bcc7e1', initiator: '3kPpQ7BzwxLm', counterparty: '8RyXc2WzVqHy', assetA: 'wBTC', assetB: 'SOL', amount: 8.4, ts: '2026-04-22T11:47:55.221Z', execTx: 'TX-EE910C44', block: 312853118,
  },
];

// fake audit-key (any non-empty string with length >= 32 is "valid" for demo)
const VALID_KEY_HINT = 'aud_2P4qK7wB...mZ8X';

function RegulatorChamber({ onExit, lang, setLang, stash }){
  const t=(zh,en)=>lang==='zh'?zh:en;

  const dataset = rgM(()=>{
    const merged = [...SAMPLE_SETTLEMENTS, ...(stash||[])];
    return merged;
  },[stash]);

  const [txInput, setTxInput] = rgS('');
  const [keyInput, setKeyInput] = rgS('');
  const [phase, setPhase] = rgS('input'); // input → searching → key → unsealing → revealed → error
  const [target, setTarget] = rgS(null);
  const [errorMsg, setErrorMsg] = rgS('');
  const [auditLog, setAuditLog] = rgS([
    {ts:'2026-04-22T07:11:09.221Z', who:'reg.mas.gov', action:'decrypt', ref:'SETL-91B2A3C4', purpose:'AML scrub Q2'},
    {ts:'2026-04-22T07:53:48.511Z', who:'reg.mas.gov', action:'export', ref:'SETL-77FFAA01', purpose:'cross-border audit'},
  ]);

  // unsealing animation progress
  const [unsealPct, setUnsealPct] = rgS(0);

  const submitQuery = ()=>{
    if(!txInput.trim()) return;
    setPhase('searching');
    setErrorMsg('');
    setTimeout(()=>{
      const found = dataset.find(s => s.settlementId===txInput.trim() || s.execTx===txInput.trim());
      if(!found){
        setErrorMsg(t(`未找到 Settlement Record: ${txInput.trim()}\n请检查 ID 是否正确。`,`Settlement Record not found: ${txInput.trim()}\nPlease verify the ID.`));
        setPhase('error');
        return;
      }
      setTarget(found);
      setPhase('key');
    }, 700);
  };

  const submitKey = ()=>{
    if(keyInput.length<8){
      setErrorMsg(t('审计密钥格式无效。请提供有效的 audit_key。','Invalid audit key format. Please provide a valid audit_key.'));
      return;
    }
    setPhase('unsealing');
    setUnsealPct(0);
    let p=0;
    const id=setInterval(()=>{
      p+=0.04+Math.random()*0.02;
      setUnsealPct(Math.min(1,p));
      if(p>=1){
        clearInterval(id);
        // append audit log
        setAuditLog(l=>[{ts:new Date().toISOString(), who:'reg.mas.gov', action:'decrypt', ref:target.settlementId, purpose:'demo decryption', forced:true}, ...l]);
        setTimeout(()=>setPhase('revealed'), 350);
      }
    }, 90);
  };

  const reset = ()=>{ setTxInput(''); setKeyInput(''); setTarget(null); setPhase('input'); setUnsealPct(0); setErrorMsg(''); };

  // suggestions
  const suggest = (id)=>{ setTxInput(id); };

  return (
    <div className="dark" style={{minHeight:'100vh',display:'flex',flexDirection:'column'}}>
      {/* top rail */}
      <div style={{padding:'14px 36px',display:'flex',alignItems:'center',gap:20,borderBottom:'1px solid var(--d-line-2)',background:'var(--d-bg-2)'}}>
        <NexumSeal size={28} dark/>
        <Wordmark dark sub="REGULATOR · CHAMBER"/>
        <span style={{width:1,height:14,background:'var(--d-line-2)'}}/>
        <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--indigo)',background:'rgba(29,42,85,.4)',padding:'3px 8px',border:'1px solid #3a4a78'}}>● AUDITOR · reg.mas.gov</span>
        <div style={{flex:1}}/>
        <Slot dark/>
        <span style={{width:1,height:14,background:'var(--d-line-2)'}}/>
        <button onClick={()=>setLang(lang==='zh'?'en':'zh')} className="mono" style={{fontSize:11,letterSpacing:'.15em',color:'#f4f1ea'}}>{lang==='zh'?'EN':'中'}</button>
        <button onClick={onExit} className="btn" style={{padding:'8px 14px',fontSize:10,borderColor:'#f4f1ea',color:'#f4f1ea'}}>{t('登出','SIGN OUT')}</button>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:1,background:'var(--d-line)',minHeight:0}}>
        {/* MAIN — query → unseal → revealed */}
        <div style={{background:'var(--d-bg)',padding:'28px 36px',overflowY:'auto'}}>
          {/* Header */}
          <div style={{borderBottom:'1px solid var(--d-line-2)',paddingBottom:16,marginBottom:24}}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'#9a9aa3'}}>FOLIO 02 · AUDIT CHAMBER</div>
            <h1 className="serif" style={{margin:'8px 0 0',fontSize:'clamp(40px,4vw,64px)',fontWeight:300,letterSpacing:'-.025em',lineHeight:1,color:'#f4f1ea'}}>
              {t(<>取证。<em style={{fontStyle:'italic',color:'var(--indigo)',marginLeft:14}}>留痕。</em></>,
                 <>Forensics. <em style={{fontStyle:'italic',color:'var(--indigo)',marginLeft:14}}>On record.</em></>)}
            </h1>
            <div className="serif italic" style={{fontStyle:'italic',fontSize:15,color:'#9a9aa3',marginTop:10,maxWidth:680,lineHeight:1.5}}>
              {t('每一次解密都被强制写入审计日志。你能看穿密文，但你看不见的事——这条日志记得。','Every decryption is forcibly written to the audit log. You can see through ciphertext — but the things you don\'t see, this log remembers.')}
            </div>
          </div>

          {/* Step machine */}
          <StepMachine phase={phase}/>

          {/* Stage 1: input */}
          {(phase==='input' || phase==='error') && (
            <div style={{marginTop:32,padding:'28px 32px',border:'1px solid var(--d-line-2)',background:'var(--d-bg-2)'}}>
              <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--indigo)',marginBottom:10}}>I · QUERY · SETTLEMENT_ID OR EXECUTE_TX</div>
              <input value={txInput} onChange={e=>setTxInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitQuery()}
                placeholder="SETL-XXXXXXXX  or  TX-XXXXXXXX"
                style={{width:'100%',background:'var(--d-bg-3)',border:'1px solid var(--d-line-2)',color:'#f4f1ea',padding:'14px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:15,letterSpacing:'.05em',outline:'none',marginBottom:14}}/>
              {errorMsg && phase==='error' && (
                <div className="mono" style={{fontSize:11,color:'var(--danger)',padding:'10px 12px',border:'1px solid var(--danger)',background:'rgba(181,61,32,.08)',marginBottom:14,whiteSpace:'pre-line'}}>
                  ! {errorMsg}
                </div>
              )}
              <button onClick={submitQuery} disabled={!txInput.trim()} className="btn solid" style={{borderColor:'var(--indigo)',background:'var(--indigo)',color:'#f4f1ea'}}>
                {t('▶ 检索 SETTLEMENT RECORD','▶ FETCH SETTLEMENT RECORD')}
              </button>

              <div style={{marginTop:24,paddingTop:16,borderTop:'1px dashed var(--d-line-2)'}}>
                <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'#5a5a63',marginBottom:10}}>SAMPLE IDS · CLICK TO LOAD</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {dataset.map(s=>(
                    <button key={s.settlementId} onClick={()=>suggest(s.settlementId)} style={{textAlign:'left',padding:'8px 12px',border:'1px solid var(--d-line)',background:'transparent',display:'grid',gridTemplateColumns:'180px 1fr 200px',gap:14,alignItems:'center'}}>
                      <span className="mono" style={{fontSize:11,color:'var(--indigo)'}}>{s.settlementId}</span>
                      <span style={{fontSize:11,color:'#9a9aa3',fontFamily:'JetBrains Mono, monospace'}}>{s.assetA} ↔ {s.assetB} · {s.amount.toLocaleString()}</span>
                      <span className="mono" style={{fontSize:10,color:'#5a5a63',textAlign:'right'}}>{new Date(s.ts).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stage 2: searching */}
          {phase==='searching' && (
            <div style={{marginTop:32,padding:'40px 32px',border:'1px dashed var(--indigo)',background:'rgba(29,42,85,.08)',textAlign:'center'}}>
              <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--indigo)',marginBottom:12}}>SCANNING · SETTLEMENT_RECORDS</div>
              <div className="serif italic" style={{fontStyle:'italic',fontSize:24,color:'#f4f1ea'}}>{t('在链上检索结算记录','Querying settlement records')}<span className="cursor"/></div>
            </div>
          )}

          {/* Stage 3: enter key */}
          {phase==='key' && target && (
            <div style={{marginTop:32}}>
              <RecordHeader target={target} phase={phase} t={t}/>
              <div style={{marginTop:18,padding:'28px 32px',border:'1px solid var(--gold)',background:'rgba(201,150,47,.06)'}}>
                <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--gold)',marginBottom:10}}>II · DEMAND · audit_key</div>
                <input type="password" value={keyInput} onChange={e=>setKeyInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitKey()}
                  placeholder={VALID_KEY_HINT}
                  style={{width:'100%',background:'var(--d-bg-3)',border:'1px solid var(--d-line-2)',color:'#f4f1ea',padding:'14px 16px',fontFamily:'JetBrains Mono, monospace',fontSize:15,letterSpacing:'.05em',outline:'none',marginBottom:8}}/>
                <div className="mono" style={{fontSize:9,color:'#5a5a63',letterSpacing:'.1em',marginBottom:14}}>· {t('协议托管的审计密钥。任何长度 ≥ 8 的字符串均可在演示中使用。','Protocol-escrowed audit key. Any string of length ≥ 8 works in this demo.')}</div>
                {errorMsg && (
                  <div className="mono" style={{fontSize:11,color:'var(--danger)',padding:'8px 10px',border:'1px solid var(--danger)',background:'rgba(181,61,32,.08)',marginBottom:14}}>! {errorMsg}</div>
                )}
                <div style={{display:'flex',gap:8}}>
                  <button onClick={submitKey} className="btn" style={{borderColor:'var(--gold)',color:'var(--gold)'}}>
                    🔓 {t('解封 audit_ct','UNSEAL audit_ct')}
                  </button>
                  <button onClick={reset} className="btn" style={{borderColor:'#f4f1ea',color:'#f4f1ea'}}>
                    ← {t('换一笔','OTHER RECORD')}
                  </button>
                </div>
                <div style={{marginTop:18,padding:'10px 12px',border:'1px dashed var(--gold)',display:'flex',alignItems:'center',gap:10}}>
                  <span style={{color:'var(--gold)',fontSize:14}}>⚠</span>
                  <span style={{fontSize:11.5,color:'#9a9aa3',lineHeight:1.45}}>
                    {t('提交后，系统将向审计日志强制写入一条不可删除的解密记录。','Once submitted, the system will force-write an indelible decryption record into the audit log.')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stage 4: unsealing */}
          {phase==='unsealing' && target && (
            <div style={{marginTop:32}}>
              <RecordHeader target={target} phase={phase} t={t}/>
              <UnsealStage pct={unsealPct} target={target} t={t}/>
            </div>
          )}

          {/* Stage 5: revealed */}
          {phase==='revealed' && target && (
            <div style={{marginTop:32}}>
              <RecordHeader target={target} phase={phase} t={t}/>
              <RevealedRecord target={target} t={t}/>
              <div style={{marginTop:14,display:'flex',gap:8}}>
                <button onClick={reset} className="btn solid" style={{borderColor:'var(--indigo)',background:'var(--indigo)',color:'#f4f1ea'}}>
                  ← {t('再查一笔','QUERY ANOTHER')}
                </button>
                <button className="btn" style={{borderColor:'#f4f1ea',color:'#f4f1ea'}}>📄 {t('导出取证 PDF','EXPORT FORENSIC PDF')}</button>
                <button className="btn" style={{borderColor:'#f4f1ea',color:'#f4f1ea'}}>{ } {t('导出 JSON','EXPORT JSON')}</button>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR — audit log */}
        <div style={{background:'var(--d-bg)',display:'flex',flexDirection:'column',minHeight:0}}>
          <div style={{padding:'18px 22px',borderBottom:'1px solid var(--d-line-2)',background:'var(--d-bg-2)'}}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'#f4f1ea'}}>· APPEND-ONLY AUDIT LOG ·</div>
            <div className="serif italic" style={{fontStyle:'italic',fontSize:14,color:'var(--gold)',marginTop:4}}>{t('监察的监察。','Audit on the auditor.')}</div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'14px 22px'}}>
            {auditLog.map((a,i)=>(
              <div key={i} style={{padding:'12px 0',borderBottom:i<auditLog.length-1?'1px dotted var(--d-line)':'none'}}>
                <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:4}}>
                  <span className="mono" style={{fontSize:9,color:'#5a5a63',letterSpacing:'.1em'}}>{new Date(a.ts).toLocaleString('en-GB')}</span>
                  {a.forced && <span className="mono" style={{fontSize:8,letterSpacing:'.18em',color:'var(--gold)',padding:'1px 5px',border:'1px solid var(--gold)'}}>JUST WRITTEN</span>}
                </div>
                <div style={{display:'flex',gap:6,alignItems:'baseline'}}>
                  <span className="mono" style={{fontSize:11,color:'var(--indigo)'}}>{a.action}</span>
                  <span style={{color:'#5a5a63',fontSize:10}}>·</span>
                  <span className="mono" style={{fontSize:11,color:'#f4f1ea'}}>{a.ref}</span>
                </div>
                <div className="mono" style={{fontSize:10,color:'#9a9aa3',marginTop:3,letterSpacing:'.05em'}}>by {a.who}</div>
                <div className="serif italic" style={{fontStyle:'italic',fontSize:11.5,color:'#9a9aa3',marginTop:3}}>"{a.purpose}"</div>
              </div>
            ))}
          </div>
          <div style={{padding:'12px 22px',borderTop:'1px solid var(--d-line-2)',background:'var(--d-bg-2)'}}>
            <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'#5a5a63'}}>{auditLog.length} {t('条记录','entries')} · {t('不可删除 · 链上锚定','indelible · anchored on-chain')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepMachine({phase}){
  const order = ['input','searching','key','unsealing','revealed'];
  const cur = order.indexOf(phase==='error'?'input':phase);
  const labels = {input:'I · QUERY', searching:'· FETCH', key:'II · DEMAND KEY', unsealing:'· UNSEAL', revealed:'III · REVEAL'};
  return (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${order.length}, 1fr)`,gap:1,background:'var(--d-line)',border:'1px solid var(--d-line-2)'}}>
      {order.map((s,i)=>{
        const active = i===cur;
        const done = i<cur || phase==='revealed';
        const c = active?'var(--indigo)':done?'var(--green)':'#5a5a63';
        return (
          <div key={s} style={{background:active?'rgba(29,42,85,.12)':'var(--d-bg)',padding:'10px 14px'}}>
            <div className="mono" style={{fontSize:9.5,letterSpacing:'.18em',color:c,fontWeight:active?600:400}}>{done?'✓ ':active?'● ':'○ '}{labels[s]}</div>
          </div>
        );
      })}
    </div>
  );
}

function RecordHeader({target, phase, t}){
  return (
    <div style={{padding:'18px 22px',border:'1px solid var(--d-line-2)',background:'var(--d-bg-3)',display:'grid',gridTemplateColumns:'auto 1fr auto',gap:24,alignItems:'center'}}>
      <div>
        <div className="mono" style={{fontSize:9,color:'#5a5a63',letterSpacing:'.18em'}}>SETTLEMENT_ID</div>
        <div className="mono" style={{fontSize:14,color:'var(--indigo)',marginTop:3}}>{target.settlementId}</div>
      </div>
      <div>
        <div className="mono" style={{fontSize:9,color:'#5a5a63',letterSpacing:'.18em'}}>ON-CHAIN HEADER · PUBLIC</div>
        <div className="mono" style={{fontSize:11,color:'#dadbde',marginTop:3,letterSpacing:'.05em'}}>{target.execTx} · BLOCK {target.block.toLocaleString()}</div>
      </div>
      <div style={{textAlign:'right'}}>
        <div className="mono" style={{fontSize:9,color:'#5a5a63',letterSpacing:'.18em'}}>STATUS</div>
        <div className="mono" style={{fontSize:11,color: phase==='revealed'?'var(--green)':phase==='unsealing'?'var(--gold)':'#9a9aa3',marginTop:3,letterSpacing:'.1em'}}>{phase==='revealed'?'✓ DECRYPTED':phase==='unsealing'?'UNSEALING…':'CT FOUND · LOCKED 🔒'}</div>
      </div>
    </div>
  );
}

function UnsealStage({pct, target, t}){
  const ROWS=8, COLS=64, TOT=ROWS*COLS;
  const reveal = Math.floor(TOT*pct);
  // pre-generate ciphertext-vs-plaintext map
  const cells = React.useMemo(()=>{
    const cs='0123456789abcdef';
    return Array.from({length:TOT}).map(()=>({
      ct: cs[Math.floor(Math.random()*16)],
      pt: cs[Math.floor(Math.random()*16)],
    }));
  },[target.settlementId]);
  return (
    <div style={{padding:'24px 28px',border:'1px solid var(--gold)',background:'var(--d-bg-3)'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--gold)'}}>UNSEALING · audit_ct · 256B</span>
        <span className="mono" style={{fontSize:10,color:'#9a9aa3'}}>{Math.floor(pct*100)}%</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${COLS}, 1fr)`,gap:1,fontFamily:'JetBrains Mono, monospace',fontSize:9,letterSpacing:0,padding:'14px 16px',background:'#0a0a0c',border:'1px solid var(--d-line)'}}>
        {cells.map((c,i)=>(
          <span key={i} style={{textAlign:'center',color: i<reveal?'var(--gold)':'#3a3a48',transition:'color .1s'}}>
            {i<reveal? c.pt : c.ct}
          </span>
        ))}
      </div>
      <div style={{marginTop:14,height:3,background:'#1f1f28',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${pct*100}%`,background:'var(--gold)',transition:'width .1s'}}/>
      </div>
      <div className="serif italic" style={{fontStyle:'italic',fontSize:14,color:'#9a9aa3',marginTop:10,textAlign:'center'}}>
        {t('密钥派生 · 椭圆曲线解封 · 字段重组中…','Key derivation · ECC unsealing · field reassembly…')}
      </div>
    </div>
  );
}

function RevealedRecord({target, t}){
  return (
    <div style={{padding:'28px 32px',border:'1px solid var(--green)',background:'rgba(31,111,62,.06)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:18}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--green)'}}>✓ REVEALED · DECRYPTED FROM audit_ct</span>
        <span className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'#5a5a63'}}>FORENSIC SNAPSHOT</span>
      </div>
      <div className="serif" style={{fontStyle:'italic',fontSize:48,fontWeight:300,color:'#f4f1ea',letterSpacing:'-.025em',lineHeight:1.05,marginBottom:24}}>
        {target.amount.toLocaleString()} <span style={{color:'var(--accent)'}}>{target.assetA}</span> &nbsp;⇌&nbsp; {(target.amount/210).toFixed(2)} <span style={{color:'var(--accent)'}}>{target.assetB}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:1,background:'var(--d-line)',border:'1px solid var(--d-line-2)'}}>
        <Field label={t('甲方 (initiator)','PARTY A · INITIATOR')} value={target.initiator}/>
        <Field label={t('乙方 (counterparty)','PARTY B · COUNTERPARTY')} value={target.counterparty}/>
        <Field label={t('结算时间 (UTC)','SETTLED AT · UTC')} value={new Date(target.ts).toISOString().replace('T',' ').slice(0,19)}/>
        <Field label="commitment_hash" value={target.hash}/>
        <Field label="execute_tx" value={target.execTx}/>
        <Field label="block_height" value={target.block.toLocaleString()}/>
      </div>

      <div style={{marginTop:18,padding:'14px 16px',border:'1px dashed var(--green)',display:'flex',alignItems:'center',gap:14}}>
        <span style={{fontSize:18}}>✍︎</span>
        <span style={{fontSize:12,color:'#9a9aa3',lineHeight:1.45}}>
          {t('一条解密记录已写入审计日志，时间戳为 ','A decryption record has been forcibly written to the audit log at ')}
          <span className="mono" style={{color:'var(--gold)'}}>{new Date().toISOString().slice(11,19)} UTC</span>
          {t('。该记录不可删除。','. The record cannot be deleted.')}
        </span>
      </div>
    </div>
  );
}

function Field({label, value}){
  return (
    <div style={{padding:'14px 18px',background:'var(--d-bg)'}}>
      <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'#5a5a63',marginBottom:5}}>{label}</div>
      <div className="mono" style={{fontSize:13,color:'#f4f1ea',wordBreak:'break-all',letterSpacing:'.04em'}}>{value}</div>
    </div>
  );
}

window.RegulatorChamber = RegulatorChamber;
