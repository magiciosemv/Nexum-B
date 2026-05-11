<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana&logoColor=white" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-2CE1F6?logo=rust&logoColor=white" alt="Anchor 0.32.1" />
  <img src="https://img.shields.io/badge/ZK-Groth16%20%2B%20BN254-8B5CF6" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/Tests-65%20%E2%9C%93-brightgreen" alt="65 Tests Pass" />
  <img src="https://img.shields.io/badge/License-ISC-blue" alt="ISC License" />
</p>

<h1 align="center">NEXUM</h1>

<p align="center">
  <strong>Privacy-Preserving OTC Settlement on Solana</strong><br/>
  Zero-knowledge proofs &middot; ElGamal encrypted balances &middot; Symmetric dual-locking
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#中文">中文</a>
</p>

---

# English

## The Problem: Solana's Institutional Gap

Solana is the fastest general-purpose L1 — sub-second finality, $0.001 transactions, and a thriving DeFi ecosystem. But it has a critical blind spot: **every SPL token transfer is fully transparent**. For institutional OTC desks processing millions per trade, this is unacceptable.

| Problem | Impact |
|---------|--------|
| **No transaction privacy** | Amounts, sender, receiver are all publicly visible. Competitors front-run, counterparties are identified, treasury positions exposed. |
| **The "free option" flaw** | In a naive swap, Party B receives A's proof, observes the market, and walks away if the price moves against them — zero cost. A wasted computation with no recourse. |
| **Serial settlement bottleneck** | ZK proofs bind to a ledger version. When one settlement completes, the version increments, invalidating all in-flight proofs. Market makers must settle one-by-one. |
| **No audit trail for intent** | No tamper-proof record that Party A committed to a specific trade at a specific time. Dispute resolution impossible without off-chain evidence. |

These are structural barriers preventing institutional capital from entering on-chain OTC markets.

## The Solution: Nexum

Nexum is a privacy-preserving OTC settlement protocol built natively on Solana. It combines zero-knowledge proofs, ElGamal encrypted balances, symmetric dual-locking, and a shared vault architecture to enable institutional-grade bilateral settlement — fully on-chain, fully private, fully auditable.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind CSS)                     │
│  Trader Terminal  │  Regulator Chamber  │  Maker Dashboard  │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK                                             │
│  Crypto (ElGamal + Commitment)  │  Prover (snarkjs WASM)   │
├─────────────────────────────────────────────────────────────┤
│  Solana Programs (Anchor)                                   │
│  nexum_pool (settlement + vault) │ zk_verifier (Groth16)    │
├─────────────────────────────────────────────────────────────┤
│  ZK Circuit (Circom)                                        │
│  balance_transition_private — 12,778 constraints            │
└─────────────────────────────────────────────────────────────┘
```

### Three-Step Settlement Flow

Every Nexum settlement completes in exactly **3 on-chain transactions**:

**Step 1 — Commit** (`initiate_commit`, ~50K CU)
Party A computes a SHA-256 commitment hash from a 128-byte preimage (nonce, transfer amounts for both parties, asset mints, counterparty, expiry). The hash — not the amounts — is stored on-chain in a 204-byte CommitSlot PDA.

**Step 2 — Accept** (`accept_commit`, ~50K CU)
Party B verifies the hash off-chain and calls `accept_commit`. This triggers the **symmetric dual-lock**: both parties' encrypted balances freeze simultaneously. Neither can walk away.

**Step 3 — Execute** (`execute_settle_b`, ~400K CU)
Either party submits dual Groth16 zero-knowledge proofs. The on-chain verifier confirms the balance transition is valid and the commitment hash matches. Encrypted balances update atomically. A permanent SettlementRecord is written. SPL tokens never move during settlement.

```
 Initiator                        Chain                       Counterparty
     │                              │                              │
     │──── initiate_commit ────────>│                              │
     │   (lock Ledger A,            │                              │
     │    create CommitSlot)         │                              │
     │                              │<──── accept_commit ──────────│
     │                              │   (symmetric dual-lock)      │
     │<────────────────── Both Locked ─────────────────────────────>│
     │                              │                              │
     │──── execute_settle_b ──────>│                              │
     │   (dual ZK proofs,           │                              │
     │    ~400K CU)                  │                              │
     │                              │                              │
     │<─────── Settlement Complete ─┴──────────────────────────────>│
              Both ledgers → Active
```

**Timeout recovery:** `cancel_initiate` (B unresponsive within 60s) and `cancel_mutual` (no execution within 120s after dual-lock).

## Key Innovations

### 1. Symmetric Dual-Locking — Eliminating the Free Option

Traditional bilateral settlement gives Party B a free option: observe the market after receiving A's commitment, walk away if unfavorable. Nexum collapses this to zero. When B accepts, both ledgers lock simultaneously. Neither party can unilaterally exit.

### 2. Minimal Commitment Anchors — 84% Smaller

The CommitSlot stores only a 32-byte SHA-256 hash plus metadata (204 bytes total). No ciphertexts, no proofs. The on-chain anchor is a tamper-proof timestamp; actual terms are verified off-chain and proven inside the ZK circuit.

### 3. Version Slots — 3.5x Pipeline Throughput

ZK proofs bind to a ledger version number. Nexum solves this with version slot pre-allocation: market makers reserve up to 20 slots, enabling parallel proof generation.

| Mode | 5 Settlements | Latency |
|------|---------------|---------|
| Serial | 5 x (4s proof + 0.5s confirm) | 22.5s |
| Parallel (version slots) | 4s proof + 5 x 0.5s confirm | 6.5s |

### 4. Shared Treasury Vault — Breaking Transaction Path Analysis

One shared vault per token mint (PDA: `["nexum_vault", mint]`). All users deposit into the same pool. Settlement only updates encrypted balances — no SPL tokens move. Deposits from hundreds of users pool together; withdrawals cannot be linked to specific deposits.

### 5. Privacy-Preserving ZK Circuit with In-Circuit Hashing

The 12,778-constraint circuit computes SHA-256 of the commitment preimage **inside the circuit**. All amounts are private inputs. Only two 128-bit commitment hash limbs are public. The on-chain verifier never sees any amount.

### 6. ElGamal Encrypted Balances on Baby Jubjub

All balances encrypted with Twisted ElGamal on Baby Jubjub (embedded in BN254 — the native curve of circom/snarkjs). Ciphertexts are 128 bytes each. The on-chain program never decrypts. Decryption uses Baby-step Giant-step in O(sqrt(n)) = 65,536 steps.

### 7. Regulator Audit Model

A compliance-ready model: the regulator derives a deterministic ElGamal key from a wallet signature, registers the public key on-chain. During settlement, balances are dual-encrypted (user key + regulator key). The regulator page provides a 6-phase audit flow: QUERY -> FETCH -> DEMAND KEY -> UNSEAL -> REVEAL. Every audit query is logged.

## Technical Specifications

| Metric | Value |
|--------|-------|
| Transactions per settlement | 3 |
| CommitSlot size | 204 bytes |
| UserLedger size | 994 bytes |
| ZK circuit constraints | 12,778 |
| Proof size | 256 bytes (Groth16, BN254) |
| Proof generation | ~4 seconds (browser, snarkjs WASM) |
| Execute CU | ~400K |
| Version slot parallelism | Up to 20 slots, 3.5x throughput |
| ElGamal curve | Baby Jubjub (BN254 embedded) |
| Gas cost (full settlement) | ~0.0027 SOL |

## Devnet Deployment

| Program | Address |
|---------|---------|
| `nexum_pool` | `6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r` |
| `zk_verifier` | `HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA` |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Anchor 0.32.1, Rust 1.89, groth16-solana 0.2.0 |
| ZK Circuits | Circom 2.2.3, snarkjs, BN254 Groth16 |
| Encryption | Baby Jubjub Twisted ElGamal, @zk-kit/baby-jubjub |
| Frontend | React 18, Vite, Tailwind CSS, Solana Wallet Adapter |
| SDK | TypeScript, @coral-xyz/anchor, snarkjs WASM |

## Build & Test

```bash
# Build Solana programs (WSL2 fix)
bash -c 'ulimit -s unlimited; RUST_MIN_STACK=16777216 anchor build'

# Rust unit tests (19 tests)
cargo test -p nexum_pool
cargo test -p zk_verifier

# TypeScript unit tests (21 tests)
bash scripts/run_unit_tests.sh

# E2E tests (requires local validator)
solana-test-validator --reset
anchor test
```

## Project Structure

```
Nexum-B/
├── programs/
│   ├── nexum_pool/              # Main settlement program (16 instructions)
│   │   └── src/
│   │       ├── instructions/    # initiate, accept, execute, cancel, deposit, withdraw...
│   │       └── state/           # UserLedger, CommitSlot, VersionSlot, SettlementRecord...
│   └── zk_verifier/            # On-chain Groth16 BN254 verifier
├── sdk/
│   └── src/
│       ├── crypto/              # ElGamal, commitment hash, regulator key
│       ├── scheme_b/            # Settlement flow SDK functions
│       └── workers/             # Browser ZK proof generation (snarkjs WASM)
├── circuits/
│   └── balance_transition_private.circom  # 12,778-constraint privacy circuit
├── app/
│   └── src/
│       ├── pages/               # Trader, Regulator, Maker, Home
│       └── hooks/               # useSchemeB state machine
└── tests/                       # Unit + E2E test suites (65 tests)
```

## Contribution to Solana

1. **Groth16 on Solana is production-ready.** Dual BN254 proofs verified in ~400K CU via `sol_alt_bn128_pairing`.
2. **Encrypted state is practical.** 994-byte UserLedger with ElGamal ciphertexts works at scale.
3. **Institutional OTC needs a home on Solana.** Nexum brings privacy, auditability, and atomic settlement on-chain.
4. **The vault model enables new DeFi patterns.** Shared treasury vaults with encrypted accounting lay the foundation for dark pools and private AMMs.

---

# 中文

## 问题：Solana 的机构级缺口

Solana 是最快的通用 L1 公链——亚秒级终局性、$0.001 交易费、蓬勃的 DeFi 生态。但它有一个致命盲区：**每一笔 SPL Token 转账都是完全透明的**。对于每笔交易处理数百万美元的机构 OTC 柜台来说，这是不可接受的。

| 问题 | 影响 |
|------|------|
| **无交易隐私** | 金额、发送方、接收方都在链上公开。竞争对手可以抢跑，交易对手可被识别，资金池仓位完全暴露。 |
| **"免费期权"漏洞** | 在朴素的双方互换中，乙方收到甲方证明后可以观察市场。如果价格走势不利，乙方直接离场——零成本。甲方浪费了计算和时间，没有任何追索权。 |
| **串行结算瓶颈** | ZK 证明绑定特定的账本版本号。当一笔结算完成，版本号递增，所有正在飞行中的证明全部失效。做市商只能一笔一笔串行结算。 |
| **无链上意图审计线索** | 链上没有防篡改的记录表明甲方在特定时间承诺了特定交易。没有链下证据，争议解决无从谈起。 |

这些是阻止机构资本进入链上 OTC 市场的**结构性壁垒**。

## 解决方案：Nexum

Nexum 是一个**隐私保护的 OTC 结算协议**，原生构建于 Solana。它将零知识证明、ElGamal 加密余额、对称双锁和共享金库架构结合，实现机构级的双边结算——完全链上、完全隐私、完全可审计。

### 架构

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
│  balance_transition_private — 12,778 约束                   │
└─────────────────────────────────────────────────────────────┘
```

### 三步结算流程

每笔 Nexum 结算在 **3 笔链上交易**内完成：

**第一步——承诺** (`initiate_commit`，~50K CU)
甲方从 128 字节的预映像计算 SHA-256 承诺哈希，预映像包含交易参数（nonce、双方转账金额、资产铸币地址、对手方、过期时间）。哈希——而非金额——存储在链上 204 字节的 CommitSlot PDA 中。

**第二步——接受** (`accept_commit`，~50K CU)
乙方链下验证哈希与约定条款匹配，调用 `accept_commit`。这触发**对称双锁**：双方的加密余额同时冻结。任何一方都无法单方面退出。

**第三步——执行** (`execute_settle_b`，~400K CU)
任一方提交双重 Groth16 零知识证明。链上验证器确认余额转换有效且承诺哈希匹配。双方加密余额原子性更新。永久性 SettlementRecord 被写入。结算过程中 SPL Token **从不移动**。

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

## 核心创新

### 1. 对称双锁——消除免费期权

传统双边结算给乙方一个免费期权：收到甲方承诺后可以观察市场，如果条件不利就离场。Nexum 将这个期权价值归零。当乙方接受时，双方账本同时锁定。任何一方都无法单方面退出。

### 2. 最小承诺锚点——体积缩减 84%

CommitSlot 仅存储 32 字节 SHA-256 哈希加元数据（共 204 字节）。没有密文、没有证明。链上锚点是防篡改的时间戳；实际条款在链下验证，在 ZK 电路内证明。

### 3. 版本槽位——3.5 倍流水线吞吐

ZK 证明绑定账本版本号。Nexum 通过版本槽位预分配解决：做市商预留最多 20 个槽位，支持并行证明生成。

| 模式 | 5 笔结算 | 延迟 |
|------|---------|------|
| 串行 | 5 × (4s 证明 + 0.5s 确认) | 22.5s |
| 并行（版本槽位） | 4s 证明 + 5 × 0.5s 确认 | 6.5s |

### 4. 共享国库金库——切断交易路径分析

每个代币铸币地址一个共享金库（PDA：`["nexum_vault", mint]`）。所有用户存入同一个资金池。结算只更新加密账本余额——SPL Token 不移动。数百名用户的存款汇聚在一起；从共享金库的提取无法关联到任何特定存款。

### 5. 隐私保护 ZK 电路——电路内哈希

12,778 约束的电路在**电路内部**计算承诺预映像的 SHA-256。所有金额都是私有输入。只有两个 128 位承诺哈希分量是公开输出。链上验证器永远看不到任何金额。

### 6. Baby Jubjub 上的 ElGamal 加密余额

所有余额使用 Baby Jubjub 曲线上的扭曲 ElGamal 加密（嵌入 BN254——circom/snarkjs 的原生曲线）。每个密文 128 字节。链上程序从不解密。解密使用 Baby-step Giant-step，O(√n) = 65,536 步完成。

### 7. 监管审计模型

合规友好的监管模型：监管方从钱包签名派生确定性 ElGamal 密钥，在链上注册公钥。结算期间余额双重加密（用户密钥 + 监管方密钥）。监管页面提供 6 阶段审计流程：查询 → 获取 → 要求密钥 → 解封 → 揭示。每次审计查询被记录。

## 技术参数

| 指标 | 值 |
|------|-----|
| 每笔结算交易数 | 3 |
| CommitSlot 大小 | 204 字节 |
| UserLedger 大小 | 994 字节 |
| ZK 电路约束数 | 12,778 |
| 证明大小 | 256 字节（Groth16, BN254） |
| 证明生成 | ~4 秒（浏览器, snarkjs WASM） |
| 执行 CU | ~400K |
| 版本槽位并行度 | 最多 20 个槽位, 3.5x 吞吐 |
| ElGamal 曲线 | Baby Jubjub（BN254 嵌入） |
| 完整结算 Gas 成本 | ~0.0027 SOL |

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

# Rust 单元测试（19 项）
cargo test -p nexum_pool
cargo test -p zk_verifier

# TypeScript 单元测试（21 项）
bash scripts/run_unit_tests.sh

# 端到端测试（需要本地验证器）
solana-test-validator --reset
anchor test
```

## 项目结构

```
Nexum-B/
├── programs/
│   ├── nexum_pool/              # 主结算程序（16 条指令）
│   │   └── src/
│   │       ├── instructions/    # 发起、接受、执行、取消、存入、提取...
│   │       └── state/           # UserLedger, CommitSlot, VersionSlot, SettlementRecord...
│   └── zk_verifier/            # 链上 Groth16 BN254 验证器
├── sdk/
│   └── src/
│       ├── crypto/              # ElGamal, 承诺哈希, 监管密钥
│       ├── scheme_b/            # 结算流程 SDK 函数
│       └── workers/             # 浏览器 ZK 证明生成（snarkjs WASM）
├── circuits/
│   └── balance_transition_private.circom  # 12,778 约束隐私电路
├── app/
│   └── src/
│       ├── pages/               # 交易终端、监管室、做市商、首页
│       └── hooks/               # useSchemeB 状态机
└── tests/                       # 单元 + 端到端测试套件（65 项）
```

## 对 Solana 生态的贡献

1. **Groth16 在 Solana 上已具备生产条件。** 使用 `sol_alt_bn128_pairing` 在约 400K CU 内验证双重 BN254 证明。
2. **加密状态是实用的。** 994 字节 UserLedger 模型表明链上加密状态可以大规模工作。
3. **机构 OTC 需要在 Solana 上有归宿。** Nexum 将隐私、可审计性和原子结算带到链上。
4. **金库模型开创了新的 DeFi 范式。** 具有加密内部记账的共享国库金库为暗池和私有 AMM 奠定了基础。

---

<p align="center">
  <em>Built for institutions that do not yet trust one another.</em><br/>
  <em>为尚不互信的机构而建。</em>
</p>
