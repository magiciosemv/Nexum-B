// Bilingual copy table. All user-facing strings flow through t().
const I18N = {
  brand: { zh: "Nexum 协议", en: "Nexum Protocol" },
  tagline: { zh: "零明文结算 · 零信任 · 全程审计", en: "Zero-text settlement. Zero trust. Full audit." },

  // nav
  nav_product: { zh: "产品", en: "Product" },
  nav_docs: { zh: "文档", en: "Docs" },
  nav_circuit: { zh: "电路", en: "Circuit" },
  nav_github: { zh: "GitHub", en: "GitHub" },
  launch_app: { zh: "进入终端", en: "Launch app" },

  // landing
  hero_eyebrow: { zh: "Colosseum Frontier · ZK 赛道 · 黑客松 MVP v1.0", en: "Colosseum Frontier · ZK Track · Hackathon MVP v1.0" },
  hero_h1: { zh: "零明文结算，", en: "Zero-text settlement," },
  hero_h2: { zh: "零信任，全程审计。", en: "Zero trust. Full audit." },
  hero_lede: {
    zh: "Solana 上首个基于 Baby Jubjub 加密余额池的机构合规暗池 OTC 结算协议。交易意图绝密，监管始终可控。",
    en: "The first institutional-grade dark-pool OTC settlement protocol on Solana, built on Baby Jubjub encrypted balance ledgers. Trade intent stays private. Regulators stay in control."
  },
  cta_start: { zh: "开始结算 →", en: "Start settling →" },
  cta_docs: { zh: "阅读文档", en: "Read docs" },
  live_ticker: { zh: "实时", en: "Live" },

  feat_1_title: { zh: "池内结算 · 零明文泄露", en: "On-pool settlement · zero plaintext" },
  feat_1_sub: { zh: "Baby Jubjub ElGamal · 独立 Ledger PDA", en: "Baby Jubjub ElGamal · dedicated ledger PDAs" },
  feat_1_stat: { zh: "0 字节", en: "0 bytes" },
  feat_1_stat_sub: { zh: "链上明文外泄", en: "Plaintext emitted" },

  feat_2_title: { zh: "原子级单笔双证明", en: "Atomic dual-proof settlement" },
  feat_2_sub: { zh: "Groth16 × 2 · 单笔交易完成", en: "Two Groth16 proofs in one tx" },
  feat_2_stat: { zh: "198,400 CU", en: "198,400 CU" },
  feat_2_stat_sub: { zh: "单次结算 · 远低于 400k 预算", en: "Per settle · well under 400k budget" },

  feat_3_title: { zh: "TEE 合规审计预言机", en: "TEE compliance oracle" },
  feat_3_sub: { zh: "AWS Nitro · PCR 绑定 · 强制链上留痕", en: "AWS Nitro · PCR-bound · on-chain audit log" },
  feat_3_stat: { zh: "链上", en: "On-chain" },
  feat_3_stat_sub: { zh: "AuditLog PDA · 被审计者可见", en: "AuditLog PDA · target user sees it" },

  arch_live: { zh: "架构 · 实时", en: "Architecture · live" },
  arch_ledger_a: { zh: "Ledger PDA · 用户 A · USDC", en: "Ledger PDA · User A · USDC" },
  arch_ledger_b: { zh: "Ledger PDA · 用户 B · USDC", en: "Ledger PDA · User B · USDC" },
  arch_settle: { zh: "结算记录 + 审计密文", en: "Settlement record + audit ciphertexts" },
  arch_tee: { zh: "TEE · AWS Nitro", en: "TEE · AWS Nitro" },

  // role select
  gate_eyebrow: { zh: "选择访问权限", en: "Select clearance level" },
  gate_restricted: { zh: "机构节点 · 受限访问", en: "Restricted · institutional node" },
  role_trader: { zh: "交易员", en: "Trader" },
  role_trader_sub: { zh: "生成 ZK 证明，进行池内 OTC 结算", en: "Generate ZK proofs and settle OTC on-pool" },
  role_trader_req: { zh: "需要 · 钱包 + 私钥", en: "Requires · wallet + sk" },
  role_trader_cta: { zh: "进入交易员终端 →", en: "Enter trader terminal →" },
  role_reg: { zh: "监管员", en: "Regulator" },
  role_reg_sub: { zh: "向 TEE 发起审计请求，强制链上留痕", en: "Request TEE audits · mandatory on-chain trace" },
  role_reg_req: { zh: "需要 · 在册审计机构", en: "Requires · registered auditor" },
  role_reg_cta: { zh: "进入监管终端 →", en: "Enter regulator terminal →" },
  role_dev: { zh: "开发者", en: "Developer" },
  role_dev_sub: { zh: "查看电路 / TEE / 结算档案（只读）", en: "Inspect circuits · TEE · archives (read-only)" },
  role_dev_req: { zh: "只读 · 公开访问", en: "Read-only · public" },
  role_dev_cta: { zh: "进入开发者视图 →", en: "Enter dev view →" },
  return_home: { zh: "← 返回首页", en: "← Return home" },

  // settlement terminal
  term_trade_intent: { zh: "交易意图", en: "Trade intent" },
  term_cpty: { zh: "对手方地址", en: "Counterparty address" },
  term_kyb: { zh: "机构认证", en: "KYB" },
  term_role: { zh: "你的角色", en: "Your role" },
  term_sender: { zh: "− 发送方", en: "− Sender" },
  term_receiver: { zh: "+ 接收方", en: "+ Receiver" },
  term_amount: { zh: "金额", en: "Amount" },
  term_preview: { zh: "本地预览 · 不上链", en: "Preview · local compute only" },
  term_old_bal: { zh: "当前余额（本地解密）", en: "Old balance (decrypted)" },
  term_transfer: { zh: "− 转账", en: "− Transfer" },
  term_new_bal: { zh: "新余额", en: "New balance" },
  term_generate: { zh: "⚡ 生成证明 & 结算", en: "⚡ Generate proof & settle" },
  term_generating: { zh: "证明中…", en: "Proving…" },
  term_exchanging: { zh: "交换对手方证明…", en: "Exchanging proofs…" },
  term_submitting: { zh: "提交链上…", en: "Submitting to chain…" },
  term_success: { zh: "结算完成 ✓", en: "Settled ✓" },

  prover_title: { zh: "证明器舞台 · balance_transition.circom", en: "Prover stage · balance_transition.circom" },
  prover_idle: { zh: "待命", en: "Idle" },
  prover_witness: { zh: "生成见证", en: "Witness" },
  prover_msm: { zh: "MSM 椭圆曲线点积", en: "MSM" },
  prover_pairing: { zh: "配对检查", en: "Pairing" },
  prover_serialize: { zh: "序列化", en: "Serialize" },
  prover_constraints: { zh: "约束点亮", en: "Constraints lit" },
  prover_output: { zh: "证明输出 · 256 字节", en: "Proof output · 256 bytes" },

  hs_title: { zh: "双方握手 · A ↔ B", en: "Handshake · A ↔ B" },
  hs_you: { zh: "自己 (A)", en: "Party A (you)" },
  hs_cpty: { zh: "对手方 (B)", en: "Party B" },
  hs_consistency: { zh: "审计一致性检查", en: "Audit consistency check" },
  hs_eq_ok: { zh: "等式成立 ✓", en: "Equation holds ✓" },

  cu_title: { zh: "Compute Unit 计量表", en: "Compute unit meter" },
  cu_budget: { zh: "预算 · 使用", en: "budget · used" },

  diff_title: { zh: "Ledger PDA · 字节级 Diff · 结算前 → 结算后", en: "Ledger PDA · byte-level diff · before → after" },
  diff_bytes: { zh: "字节变更", en: "bytes changed" },
  diff_version: { zh: "版本", en: "version" },
  diff_my_ledger: { zh: "我方 ledger.balance_ct_lo", en: "my ledger.balance_ct_lo" },
  diff_cpty_ledger: { zh: "对手方 ledger.balance_ct_lo", en: "counterparty ledger.balance_ct_lo" },

  // regulator
  reg_title: { zh: "Nexum · 监管节点 · MAS 新加坡", en: "Nexum · Regulator node · MAS Singapore" },
  reg_pcr_ok: { zh: "PCR 已授权", en: "PCR authorized" },
  reg_step1: { zh: "① 选择结算记录", en: "① Select settlement" },
  reg_step2: { zh: "② TEE · AWS Nitro 飞地", en: "② TEE · AWS Nitro enclave" },
  reg_step3: { zh: "③ 审计结果", en: "③ Audit result" },
  reg_attest: { zh: "证明中…", en: "Attesting…" },
  reg_kms_release: { zh: "KMS 释放 DEK", en: "KMS DEK released" },
  reg_bsgs: { zh: "BSGS 解密 × 4", en: "BSGS decrypt × 4" },
  reg_decrypt: { zh: "→ 请求解密金额", en: "→ Request decrypt" },
  reg_decrypting: { zh: "解密中…", en: "Decrypting…" },
  reg_decrypted: { zh: "已解密", en: "Decrypted" },
  reg_initiator: { zh: "发起方", en: "Initiator" },
  reg_counterparty: { zh: "对手方", en: "Counterparty" },
  reg_jurisdiction: { zh: "辖区", en: "Jurisdiction" },
  reg_reason: { zh: "理由哈希", en: "Reason hash" },
  reg_enforce_title: { zh: "链上审计日志 · 已写入", en: "On-chain audit log · written" },
  reg_enforce_1: { zh: "AuditLog PDA 已创建。", en: "AuditLog PDA created." },
  reg_enforce_2: { zh: "被审计用户 永久可见 本次审计请求。", en: "The audited user will see this request forever." },
  reg_enforce_3: { zh: "不可撤销。", en: "Irreversible." },
  reg_export: { zh: "导出合规报告", en: "Export compliance report" },
  reg_records: { zh: "未审计结算", en: "Pending records" },
  reg_audited: { zh: "已审计", en: "Audited" },

  // common
  guided_demo: { zh: "▶ 引导演示", en: "▶ Guided demo" },
  guided_exit: { zh: "■ 退出演示", en: "■ Exit demo" },
  lang_toggle: { zh: "EN", en: "中" },
  tweaks_title: { zh: "调节面板", en: "Tweaks" },
  tweak_accent: { zh: "强调色", en: "Accent color" },
  tweak_density: { zh: "数据密度", en: "Data density" },
  tweak_motion: { zh: "动画强度", en: "Motion intensity" },
  tweak_page: { zh: "跳转到页面", en: "Jump to page" },

  page_landing: { zh: "首页", en: "Landing" },
  page_role: { zh: "角色选择", en: "Role" },
  page_trader: { zh: "交易员终端", en: "Trader" },
  page_regulator: { zh: "监管终端", en: "Regulator" },

  slot: { zh: "Solana Slot", en: "Solana slot" },
};

function useT(lang){
  return (key)=> (I18N[key] && I18N[key][lang]) || key;
}

window.useT = useT;
window.I18N = I18N;
