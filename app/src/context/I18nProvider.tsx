/**
 * I18nProvider — Full internationalization for Nexum Protocol
 *
 * Provides zh/en translations across ALL pages.
 * Usage: const { t, lang, setLang } = useI18n();
 */

import React, { createContext, useContext, useState, useCallback, FC, ReactNode } from "react";

type Lang = "zh" | "en";

interface Translations {
  // ── Home ──
  home: {
    badge: string;
    title: string;
    subtitle: string;
    cta: string;
    docs: string;
    launchProd: string;
    langToggle: string;
    f1Title: string;
    f1Desc: string;
    f2Title: string;
    f2Desc: string;
    f3Title: string;
    f3Desc: string;
  };
  // ── Role Selection ──
  roles: {
    back: string;
    badge: string;
    title: string;
    subtitle: string;
    traderBtn: string;
    traderSub: string;
    regulatorBtn: string;
    regulatorSub: string;
    footerHash: string;
    footerLock: string;
    footerSlots: string;
  };
  // ── Wallet Gate ──
  wallet: {
    title: string;
    subtitle: string;
    connect: string;
    loading: string;
  };
  // ── Trader Terminal ──
  trader: {
    title: string;
    schemeLabel: string;
    tradeIntent: string;
    encrypted: string;
    counterparty: string;
    assetA: string;
    assetAHint: string;
    assetB: string;
    amount: string;
    initiateBtn: string;
    cancelBtn: string;
    hashLabel: string;
    ledgerA: string;
    ledgerB: string;
    countdown: string;
    dualLockMsg: string;
    awaitingMsg: string;
    hashVerified: string;
    hashMismatch: string;
    dualLockConfirm: string;
    generatingProof: string;
    terminalTitle: string;
    successTitle: string;
    successDetail: string;
    backBtn: string;
    step1: string;
    step2: string;
    step3: string;
  };
  // ── Maker Dashboard ──
  maker: {
    title: string;
    subtitle: string;
    initTitle: string;
    mintLabel: string;
    mintHint: string;
    connectLedger: string;
    loadingLedger: string;
    totalReserved: string;
    inUse: string;
    released: string;
    slotsToReserve: string;
    reserveBtn: string;
    reserving: string;
    registry: string;
    index: string;
    version: string;
    status: string;
    pda: string;
    action: string;
    release: string;
    noSlots: string;
    backBtn: string;
  };
  // ── Regulator ──
  regulator: {
    title: string;
    subtitle: string;
    back: string;
    overview: string;
    totalSettlements: string;
    activeCommitSlots: string;
    protocolStatus: string;
    configTitle: string;
    configAuthority: string;
    configPaused: string;
    configInitWindow: string;
    configExecWindow: string;
    configTolerance: string;
    configMaxSlots: string;
    settlementExplorer: string;
    partyA: string;
    partyB: string;
    assetA: string;
    assetB: string;
    amount: string;
    settledAt: string;
    scheme: string;
    versionA: string;
    versionB: string;
    explorerPlaceholder: string;
    explorerHint: string;
    loadBtn: string;
    loading: string;
    noRecords: string;
    commitmentInspector: string;
    commitSlotAddress: string;
    loadCommitBtn: string;
    initiator: string;
    counterparty: string;
    commitmentHash: string;
    expiryInit: string;
    executeExpiry: string;
    bothLockedAt: string;
    nonce: string;
    status: string;
    statusWaitingAccept: string;
    statusBothLocked: string;
    statusSettled: string;
    statusCancelled: string;
    proofDataTitle: string;
    proofAParty: string;
    proofBParty: string;
    proofSize: string;
    ctSize: string;
    verifyProof: string;
    verifyResult: string;
    verifyValid: string;
    verifyInvalid: string;
    ledgerInspector: string;
    ledgerAddress: string;
    loadLedgerBtn: string;
    owner: string;
    mint: string;
    version: string;
    ledgerStatus: string;
    lastSettlement: string;
    balanceCtLo: string;
    balanceCtHi: string;
    auditCtLo: string;
    auditCtHi: string;
    pendingCommitment: string;
    pendingExpiry: string;
    pendingCounterparty: string;
    pendingNonce: string;
    ledgerActive: string;
    ledgerPendingInit: string;
    ledgerBothPending: string;
    ledgerPendingCp: string;
    ledgerEmergency: string;
    recentSettlements: string;
    txHash: string;
    blockTime: string;
    fetchError: string;
    refresh: string;
  };
}

const zh: Translations = {
  home: {
    badge: "生产就绪 v3.0",
    title: "零明文。零信任。完全合规。",
    subtitle: "Solana 上首个基于加密余额池与极简承诺锚点的机构级 OTC 结算协议。交易意图绝密，彻底消除免费期权。",
    cta: "启动结算引擎",
    docs: "阅读文档",
    launchProd: "进入生产环境",
    langToggle: "EN",
    f1Title: "池内零明文结算",
    f1Desc: "全程无 SPL 转账。Baby Jubjub ElGamal 加密链上密文，Groth16 ZK 保证守恒。",
    f2Title: "对称双向锁定",
    f2Desc: "accept_commit 后双方余额强制同步锁定，彻底消除原子交换的免费期权问题。",
    f3Title: "版本槽并发引擎",
    f3Desc: "做市商专属：VersionSlot PDA 打破 ZK 串行，并行生成多份证明，吞吐提升 3.5 倍。",
  },
  roles: {
    back: "返回首页",
    badge: "生产环境（方案 B）",
    title: "系统初始化",
    subtitle: "选择操作权限以接入 Nexum 网络。",
    traderBtn: "机构交易员",
    traderSub: "OTC 执行节点（三步双锁）",
    regulatorBtn: "监管节点",
    regulatorSub: "合规审计网关（TEE 解密）",
    footerHash: "SHA-256 承诺",
    footerLock: "对称双锁",
    footerSlots: "ZK 版本槽",
  },
  wallet: {
    title: "需要身份验证",
    subtitle: "连接 Solana 钱包以访问生产环境。",
    connect: "连接钱包",
    loading: "钱包已连接，程序加载中…",
  },
  trader: {
    title: "OTC 结算节点",
    schemeLabel: "方案 B 生产环境",
    tradeIntent: "交易意图",
    encrypted: "方案 B 加密",
    counterparty: "对手方地址",
    assetA: "资产 A（本方资产）",
    assetAHint: "可选 — 默认 devnet USDC",
    assetB: "资产 B（对手方资产）",
    amount: "结算金额",
    initiateBtn: "第一步：发起承诺",
    cancelBtn: "取消",
    hashLabel: "承诺与锁定状态",
    ledgerA: "甲方（你）账本",
    ledgerB: "乙方（对手方）账本",
    countdown: "超时倒计时",
    dualLockMsg: "对称双锁已生效。免费期权已消除。",
    awaitingMsg: "等待对手方确认（{s}秒）…",
    hashVerified: "哈希验证通过 — 金额与链上承诺一致。",
    hashMismatch: "哈希不匹配 — 承诺金额与约定不符。请勿接受。",
    dualLockConfirm: "双锁确认",
    generatingProof: "正在生成 ZK 证明… 可能需要数秒。",
    terminalTitle: "nexum-crypto-engine — scheme-b",
    successTitle: "原子结算已执行",
    successDetail: "CommitSlot 已关闭，双锁已释放",
    backBtn: "返回角色选择",
    step1: "1. 发起",
    step2: "2. 双锁",
    step3: "3. 执行",
  },
  maker: {
    title: "做市商仪表盘",
    subtitle: "版本槽并发引擎",
    initTitle: "初始化版本槽管理器",
    mintLabel: "资产铸币地址",
    mintHint: "你的 UserLedger 对应的资产 mint。用于推导账本 PDA。",
    connectLedger: "连接账本",
    loadingLedger: "加载账本…",
    totalReserved: "已预留总数",
    inUse: "使用中",
    released: "已释放",
    slotsToReserve: "预留数量（最多 20）",
    reserveBtn: "预留版本槽",
    reserving: "预留中…",
    registry: "版本槽注册表",
    index: "索引",
    version: "版本",
    status: "状态",
    pda: "PDA",
    action: "操作",
    release: "释放",
    noSlots: "尚未预留版本槽。点击「预留版本槽」开始。",
    backBtn: "返回角色选择",
  },
  regulator: {
    title: "监管审计网关",
    subtitle: "链上数据透明度 — 所有结算记录、承诺哈希和 ZK 证明均可审计。",
    back: "返回角色选择",
    overview: "协议概览",
    totalSettlements: "总结算数",
    activeCommitSlots: "活跃 CommitSlot",
    protocolStatus: "协议状态",
    configTitle: "协议配置",
    configAuthority: "治理权限",
    configPaused: "暂停状态",
    configInitWindow: "发起窗口",
    configExecWindow: "执行窗口",
    configTolerance: "时钟容忍",
    configMaxSlots: "最大版本槽",
    settlementExplorer: "结算记录浏览器",
    partyA: "甲方 (发起方)",
    partyB: "乙方 (对手方)",
    assetA: "资产 A",
    assetB: "资产 B",
    amount: "转账金额",
    settledAt: "结算时间",
    scheme: "结算方案",
    versionA: "甲方版本",
    versionB: "乙方版本",
    explorerPlaceholder: "输入 SettlementRecord 地址...",
    explorerHint: "输入 PDA 地址查看单条结算记录",
    loadBtn: "加载记录",
    loading: "加载中…",
    noRecords: "暂无结算记录。请输入地址或等待最新数据。",
    commitmentInspector: "CommitSlot 检查器",
    commitSlotAddress: "CommitSlot 地址",
    loadCommitBtn: "加载 CommitSlot",
    initiator: "发起方",
    counterparty: "对手方",
    commitmentHash: "承诺哈希",
    expiryInit: "发起过期",
    executeExpiry: "执行过期",
    bothLockedAt: "双锁时间",
    nonce: "Nonce",
    status: "状态",
    statusWaitingAccept: "等待接受",
    statusBothLocked: "双方已锁",
    statusSettled: "已结算",
    statusCancelled: "已取消",
    proofDataTitle: "ProofData 验证",
    proofAParty: "甲方证明",
    proofBParty: "乙方证明",
    proofSize: "证明大小",
    ctSize: "密文大小",
    verifyProof: "验证 ZK 证明",
    verifyResult: "验证结果",
    verifyValid: "证明格式有效（256字节 Groth16）",
    verifyInvalid: "证明无效",
    ledgerInspector: "UserLedger 检查器",
    ledgerAddress: "Ledger 地址",
    loadLedgerBtn: "加载 Ledger",
    owner: "所有者",
    mint: "铸币地址",
    version: "版本号",
    ledgerStatus: "状态",
    lastSettlement: "最近结算 ID",
    balanceCtLo: "余额密文 (低)",
    balanceCtHi: "余额密文 (高)",
    auditCtLo: "审计密文 (低)",
    auditCtHi: "审计密文 (高)",
    pendingCommitment: "待处理承诺",
    pendingExpiry: "待处理过期",
    pendingCounterparty: "待处理对手方",
    pendingNonce: "待处理 Nonce",
    ledgerActive: "活跃",
    ledgerPendingInit: "发起方待确认",
    ledgerBothPending: "双方待确认",
    ledgerPendingCp: "对手方待确认",
    ledgerEmergency: "紧急",
    recentSettlements: "最近结算事件",
    txHash: "交易哈希",
    blockTime: "区块时间",
    fetchError: "获取数据失败",
    refresh: "刷新数据",
  },
};

const en: Translations = {
  home: {
    badge: "Production Ready v3.0",
    title: "Zero Plaintext. Zero Trust. Fully Compliant.",
    subtitle: "The first institutional OTC settlement protocol on Solana — encrypted balance pools, minimalist commitment anchors, and zero free options.",
    cta: "Start Settlement Engine",
    docs: "Read Docs",
    launchProd: "Launch Production",
    langToggle: "中文",
    f1Title: "Zero-Text Settlement",
    f1Desc: "No SPL transfers. Baby Jubjub ElGamal ciphertexts on-chain, Groth16 ZK conservation guarantees.",
    f2Title: "Symmetric Dual-Lock",
    f2Desc: "Both balances lock simultaneously on accept. Free option in atomic swaps — eliminated.",
    f3Title: "Version Slot Concurrency",
    f3Desc: "MM exclusive: VersionSlot PDAs break ZK serialization. Parallel proofs, 3.5x throughput boost.",
  },
  roles: {
    back: "Return to Home",
    badge: "Production Environment (Scheme B)",
    title: "System Initialization",
    subtitle: "Select your operational clearance to access the Nexum Network.",
    traderBtn: "Institutional Trader",
    traderSub: "OTC Execution Node (3-Step Dual-Lock)",
    regulatorBtn: "Regulator Node",
    regulatorSub: "Compliance Audit Gateway (TEE Decryption)",
    footerHash: "SHA-256 Commitments",
    footerLock: "Symmetric Dual-Lock",
    footerSlots: "ZK Version Slots",
  },
  wallet: {
    title: "Authentication Required",
    subtitle: "Connect your Solana wallet to access the production environment.",
    connect: "Connect Wallet",
    loading: "Wallet connected, loading program...",
  },
  trader: {
    title: "OTC Settlement Node",
    schemeLabel: "Scheme B Production",
    tradeIntent: "Trade Intent",
    encrypted: "Scheme B Encrypted",
    counterparty: "Counterparty Address",
    assetA: "Asset A (Your Asset)",
    assetAHint: "Optional — defaults to devnet USDC",
    assetB: "Asset B (Counterparty Asset)",
    amount: "Settlement Amount",
    initiateBtn: "Step 1: Initiate Commit",
    cancelBtn: "Cancel",
    hashLabel: "Commitment & Lock Status",
    ledgerA: "Party A (You) Ledger",
    ledgerB: "Party B (CP) Ledger",
    countdown: "Timeout Countdown",
    dualLockMsg: "Symmetric Dual-Lock Engaged. Zero Free Option.",
    awaitingMsg: "Awaiting Counterparty ({s}s)...",
    hashVerified: "Hash verified — amount matches on-chain commitment.",
    hashMismatch: "Hash MISMATCH — committed amount differs. Do NOT accept.",
    dualLockConfirm: "Dual-Lock Confirmed",
    generatingProof: "Generating ZK proof... This may take several seconds.",
    terminalTitle: "nexum-crypto-engine — scheme-b",
    successTitle: "Atomic Settlement Executed",
    successDetail: "CommitSlot Closed & Dual-Lock Released",
    backBtn: "Back to Roles",
    step1: "1. Initiate",
    step2: "2. Dual-Lock",
    step3: "3. Execute",
  },
  maker: {
    title: "Maker Dashboard",
    subtitle: "Version Slot Concurrency Engine",
    initTitle: "Initialize Version Slot Manager",
    mintLabel: "Asset Mint Address",
    mintHint: "The mint of the asset in your UserLedger. Used to derive the ledger PDA.",
    connectLedger: "Connect Ledger",
    loadingLedger: "Loading Ledger...",
    totalReserved: "Total Reserved",
    inUse: "In Use",
    released: "Released",
    slotsToReserve: "Slots to Reserve (max 20)",
    reserveBtn: "Reserve Slots",
    reserving: "Reserving...",
    registry: "Version Slot Registry",
    index: "Index",
    version: "Version",
    status: "Status",
    pda: "PDA",
    action: "Action",
    release: "Release",
    noSlots: "No version slots reserved. Click \"Reserve Slots\" to start.",
    backBtn: "Back to Roles",
  },
  regulator: {
    title: "Regulatory Audit Gateway",
    subtitle: "On-chain data transparency — all settlement records, commitment hashes, and ZK proofs are auditable.",
    back: "Back to Roles",
    overview: "Protocol Overview",
    totalSettlements: "Total Settlements",
    activeCommitSlots: "Active CommitSlots",
    protocolStatus: "Protocol Status",
    configTitle: "Protocol Config",
    configAuthority: "Authority",
    configPaused: "Paused",
    configInitWindow: "Init Window",
    configExecWindow: "Execute Window",
    configTolerance: "Clock Tolerance",
    configMaxSlots: "Max Version Slots",
    settlementExplorer: "Settlement Record Explorer",
    partyA: "Party A (Initiator)",
    partyB: "Party B (Counterparty)",
    assetA: "Asset A",
    assetB: "Asset B",
    amount: "Transfer Amount",
    settledAt: "Settled At",
    scheme: "Scheme",
    versionA: "Version A",
    versionB: "Version B",
    explorerPlaceholder: "Enter SettlementRecord address...",
    explorerHint: "Enter a PDA address to view a single settlement record",
    loadBtn: "Load Record",
    loading: "Loading...",
    noRecords: "No settlement records found. Enter an address or wait for recent data.",
    commitmentInspector: "CommitSlot Inspector",
    commitSlotAddress: "CommitSlot Address",
    loadCommitBtn: "Load CommitSlot",
    initiator: "Initiator",
    counterparty: "Counterparty",
    commitmentHash: "Commitment Hash",
    expiryInit: "Init Expiry",
    executeExpiry: "Execute Expiry",
    bothLockedAt: "Both Locked At",
    nonce: "Nonce",
    status: "Status",
    statusWaitingAccept: "Waiting Accept",
    statusBothLocked: "Both Locked",
    statusSettled: "Settled",
    statusCancelled: "Cancelled",
    proofDataTitle: "ProofData Verification",
    proofAParty: "Party A Proof",
    proofBParty: "Party B Proof",
    proofSize: "Proof Size",
    ctSize: "Ciphertext Size",
    verifyProof: "Verify ZK Proof",
    verifyResult: "Verification Result",
    verifyValid: "Proof format valid (256-byte Groth16)",
    verifyInvalid: "Proof invalid",
    ledgerInspector: "UserLedger Inspector",
    ledgerAddress: "Ledger Address",
    loadLedgerBtn: "Load Ledger",
    owner: "Owner",
    mint: "Mint",
    version: "Version",
    ledgerStatus: "Status",
    lastSettlement: "Last Settlement ID",
    balanceCtLo: "Balance CT (Lo)",
    balanceCtHi: "Balance CT (Hi)",
    auditCtLo: "Audit CT (Lo)",
    auditCtHi: "Audit CT (Hi)",
    pendingCommitment: "Pending Commitment",
    pendingExpiry: "Pending Expiry",
    pendingCounterparty: "Pending Counterparty",
    pendingNonce: "Pending Nonce",
    ledgerActive: "Active",
    ledgerPendingInit: "PendingInitiator",
    ledgerBothPending: "BothPending",
    ledgerPendingCp: "PendingCounterparty",
    ledgerEmergency: "Emergency",
    recentSettlements: "Recent Settlement Events",
    txHash: "TX Hash",
    blockTime: "Block Time",
    fetchError: "Failed to fetch data",
    refresh: "Refresh Data",
  },
};

const translationsMap: Record<Lang, Translations> = { zh, en };

interface I18nContextValue {
  t: Translations;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const I18nContext = createContext<I18nContextValue>({
  t: en,
  lang: "en",
  setLang: () => {},
});

export const useI18n = () => useContext(I18nContext);

export const I18nProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>("zh");

  const setLangCb = useCallback((l: Lang) => setLang(l), []);

  const value = React.useMemo(
    () => ({ t: translationsMap[lang], lang, setLang: setLangCb }),
    [lang, setLangCb]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
