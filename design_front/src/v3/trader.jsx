// Trader Terminal — the working settlement console
// 7-state machine: idle → drafting → committing → waiting_accept → both_pending → proving → executing → settled
const { useState: trS, useEffect: trE, useRef: trR, useMemo: trM, useCallback: trC } = React;

const STATES = ['idle','drafting','committing','waiting_accept','both_pending','proving','executing','settled'];
const STATE_LABEL = {
  idle:'IDLE', drafting:'DRAFTING', committing:'COMMITTING',
  waiting_accept:'WAITING_ACCEPT', both_pending:'BOTH_PENDING',
  proving:'PROVING', executing:'EXECUTING', settled:'SETTLED',
};

function rand(){ return Math.random().toString(16).slice(2,10); }
function shortHash(){ return `${rand()}${rand()}${rand()}${rand()}`; }
function shortAddr(){ const c='0123456789abcdef'; let s=''; for(let i=0;i<8;i++) s+=c[Math.floor(Math.random()*16)]; return `${s.slice(0,4)}…${s.slice(4,8)}`; }

function TraderTerminal({ onExit, lang, setLang, onAuditStash }){
  const t=(zh,en)=>lang==='zh'?zh:en;

  // form state
  const [amount, setAmount] = trS('500000');
  const [assetA, setAssetA] = trS('USDC');
  const [assetB, setAssetB] = trS('SOL');
  const [counterparty, setCounterparty] = trS('2vBaPq8wzL9o');
  const [expiry, setExpiry] = trS(60);

  // machine state
  const [state, setState] = trS('idle');
  const [log, setLog] = trS([]);
  const [meta, setMeta] = trS({}); // hash, txs, timestamps
  const [acceptCountdown, setAcceptCountdown] = trS(0);
  const [execCountdown, setExecCountdown] = trS(0);
  const [proofPctA, setProofPctA] = trS(0);
  const [proofPctB, setProofPctB] = trS(0);

  const logRef = trR(null);
  const append = trC((kind, line, payload)=>{
    setLog(l=>[...l, {ts:new Date().toLocaleTimeString('en-GB'), kind, line, payload}]);
  },[]);
  trE(()=>{ if(logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; },[log]);

  // workflow ----------------------------------------------------
  const startCommit = ()=>{
    if(state!=='idle' && state!=='settled') return;
    setLog([]); setMeta({}); setProofPctA(0); setProofPctB(0);
    setState('drafting');
    append('info', t('计算承诺哈希中… SHA-256(120 字节输入)','Computing commitment hash… SHA-256(120-byte input)'));
    const nonce = '0x' + rand() + rand();
    setTimeout(()=>{
      const hash = '0x' + shortHash();
      setMeta(m=>({...m, hash, nonce}));
      append('ok', `commitment_hash = ${hash}`, {hash});
      append('info', `nonce = ${nonce}`);
      append('info', t('提交 initiate_commit 到 Solana…','Submitting initiate_commit to Solana…'));
      setState('committing');
      setTimeout(()=>{
        const tx = 'TX-' + rand().toUpperCase();
        const slot = 'CSLOT-' + rand().toUpperCase();
        setMeta(m=>({...m, initTx:tx, slotId:slot, slotSizeBytes:204, cuInit:50_000}));
        append('tx', `initiate_commit · CU 50,034`, {tx, slot});
        append('ok', `commit_slot 已开仓 (204B, ~0.0014 SOL 租金)`, {slot});
        append('info', t(`等待对手方 ${counterparty} 接受…`,`Waiting for ${counterparty} to accept…`));
        setState('waiting_accept');
        setAcceptCountdown(expiry);
      }, 700);
    }, 900);
  };

  // accept countdown
  trE(()=>{
    if(state!=='waiting_accept') return;
    if(acceptCountdown<=0){ append('warn', t('意向超时 - 调用 cancel_initiate (无损解锁)','Initiate timeout - calling cancel_initiate (loss-free release)')); setState('idle'); return; }
    const id=setInterval(()=>setAcceptCountdown(x=>x-0.1),100);
    return ()=>clearInterval(id);
  },[state,acceptCountdown]);

  const simulateAccept = ()=>{
    if(state!=='waiting_accept') return;
    append('rx', t(`对手方 ${counterparty} 验证哈希通过 ✓`,`Counterparty ${counterparty} verified hash ✓`));
    append('tx', `accept_commit · CU 49,712`);
    append('ok', t('双方余额已对称冻结 → BOTH_PENDING','Both ledgers frozen symmetrically → BOTH_PENDING'));
    setMeta(m=>({...m, acceptTx:'TX-' + rand().toUpperCase(), cuAccept:49_712}));
    setState('both_pending');
    setExecCountdown(30);
    setTimeout(()=>{
      append('info', t('开始并行生成 Groth16 证明 (12,778 约束)','Beginning parallel Groth16 proof generation (12,778 constraints)'));
      setState('proving');
    }, 600);
  };

  // exec countdown
  trE(()=>{
    if(state!=='both_pending' && state!=='proving' && state!=='executing') return;
    if(execCountdown<=0){
      if(state!=='executing'){
        append('warn', t('执行窗口超时 - cancel_mutual','Execute window timeout - cancel_mutual'));
        setState('idle');
      }
      return;
    }
    const id=setInterval(()=>setExecCountdown(x=>x-0.1),100);
    return ()=>clearInterval(id);
  },[state,execCountdown]);

  // proof generation animation
  trE(()=>{
    if(state!=='proving') return;
    let pa=0, pb=0;
    const id=setInterval(()=>{
      pa = Math.min(1, pa + 0.018 + Math.random()*0.012);
      pb = Math.min(1, pb + 0.016 + Math.random()*0.012);
      setProofPctA(pa);
      setProofPctB(pb);
      if(pa===1 && pb===1){
        clearInterval(id);
        append('ok', t('proof_a 生成完毕 · 3.7s','proof_a generated · 3.7s'));
        append('ok', t('proof_b 生成完毕 · 3.9s','proof_b generated · 3.9s'));
        append('info', t('提交 execute_settle (双证明)…','Submitting execute_settle (dual proof)…'));
        setState('executing');
        setTimeout(()=>{
          const tx = 'TX-' + rand().toUpperCase();
          const settlementId = 'SETL-' + rand().toUpperCase();
          append('tx', `execute_settle · CU 219,418`, {tx});
          append('info', `· CPI 验 proof_a (~64K CU) ✓`);
          append('info', `· CPI 验 proof_b (~64K CU) ✓`);
          append('info', `· 承诺哈希重算与匹配 ✓`);
          append('info', `· 双方账本原子更新 ✓`);
          append('ok', `Settlement Record ${settlementId} 永久存档`, {settlementId});
          append('ok', t('CommitSlot 关闭 · 租金返还 0.0014 SOL','CommitSlot closed · rent refunded 0.0014 SOL'));
          setMeta(m=>({...m, execTx:tx, settlementId, cuExec:219_418}));
          if(onAuditStash) onAuditStash({
            settlementId, hash: meta.hash || ('0x'+shortHash()),
            initiator: '7xKp9wmNqR', counterparty,
            assetA, assetB, amount: parseFloat(amount),
            ts: new Date().toISOString(),
            initTx: meta.initTx, acceptTx: meta.acceptTx, execTx: tx,
            block: 312847291 + Math.floor(Math.random()*1000),
          });
          setState('settled');
        }, 800);
      }
    }, 80);
    return ()=>clearInterval(id);
  },[state]);

  const reset = ()=>{ setState('idle'); setLog([]); setMeta({}); setProofPctA(0); setProofPctB(0); setAcceptCountdown(0); setExecCountdown(0); };

  const isRunning = state!=='idle' && state!=='settled';

  return (
    <div className="dark" style={{minHeight:'100vh',display:'flex',flexDirection:'column'}}>
      {/* top rail */}
      <div style={{padding:'14px 36px',display:'flex',alignItems:'center',gap:20,borderBottom:'1px solid var(--d-line-2)',background:'var(--d-bg-2)'}}>
        <NexumSeal size={28} dark/>
        <Wordmark dark sub="TRADER · TERMINAL"/>
        <span style={{width:1,height:14,background:'var(--d-line-2)'}}/>
        <span className="mono" style={{fontSize:10,letterSpacing:'.2em',color:'var(--accent)'}}>● TRADER · 7xKp9wmNqR</span>
        <div style={{flex:1}}/>
        <Slot dark/>
        <span style={{width:1,height:14,background:'var(--d-line-2)'}}/>
        <button onClick={()=>setLang(lang==='zh'?'en':'zh')} className="mono" style={{fontSize:11,letterSpacing:'.15em',color:'#f4f1ea'}}>{lang==='zh'?'EN':'中'}</button>
        <button onClick={onExit} className="btn" style={{padding:'8px 14px',fontSize:10,borderColor:'#f4f1ea',color:'#f4f1ea'}}>{t('登出','SIGN OUT')}</button>
      </div>

      {/* state strip */}
      <StateStrip state={state} t={t}/>

      {/* main 3-column */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'380px 1fr 460px',gap:1,background:'var(--d-line)',minHeight:0}}>
        {/* LEFT — order ticket */}
        <div style={{background:'var(--d-bg)',padding:'24px 26px',overflowY:'auto'}}>
          <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'#9a9aa3',marginBottom:14}}>I · ORDER TICKET</div>
          <div className="serif" style={{fontStyle:'italic',fontSize:24,color:'#f4f1ea',marginBottom:24,letterSpacing:'-.01em',lineHeight:1.2}}>
            {t('协商条款，提交意向。','Draft terms, submit intent.')}
          </div>

          <FormField label={t('甲方付出资产','ASSET A — YOU PAY')} disabled={isRunning}>
            <div style={{display:'flex',gap:8}}>
              <input value={amount} onChange={e=>setAmount(e.target.value)} disabled={isRunning} style={{flex:1,...inpStyle}}/>
              <select value={assetA} onChange={e=>setAssetA(e.target.value)} disabled={isRunning} style={selStyle}>
                {['USDC','USDT','wBTC','SOL'].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
          </FormField>

          <FormField label={t('乙方付出资产','ASSET B — YOU RECEIVE')} disabled={isRunning}>
            <div style={{display:'flex',gap:8}}>
              <input value={(parseFloat(amount)/210).toFixed(2)} disabled style={{flex:1,...inpStyle, opacity:.6}}/>
              <select value={assetB} onChange={e=>setAssetB(e.target.value)} disabled={isRunning} style={selStyle}>
                {['SOL','wBTC','USDC','USDT'].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
            <div className="mono" style={{fontSize:9,letterSpacing:'.12em',color:'#5a5a63',marginTop:6}}>{t('参考价 (链下协商) · 1 SOL = 210 USDC','reference (off-chain agreed) · 1 SOL = 210 USDC')}</div>
          </FormField>

          <FormField label={t('对手方公钥','COUNTERPARTY PUBKEY')} disabled={isRunning}>
            <input value={counterparty} onChange={e=>setCounterparty(e.target.value)} disabled={isRunning} style={inpStyle}/>
          </FormField>

          <FormField label={t('意向有效期 (秒)','EXPIRY (SECONDS)')} disabled={isRunning}>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="range" min="30" max="60" value={expiry} onChange={e=>setExpiry(+e.target.value)} disabled={isRunning} style={{flex:1}}/>
              <span className="mono" style={{fontSize:14,color:'var(--accent)',width:40,textAlign:'right'}}>{expiry}s</span>
            </div>
          </FormField>

          <div style={{marginTop:24,padding:'14px 16px',border:'1px solid var(--d-line-2)',background:'var(--d-bg-3)'}}>
            <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'#5a5a63',marginBottom:8}}>EST. COSTS</div>
            <Row k={t('CommitSlot 租金','slot rent')} v="0.0014 SOL" sub={t('execute 后回收','refunded on exec')}/>
            <Row k="initiate gas" v="~0.0005 SOL"/>
            <Row k="execute gas" v="~0.0022 SOL"/>
            <Row k={t('总计预估','total est.')} v="~0.0027 SOL" highlight/>
          </div>

          <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>
            {state==='idle' || state==='settled' ? (
              <button onClick={startCommit} className="btn accent lg" style={{width:'100%',justifyContent:'center'}}>
                {state==='settled'? t('▶ 新建意向','▶ NEW COMMITMENT') : t('▶ 提交承诺','▶ INITIATE COMMIT')}
              </button>
            ) : (
              <button onClick={reset} className="btn lg" style={{width:'100%',justifyContent:'center',borderColor:'var(--danger)',color:'var(--danger)'}}>
                ■ {t('终止 / 取消','ABORT / CANCEL')}
              </button>
            )}
          </div>
        </div>

        {/* CENTER — stage */}
        <div style={{background:'var(--d-bg-2)',padding:'24px 32px',overflowY:'auto'}}>
          <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'#9a9aa3',marginBottom:14}}>II · SETTLEMENT STAGE</div>

          <CenterStage
            state={state}
            acceptCountdown={acceptCountdown}
            execCountdown={execCountdown}
            proofPctA={proofPctA}
            proofPctB={proofPctB}
            meta={meta}
            amount={amount} assetA={assetA} assetB={assetB}
            counterparty={counterparty}
            expiry={expiry}
            t={t}
          />

          {state==='waiting_accept' && (
            <div style={{marginTop:24,padding:'18px 20px',border:'1px dashed var(--gold)',background:'rgba(201,150,47,.08)'}}>
              <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--gold)',marginBottom:8}}>DEMO CONTROL</div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:14}}>
                <span style={{color:'#9a9aa3',fontSize:13}}>{t('在真实环境，对手方会通过自己的终端 accept。这里你可以模拟该动作:','In production, the counterparty would accept via their own terminal. Here you may simulate that action:')}</span>
                <button onClick={simulateAccept} className="btn accent" style={{whiteSpace:'nowrap'}}>{t('▶ 模拟 B 接受','▶ SIM B ACCEPT')}</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — terminal log */}
        <div style={{background:'var(--d-bg)',display:'flex',flexDirection:'column',minHeight:0}}>
          <div style={{padding:'18px 22px 12px',borderBottom:'1px solid var(--d-line-2)',display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
            <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'#9a9aa3'}}>III · CONSOLE</div>
            <div className="mono" style={{fontSize:9,letterSpacing:'.18em',color:'#5a5a63'}}>RPC · solana.devnet</div>
          </div>
          <div ref={logRef} style={{flex:1,overflowY:'auto',padding:'14px 22px',fontFamily:'JetBrains Mono, monospace',fontSize:11.5,lineHeight:1.65}}>
            {log.length===0 && (
              <div style={{color:'#3a3a48',fontStyle:'italic',padding:'40px 0',textAlign:'center'}}>
                <div style={{fontFamily:'Fraunces, serif',fontSize:18,marginBottom:8}}>console idle</div>
                <div style={{fontSize:10,letterSpacing:'.15em'}}>{t('提交意向后日志将出现于此','log will appear here once commit is initiated')}</div>
              </div>
            )}
            {log.map((l,i)=> <LogLine key={i} entry={l}/>)}
            {isRunning && <div style={{color:'#5a5a63'}}>$ <span className="cursor"/></div>}
          </div>
          {state==='settled' && meta.settlementId && (
            <div style={{padding:'14px 22px',borderTop:'1px solid var(--green)',background:'rgba(31,111,62,.1)'}}>
              <div className="mono" style={{fontSize:9,letterSpacing:'.2em',color:'var(--green)',marginBottom:6}}>✓ SETTLED · COPY THESE FOR AUDIT</div>
              <CopyRow k="settlement_id" v={meta.settlementId}/>
              <CopyRow k="commitment_hash" v={meta.hash}/>
              <CopyRow k="execute_tx" v={meta.execTx}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inpStyle = {background:'var(--d-bg-3)',border:'1px solid var(--d-line-2)',color:'#f4f1ea',padding:'10px 12px',fontFamily:'JetBrains Mono, monospace',fontSize:13,outline:'none'};
const selStyle = {...inpStyle, cursor:'pointer'};

function FormField({label, children, disabled}){
  return (
    <div style={{marginBottom:16,opacity:disabled?.6:1}}>
      <div className="mono" style={{fontSize:9,letterSpacing:'.22em',color:'#9a9aa3',marginBottom:6}}>{label}</div>
      {children}
    </div>
  );
}

function Row({k,v,sub,highlight}){
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'4px 0',borderBottom: '1px dotted var(--d-line)'}}>
      <span className="mono" style={{fontSize:10,color:highlight?'#f4f1ea':'#9a9aa3',letterSpacing:'.08em'}}>{k}</span>
      <span className="mono" style={{fontSize:11,color:highlight?'var(--accent)':'#f4f1ea',letterSpacing:'.05em'}}>{v}{sub && <span style={{color:'#5a5a63',fontSize:9,marginLeft:6}}>{sub}</span>}</span>
    </div>
  );
}

function CopyRow({k,v}){
  const copy=()=>navigator.clipboard?.writeText(v);
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'3px 0'}}>
      <span className="mono" style={{fontSize:9,color:'#9a9aa3',letterSpacing:'.1em'}}>{k}</span>
      <button onClick={copy} className="mono" style={{fontSize:10,color:'var(--green)',letterSpacing:'.05em'}}>{v} ⧉</button>
    </div>
  );
}

function LogLine({entry}){
  const colors={info:'#9a9aa3', ok:'var(--green)', tx:'var(--accent)', warn:'var(--gold)', rx:'#c9962f', err:'var(--danger)'};
  const sigil={info:'·', ok:'✓', tx:'◆', warn:'!', rx:'←', err:'×'};
  return (
    <div style={{display:'grid',gridTemplateColumns:'62px 14px 1fr',gap:6,padding:'2px 0'}}>
      <span style={{color:'#3a3a48'}}>{entry.ts}</span>
      <span style={{color:colors[entry.kind]||'#9a9aa3'}}>{sigil[entry.kind]||'·'}</span>
      <span style={{color:'#dadbde',wordBreak:'break-all'}}>{entry.line}</span>
    </div>
  );
}

// State strip ----
function StateStrip({state, t}){
  const seq = ['idle','committing','waiting_accept','both_pending','proving','executing','settled'];
  const cur = seq.indexOf(state==='drafting'?'committing':state);
  return (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${seq.length}, 1fr)`,gap:1,background:'var(--d-line)',borderBottom:'1px solid var(--d-line-2)'}}>
      {seq.map((s,i)=>{
        const active = i===cur;
        const done = i<cur || state==='settled';
        const accent = s==='settled' ? 'var(--green)' : 'var(--accent)';
        const c = active?accent: done?'#9a9aa3':'#3a3a48';
        return (
          <div key={s} style={{background:'var(--d-bg)',padding:'10px 14px',position:'relative',overflow:'hidden'}}>
            {active && <span style={{position:'absolute',inset:0,background:`repeating-linear-gradient(45deg, ${accent} 0 8px, transparent 8px 16px)`,opacity:.06}}/>}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span className="mono" style={{fontSize:9,letterSpacing:'.15em',color:c}}>{String(i+1).padStart(2,'0')}</span>
              <span className="mono" style={{fontSize:10,letterSpacing:'.12em',color:c,fontWeight:active?600:400}}>{STATE_LABEL[s] || s.toUpperCase()}</span>
              {active && <span style={{flex:1,textAlign:'right',color:accent,animation:'ink-pulse 1.4s infinite',fontSize:10}}>●</span>}
              {done && !active && <span style={{flex:1,textAlign:'right',color:'#9a9aa3',fontSize:10}}>✓</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Center stage — visual representation of current state ---------
function CenterStage({state, acceptCountdown, execCountdown, proofPctA, proofPctB, meta, amount, assetA, assetB, counterparty, expiry, t}){
  // Always show the two parties as rails
  const aLocked = ['waiting_accept','both_pending','proving','executing'].includes(state);
  const bLocked = ['both_pending','proving','executing'].includes(state);

  return (
    <div>
      {/* Two parties + flow */}
      <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:24,alignItems:'center',marginBottom:32}}>
        <PartyBox label="A · YOU" addr="7xKp9wmNqR" assetLabel={`${parseFloat(amount).toLocaleString()} ${assetA}`} locked={aLocked} done={state==='settled'} side="left"/>
        <FlowConnector state={state}/>
        <PartyBox label="B · COUNTERPARTY" addr={counterparty} assetLabel={`${(parseFloat(amount)/210).toFixed(2)} ${assetB}`} locked={bLocked} done={state==='settled'} side="right"/>
      </div>

      {/* state-specific panel */}
      {state==='idle' && <StagePlaceholder t={t}/>}
      {state==='drafting' && <StageHashing t={t}/>}
      {state==='committing' && <StageCommitting hash={meta.hash} t={t}/>}
      {state==='waiting_accept' && <StageWaiting hash={meta.hash} slot={meta.slotId} countdown={acceptCountdown} expiry={expiry} t={t}/>}
      {state==='both_pending' && <StageBothPending countdown={execCountdown} t={t}/>}
      {state==='proving' && <StageProving pa={proofPctA} pb={proofPctB} countdown={execCountdown} t={t}/>}
      {state==='executing' && <StageExecuting t={t}/>}
      {state==='settled' && <StageSettled meta={meta} t={t}/>}
    </div>
  );
}

function PartyBox({label, addr, assetLabel, locked, done, side}){
  const c = done?'var(--green)': locked?'var(--accent)':'#5a5a63';
  return (
    <div style={{padding:'18px 22px',border:`1px solid ${locked||done?c:'var(--d-line-2)'}`,background:locked?'rgba(226,80,43,.05)':done?'rgba(31,111,62,.08)':'var(--d-bg-3)',transition:'all .35s'}}>
      <div className="mono" style={{fontSize:9,letterSpacing:'.22em',color:c,marginBottom:6}}>{locked?'● ':'○ '}{label}</div>
      <div className="mono" style={{fontSize:11,color:'#9a9aa3',marginBottom:10}}>{addr}</div>
      <div className="serif" style={{fontStyle:'italic',fontSize:30,fontWeight:300,color:'#f4f1ea',letterSpacing:'-.02em',lineHeight:1}}>{assetLabel}</div>
      <div style={{marginTop:10,height:3,background:'#1f1f28',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:`repeating-linear-gradient(45deg, ${c} 0 5px, transparent 5px 10px)`,opacity:locked||done?.7:0,transition:'opacity .4s'}}/>
      </div>
    </div>
  );
}

function FlowConnector({state}){
  const symbol = {idle:'· ·',drafting:'~ ~',committing:'→',waiting_accept:'◇',both_pending:'⊘ ⊘',proving:'∿ ∿',executing:'⇌',settled:'✓'}[state] || '·';
  const c = state==='settled'?'var(--green)': ['waiting_accept','both_pending','proving','executing'].includes(state)?'var(--accent)':'#3a3a48';
  return (
    <div style={{minWidth:80,textAlign:'center'}}>
      <div className="serif" style={{fontStyle:'italic',fontSize:32,color:c,letterSpacing:'.1em',transition:'color .4s'}}>{symbol}</div>
    </div>
  );
}

function StagePlaceholder({t}){
  return (
    <div style={{padding:'80px 0',textAlign:'center',border:'1px dashed var(--d-line-2)',color:'#3a3a48'}}>
      <div className="serif italic" style={{fontStyle:'italic',fontSize:24,color:'#5a5a63',letterSpacing:'-.01em'}}>{t('填写左侧订单，提交意向。','Draft the order on the left and submit.')}</div>
      <div className="mono" style={{fontSize:10,letterSpacing:'.18em',color:'#3a3a48',marginTop:10}}>STATE · IDLE</div>
    </div>
  );
}

function StageHashing({t}){
  return (
    <div style={{padding:'40px 30px',border:'1px solid var(--accent)',background:'rgba(226,80,43,.05)',textAlign:'center'}}>
      <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)',marginBottom:16}}>SHA-256 · 120 BYTE INPUT</div>
      <div className="serif italic" style={{fontStyle:'italic',fontSize:28,color:'#f4f1ea',letterSpacing:'-.01em'}}>{t('正在计算承诺哈希','Hashing commitment')}<span className="cursor"/></div>
    </div>
  );
}

function StageCommitting({hash, t}){
  return (
    <div style={{padding:'30px',border:'1px solid var(--accent)',background:'rgba(226,80,43,.05)'}}>
      <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)',marginBottom:12}}>BROADCASTING · initiate_commit</div>
      <div className="mono" style={{fontSize:13,color:'#f4f1ea',wordBreak:'break-all',background:'var(--d-bg-3)',padding:14,border:'1px dashed var(--d-line-2)'}}>
        {hash}
      </div>
      <div className="mono" style={{fontSize:10,color:'#5a5a63',letterSpacing:'.15em',marginTop:10}}>· landing on Solana ·</div>
    </div>
  );
}

function StageWaiting({hash, slot, countdown, expiry, t}){
  const pct = countdown / expiry;
  const danger = pct < 0.3;
  return (
    <div style={{padding:'30px',border:`1px solid ${danger?'var(--danger)':'var(--gold)'}`,background:'rgba(201,150,47,.06)',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,left:0,height:3,width:`${pct*100}%`,background:danger?'var(--danger)':'var(--gold)',transition:'all .1s'}}/>
      <div style={{display:'flex',alignItems:'center',gap:32}}>
        <CountdownRing duration={expiry} running={true} size={140} label={t('意向有效','INIT EXPIRES')} sublabel="ON-CHAIN"/>
        <div style={{flex:1}}>
          <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:danger?'var(--danger)':'var(--gold)',marginBottom:8}}>WAITING_ACCEPT</div>
          <div className="serif" style={{fontStyle:'italic',fontSize:24,color:'#f4f1ea',marginBottom:14,letterSpacing:'-.01em'}}>
            {t('对手方正在验证哈希…','Counterparty verifying hash…')}
          </div>
          <div style={{fontSize:12.5,color:'#9a9aa3',lineHeight:1.55}}>
            {t('B 已通过链下信道收到明文金额。本地重算 SHA-256 并与链上 commit_slot.commitment_hash 比对。一旦通过，即可提交 accept_commit。','B received the plaintext amount via off-chain channel, recomputes SHA-256 locally, and compares to the on-chain commit_slot.commitment_hash. Once matched, it may submit accept_commit.')}
          </div>
          <div className="mono" style={{fontSize:10,marginTop:14,color:'#5a5a63',letterSpacing:'.1em'}}>
            slot · {slot || '—'}<br/>hash · {hash || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

function StageBothPending({countdown,t}){
  return (
    <div style={{padding:'30px',border:'1px solid var(--accent)',background:'rgba(226,80,43,.08)',display:'flex',gap:32,alignItems:'center'}}>
      <CountdownRing duration={30} running={true} size={140} label={t('执行窗口','EXEC WINDOW')} sublabel="DUAL-LOCK"/>
      <div style={{flex:1}}>
        <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)',marginBottom:8}}>BOTH_PENDING · SYMMETRIC LOCK</div>
        <div className="serif" style={{fontStyle:'italic',fontSize:28,color:'#f4f1ea',letterSpacing:'-.01em',lineHeight:1.15}}>
          {t('双方余额已对称冻结。','Both balances are frozen, symmetrically.')}
        </div>
        <div style={{fontSize:13,color:'#9a9aa3',marginTop:8,lineHeight:1.5}}>
          {t('期权窗口归零。30 秒内必须提交双证明，否则任一方可调用 cancel_mutual 解锁。','The option window is zero. Within 30s both proofs must arrive, or either side may call cancel_mutual.')}
        </div>
      </div>
    </div>
  );
}

function StageProving({pa, pb, countdown, t}){
  return (
    <div style={{padding:'24px 26px',border:'1px solid var(--accent)',background:'var(--d-bg-3)'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--accent)'}}>PROVING · GROTH16 · BN254</span>
        <span className="mono" style={{fontSize:10,letterSpacing:'.15em',color:'var(--gold)'}}>EXEC IN {countdown.toFixed(1)}s</span>
      </div>
      <ProverGrid party="A" label="proof_a · 12,778 cnstr" pct={pa}/>
      <div style={{height:10}}/>
      <ProverGrid party="B" label="proof_b · 12,778 cnstr" pct={pb}/>
    </div>
  );
}

function ProverGrid({party, label, pct}){
  const COLS=48, ROWS=6, TOT=COLS*ROWS;
  const lit = Math.floor(TOT*pct);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
        <span className="mono" style={{fontSize:10,letterSpacing:'.18em',color:'var(--accent)'}}>● PARTY {party}</span>
        <span className="mono" style={{fontSize:9,color:'#5a5a63'}}>{label}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${COLS}, 1fr)`,gap:2}}>
        {Array.from({length:TOT}).map((_,i)=>(
          <span key={i} style={{height:4,background: i<lit?'var(--accent)':'#1f1f28',justifySelf:'stretch',transition:'background .1s'}}/>
        ))}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
        <span className="mono" style={{fontSize:9,letterSpacing:'.12em',color:'#5a5a63'}}>{Math.floor(12778*pct).toLocaleString()} / 12,778</span>
        <span className="mono" style={{fontSize:9,letterSpacing:'.12em',color:'var(--accent)'}}>{(pct*4).toFixed(1)}s</span>
      </div>
    </div>
  );
}

function StageExecuting({t}){
  return (
    <div style={{padding:'30px',border:'1px solid var(--green)',background:'rgba(31,111,62,.1)',textAlign:'center'}}>
      <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--green)',marginBottom:14}}>execute_settle · 219K CU</div>
      <div className="serif italic" style={{fontStyle:'italic',fontSize:28,color:'#f4f1ea',letterSpacing:'-.01em'}}>{t('双证落定…','Both proofs landing…')}<span className="cursor"/></div>
    </div>
  );
}

function StageSettled({meta, t}){
  return (
    <div style={{padding:'24px 28px',border:'1px solid var(--green)',background:'rgba(31,111,62,.08)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14}}>
        <div className="mono" style={{fontSize:10,letterSpacing:'.22em',color:'var(--green)'}}>✓ SETTLED · ATOMIC · IRREVERSIBLE</div>
        <div className="mono" style={{fontSize:10,color:'#5a5a63'}}>BLOCK 312,847,{(Math.random()*999|0).toString().padStart(3,'0')}</div>
      </div>
      <div className="serif" style={{fontStyle:'italic',fontSize:36,color:'#f4f1ea',letterSpacing:'-.025em',lineHeight:1.1,marginBottom:16}}>{t('结算完成。','Settled.')}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,fontSize:11.5,fontFamily:'JetBrains Mono, monospace',color:'#9a9aa3'}}>
        <div><div style={{color:'#5a5a63',fontSize:9,letterSpacing:'.18em',marginBottom:3}}>SETTLEMENT_ID</div><div style={{color:'#f4f1ea'}}>{meta.settlementId}</div></div>
        <div><div style={{color:'#5a5a63',fontSize:9,letterSpacing:'.18em',marginBottom:3}}>EXECUTE_TX</div><div style={{color:'#f4f1ea'}}>{meta.execTx}</div></div>
        <div><div style={{color:'#5a5a63',fontSize:9,letterSpacing:'.18em',marginBottom:3}}>COMMITMENT</div><div style={{color:'#f4f1ea'}}>{meta.hash}</div></div>
        <div><div style={{color:'#5a5a63',fontSize:9,letterSpacing:'.18em',marginBottom:3}}>TOTAL CU</div><div style={{color:'var(--green)'}}>318,464</div></div>
      </div>
    </div>
  );
}

window.TraderTerminal = TraderTerminal;
