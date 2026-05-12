<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana&logoColor=white" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-2CE1F6?logo=rust&logoColor=white" alt="Anchor 0.32.1" />
  <img src="https://img.shields.io/badge/ZK-Groth16%20%2B%20BN254-8B5CF6" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/Tests-65%20%E2%9C%93-brightgreen" alt="65 Tests Pass" />
  <img src="https://img.shields.io/badge/License-ISC-blue" alt="ISC License" />
</p>

<h1 align="center">NEXUM</h1>

<p align="center">
  <strong>2.4 万亿美元的 OTC 市场，链上隐私为零。<br/>
  我们构建了机构一直在等的结算层。</strong>
</p>

<p align="center">
  Solana 上的隐私保护双边结算协议。<br/>
  无托管、无中介、无免费期权。完全可审计。
</p>

<p align="center">
  <a href="README.md">English</a> &middot; <a href="https://www.youtube.com/watch?v=UNCH7Gyeazo">演示视频</a>
</p>

---

## 问题

> "上个季度我们处理了 1.8 亿美元的 OTC 交易。每笔交易几秒内就在链上可见。我们的竞争对手比我们的客户更早知道我们的仓位。"
> — *数字资产负责人，[某交易柜台]*

机构 OTC 加密交易量在 2024 年达到 **2.4 万亿美元**。链上结算占比**接近 0%**。原因很简单：Solana 的透明性对零售 DeFi 是优势，对机构却是负担。

| 问题 | 真实成本 |
|------|---------|
| **无交易隐私** | 金额、钱包地址、对手方全部公开。抢跑每笔交易让交易台损失 10-50 个基点。1 亿美元交易量 = **每季度泄露 10-50 万美元给 MEV。** |
| **"免费期权"漏洞** | 在朴素互换中，乙方收到甲方承诺后观察市场，价格不利就离场。**违约零成本。** 甲方浪费计算和时间，毫无追索权。 |
| **串行结算瓶颈** | ZK 证明绑定账本版本。一笔结算完成 → 版本递增 → 所有在途证明失效。**5 笔交易串行需要 22.5 秒。** |
| **无链上意图审计** | 链上无法证明甲方在特定时间承诺了特定交易。争议解决依赖可能不存在的链下证据。 |

**结果：** 机构只能依赖托管方（Coinbase Prime、Galaxy）或 OTC 柜台（Cumberland、Jump）作为可信中介——增加了对手方风险、费用和结算延迟。

---

## 解决方案：Nexum

Nexum 是一个**结算协议**，不是交易场所。双方链下达成条款，然后在 Solana 上原子结算——有隐私，无中介。

### 30 秒看懂运作方式

| 时间 | 发生什么 | 谁 |
|------|---------|-----|
| **T+0s** | 甲方在链上提交交易条款的 SHA-256 哈希 | 发起方 |
| **T+5s** | 乙方验证哈希，接受——双方余额瞬间锁定 | 对手方 |
| **T+30s** | 双重 ZK 证明验证余额转换。结算完成。 | 任一方 |

**总计：3 笔交易，约 30 秒，约 $0.003 手续费。**

结算期间代币不移动。只有加密余额更新。共享金库架构使交易不可关联。

### 三个角色，三个价值主张

**交易员** — 双边结算 OTC，不向市场暴露你的仓位。你的余额保持加密。你的对手方在你承诺后无法退出。

**做市商** — 通过版本槽位并行运行 20 笔结算。吞吐量是串行的 3.5 倍。预留槽位，预生成证明，顺序提交。

**监管方** — 在不破坏用户隐私的前提下获得完整审计权限。双重加密余额（用户密钥 + 监管密钥）。6 阶段审计流程，查询全部记录。从第一天起就具备合规能力。

---

## 市场与商业模式

### 市场规模

| 细分市场 | 2024 年交易量 | 链上占比 | 机会 |
|---------|-------------|---------|------|
| 加密 OTC（机构） | $2.4T | ~0% | 首要目标 |
| 稳定币结算 | $8.9T | 增长中 | 次要（USDC/USDT OTC） |
| 代币化 RWA OTC | $15B | 早期 | 新兴（债券、基金） |

### 变现路径

**阶段一 — 协议费（上线）**
每笔结算单边 0.01%（双边 0.02%）。日均 1 亿美元交易量 = $20K/天 = **$730 万年收入**。对机构而言费用微不足道（每 100 万美元交易仅 $10），但在规模下复利增长。

**阶段二 — 版本槽位授权（2026 Q3）**
做市商为预留的并行槽位付费。阶梯定价：5 个槽位免费，20 个槽位 $500/月，企业定制方案。从吞吐量溢价中获利。

**阶段三 — 监管即服务（2026 Q4）**
面向受监管实体的合规工具。加密审计访问、自动化报告、密钥管理。为需要 MiCA/SEC 合规的机构提供 SaaS 定价。

**阶段四 — SDK 授权（2027）**
白标 SDK，让交易所和主经纪商将隐私结算集成到现有基础设施中。企业授权模式。

---

## 竞争格局

| | Nexum | Penumbra | Renegade | AirSwap RFQ |
|---|---|---|---|---|
| **链** | Solana（亚秒级） | Cosmos（6s 出块） | Arbitrum Stylus（~0.25s） | Ethereum（12s） |
| **隐私模型** | ElGamal + ZK（链上） | 屏蔽池（IBC） | MPC（链下） | 无 |
| **免费期权保护** | 对称双锁 | 部分（IBC 超时） | MPC 轮次 | 无 |
| **结算速度** | ~30s（3 笔 TX） | ~15s（IBC 轮次） | ~45s（3 轮 MPC） | ~30s（2 笔 TX） |
| **并行吞吐** | 20x（版本槽位） | 1x（串行） | 1x（串行） | 1x（串行） |
| **监管审计** | 内置（双重加密） | 外部 | 无 | 无 |
| **Devnet / Mainnet** | Devnet 已上线 | Testnet | Devnet | Mainnet |

**Nexum 的护城河：** Solana 的速度 + 链上隐私 + 对称锁定。没有其他协议能将亚秒级终局性与 ZK 验证的加密余额和内置合规模型结合在一起。

---

## 技术架构

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (React + Vite + Tailwind CSS)                         │
│  交易终端  │  监管审计室  │  做市商仪表盘                     │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK                                             │
│  加密层 (ElGamal + 承诺哈希)  │  证明器 (snarkjs WASM)       │
├─────────────────────────────────────────────────────────────┤
│  Solana 程序 (Anchor)                                       │
│  nexum_pool (结算 + 金库)  │  zk_verifier (Groth16 验证)     │
├─────────────────────────────────────────────────────────────┤
│  ZK 电路 (Circom)                                           │
│  balance_transition_private — 181K 约束                     │
└─────────────────────────────────────────────────────────────┘
```

### 三步结算流程

每笔 Nexum 结算在 **3 笔链上交易**内完成：

**第一步——承诺** (`initiate_commit`，~50K CU)
甲方从 128 字节的预映像计算 SHA-256 承诺哈希，预映像包含交易参数（nonce、双方转账金额、资产铸币地址、对手方、过期时间）。哈希——而非金额——存储在链上 204 字节的 CommitSlot PDA 中。

**第二步——接受** (`accept_commit`，~50K CU)
乙方链下验证哈希与约定条款匹配，调用 `accept_commit`。这触发**对称双锁**：双方的加密余额同时冻结。任何一方都无法单方面退出。

**第三步——执行** (`execute_settle_b`，~400K CU)
任一方提交双重 Groth16 零知识证明。链上验证器确认余额转换有效且承诺哈希匹配。双方加密余额原子性更新。永久性 SettlementRecord 被写入。

```
 发起方                           链                              对手方
     │                              │                              │
     │──── initiate_commit ────────>│                              │
     │   (锁定账本 A,               │                              │
     │    创建 CommitSlot)           │                              │
     │                              │<──── accept_commit ──────────│
     │                              │   (对称双锁)                  │
     │<────────────────── 双方锁定 ────────────────────────────────>│
     │                              │                              │
     │──── execute_settle_b ──────>│                              │
     │   (双重 ZK 证明,             │                              │
     │    ~400K CU)                  │                              │
     │                              │                              │
     │<─────── 结算完成 ────────────┴──────────────────────────────>│
              双方账本 → Active
```

**超时恢复：** `cancel_initiate`（乙方在 60 秒内未响应）和 `cancel_mutual`（双锁后 120 秒内未执行）。

### 核心创新

**1. 对称双锁——消除免费期权**

传统双边结算给乙方一个免费期权：收到甲方承诺后可以观察市场，如果条件不利就离场。Nexum 将这个期权价值归零。当乙方接受时，双方账本同时锁定。任何一方都无法单方面退出。

**2. 最小承诺锚点——体积缩减 84%**

CommitSlot 仅存储 32 字节 SHA-256 哈希加元数据（共 204 字节）。没有密文、没有证明。链上锚点是防篡改的时间戳；实际条款在链下验证，在 ZK 电路内证明。

**3. 版本槽位——3.5 倍流水线吞吐**

ZK 证明绑定账本版本号。Nexum 通过版本槽位预分配解决：做市商预留最多 20 个槽位，支持并行证明生成。

| 模式 | 5 笔结算 | 延迟 |
|------|---------|------|
| 串行 | 5 × (4s 证明 + 0.5s 确认) | 22.5s |
| 并行（版本槽位） | 4s 证明 + 5 × 0.5s 确认 | 6.5s |

**4. 共享国库金库——切断交易路径分析**

每个代币铸币地址一个共享金库（PDA：`["nexum_vault", mint]`）。所有用户存入同一个资金池。结算只更新加密账本余额——SPL Token 不移动。数百名用户的存款汇聚在一起；从共享金库的提取无法关联到任何特定存款。

**5. 隐私保护 ZK 电路——电路内哈希**

181K 约束的电路在**电路内部**计算承诺预映像的 SHA-256。所有金额都是私有输入。只有两个 128 位承诺哈希分量是公开输出。链上验证器永远看不到任何金额。

**6. Baby Jubjub 上的 ElGamal 加密余额**

所有余额使用 Baby Jubjub 曲线上的扭曲 ElGamal 加密（嵌入 BN254——circom/snarkjs 的原生曲线）。每个密文 128 字节。链上程序从不解密。解密使用 Baby-step Giant-step，O(√n) = 65,536 步完成。

**7. 监管审计模型**

合规友好的监管模型：监管方从钱包签名派生确定性 ElGamal 密钥，在链上注册公钥。结算期间余额双重加密（用户密钥 + 监管方密钥）。监管页面提供 6 阶段审计流程：查询 → 获取 → 要求密钥 → 解封 → 揭示。每次审计查询被记录。

---

## 技术参数

| 指标 | 值 |
|------|-----|
| 每笔结算交易数 | 3 |
| CommitSlot 大小 | 204 字节 |
| UserLedger 大小 | 994 字节 |
| ZK 电路约束数 | 181,522 |
| 证明大小 | 256 字节（Groth16, BN254） |
| 证明生成 | ~4 秒（浏览器, snarkjs WASM） |
| 执行 CU | ~400K |
| 版本槽位并行度 | 最多 20 个槽位, 3.5x 吞吐 |
| ElGamal 曲线 | Baby Jubjub（BN254 嵌入） |
| 完整结算 Gas 成本 | ~0.003 SOL |

## Devnet 部署

| 程序 | 地址 |
|------|------|
| `nexum_pool` | `6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r` |
| `zk_verifier` | `HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA` |

## 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Anchor 0.32.1, Rust 1.89, groth16-solana 0.2.0 |
| ZK 电路 | Circom 2.2.3, snarkjs, BN254 Groth16 |
| 加密 | Baby Jubjub 扭曲 ElGamal, @zk-kit/baby-jubjub |
| 前端 | React 18, Vite, Tailwind CSS, Solana Wallet Adapter |
| SDK | TypeScript, @coral-xyz/anchor, snarkjs WASM |

## 构建与测试

```bash
# 构建 Solana 程序
bash -c 'ulimit -s unlimited; RUST_MIN_STACK=16777216 anchor build'

# Rust 单元测试
cargo test -p nexum_pool && cargo test -p zk_verifier

# TypeScript 单元测试
bash scripts/run_unit_tests.sh

# 端到端测试（需要本地验证器）
solana-test-validator --reset && anchor test
```

## 项目结构

```
Nexum-B/
├── programs/
│   ├── nexum_pool/              # 主结算程序
│   │   └── src/
│   │       ├── instructions/    # 16 条指令处理器
│   │       └── state/           # 账户数据模型
│   └── zk_verifier/            # 链上 Groth16 验证器
├── sdk/src/
│   ├── crypto/                  # ElGamal, 承诺哈希, 监管密钥
│   ├── scheme_b/                # 结算流程函数
│   └── workers/                 # 浏览器 ZK 证明器
├── circuits/
│   └── balance_transition_private.circom
├── app/src/
│   ├── pages/                   # 交易终端、监管室、做市商、首页
│   └── hooks/                   # useSchemeB 状态机
└── tests/                       # 6 套测试，共 65 项
```

## 对 Solana 生态的贡献

1. **Groth16 在 Solana 上已具备生产条件。** 使用 `sol_alt_bn128_pairing` 在约 400K CU 内验证双重 BN254 证明。
2. **加密状态是实用的。** 994 字节 UserLedger 模型表明链上加密状态可以大规模工作。
3. **机构 OTC 需要在 Solana 上有归宿。** Nexum 将隐私、可审计性和原子结算带到链上。
4. **金库模型开创了新的 DeFi 范式。** 具有加密内部记账的共享国库金库为暗池和私有 AMM 奠定了基础。

---

<p align="center">
  <em>为尚不互信的机构而建。</em>
</p>
