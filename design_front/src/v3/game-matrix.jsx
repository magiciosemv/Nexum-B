// Game Theory matrix — interactive, hover to highlight outcome
const { useState: gS } = React;

function GameMatrix({ lang }){
  const t = (zh,en)=> lang==='zh'?zh:en;
  const [hover, setHover] = gS(null); // 'aa','an','na','nn'
  const cells = {
    aa: { title:t('结算成功','SETTLED'), tone:'green',  body:t('双方各得所需。CommitSlot 关闭。','Both get what they bargained for. Slot closes.') },
    an: { title:t('B 错失交易','B walks'), tone:'gold',  body:t('60s 后 A 调用 cancel_initiate，无损解锁。','After 60s, A cancels — unscathed.') },
    na: { title:t('B 锁死攻击','B grief'), tone:'danger',body:t('30s 后任一方调用 cancel_mutual，双方解锁。B 仅损失 Gas。','30s later either side cancels. B forfeits only gas.') },
    nn: { title:t('未发生','no protocol','No protocol'), tone:'ink', body:t('双方未上链，回到链下协商失败。','Nothing on chain. Pure off-chain failure.') },
  };
  const Cell = ({k, label, sub})=>{
    const c = cells[k];
    const tones = {green:'var(--green)',gold:'var(--gold)',danger:'var(--danger)',ink:'var(--ink-3)'};
    const tc = tones[c.tone];
    return (
      <button onMouseEnter={()=>setHover(k)} onMouseLeave={()=>setHover(null)}
        style={{padding:'24px 22px',border:`1px solid ${hover===k?tc:'var(--line-2)'}`,background:hover===k?'var(--bg-2)':'var(--bg)',transition:'all .2s',textAlign:'left',cursor:'default',display:'flex',flexDirection:'column',gap:8,minHeight:160}}>
        <span className="mono" style={{fontSize:9.5,letterSpacing:'.18em',color:'var(--ink-3)'}}>{label}</span>
        <span className="serif italic" style={{fontStyle:'italic',fontSize:24,color:tc,lineHeight:1,letterSpacing:'-.01em'}}>{c.title}</span>
        <span style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.5,marginTop:4}}>{c.body}</span>
      </button>
    );
  };
  return (
    <section style={{padding:'80px 48px',background:'var(--bg-2)',borderTop:'1px solid var(--ink)'}}>
      <div style={{maxWidth:1500,margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:48,marginBottom:32}}>
          <div>
            <div className="mono" style={{fontSize:10.5,letterSpacing:'.28em',color:'var(--ink-3)'}}>FIG. 04 — GAME THEORY</div>
            <h2 className="serif" style={{margin:'10px 0 0',fontSize:54,fontWeight:300,letterSpacing:'-.025em',lineHeight:1}}>
              {t('博弈，矩阵化。','Game, in a matrix.')}
            </h2>
          </div>
          <div className="serif italic" style={{fontStyle:'italic',fontSize:18,color:'var(--ink-2)',lineHeight:1.55,maxWidth:680,paddingTop:8}}>
            {t('每一格都是一个理性博弈结局。把光标放在格子上，看协议在每个分支里做了什么。','Each cell is a rational game outcome. Hover any cell to see what the protocol does in that branch.')}
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'140px 1fr 1fr',gap:0}}>
          <div/>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--ink)',textAlign:'center'}}>
            <span className="mono" style={{fontSize:11,letterSpacing:'.2em',color:'var(--ink)'}}>B · ACCEPT (60s)</span>
          </div>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--ink)',textAlign:'center'}}>
            <span className="mono" style={{fontSize:11,letterSpacing:'.2em',color:'var(--ink-3)'}}>B · NO ACCEPT</span>
          </div>

          <div style={{padding:'24px 20px',borderRight:'1px solid var(--ink)',display:'flex',alignItems:'center'}}>
            <span className="mono" style={{fontSize:11,letterSpacing:'.2em',color:'var(--ink)'}}>A · INITIATE</span>
          </div>
          <Cell k="aa" label="A · INITIATE × B · ACCEPT" sub="happy path"/>
          <Cell k="an" label="A · INITIATE × B · IGNORE" sub="initiator unlocks"/>

          <div style={{padding:'24px 20px',borderRight:'1px solid var(--ink)',display:'flex',alignItems:'center'}}>
            <span className="mono" style={{fontSize:11,letterSpacing:'.2em',color:'var(--ink-3)'}}>A · NO INITIATE</span>
          </div>
          <Cell k="na" label="(post-accept grief variant)" sub="cancel_mutual"/>
          <Cell k="nn" label="—"/>
        </div>
      </div>
    </section>
  );
}

window.GameMatrix = GameMatrix;
