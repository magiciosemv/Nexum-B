<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana&logoColor=white" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-2CE1F6?logo=rust&logoColor=white" alt="Anchor 0.32.1" />
  <img src="https://img.shields.io/badge/ZK-Groth16%20%2B%20BN254-8B5CF6" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/%E6%B5%8B%E8%AF%95-55%20%E2%9C%93-brightgreen" alt="55 Tests Pass" />
  <img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF%E8%AF%81-ISC-blue" alt="ISC License" />
</p>

<h1 align="center">Nexum Protocol — Scheme B v3.0</h1>

<p align="center">
  <strong>基于 Solana 的隐私保护 OTC 结算协议</strong><br/>
  零知识证明 &middot; ElGamal 同态加密余额 &middot; 对称双锁机制
</p>

---

## 项目简介

Nexum 是一个基于 Solana 的隐私保护 OTC（场外交易）数字资产结算协议。它允许双方在不向链上暴露余额明文的情况下原子性地交换资产，使用 Groth16 零知识证明和 Baby Jubjub ElGamal 同态加密确保隐私与正确性。

**Scheme B v3.0** 是面向半信任对手方的生产级结算流程，具备以下核心特性：

- **对称双锁（Symmetric Dual-Locking）** — 双方余额同时锁定，消除「免费期权」问题，即一方在对方承诺前观察市场变动的不对称优势。
- **承诺锚点（Commitment Anchor）** — SHA-256 承诺哈希存储在链上作为防篡改证据，将发起方绑定到特定转账金额。
- **零知识证明（Zero-Knowledge Proofs）** — 每方生成 Groth16 证明，在不暴露余额值的前提下证明 `old_balance = new_balance + transfer`。
- **加密余额（Encrypted Balances**）— 余额变动通过 Baby Jubjub ElGamal 加密。链上仅存储密文，明文金额永远不会上链。
- **超时安全（Timeout Safety）** — 自动取消路径保护双方免受对手方无响应的风险。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端 (React + Vite + Tailwind CSS)                         │
│  settle-b.tsx  │  maker-dashboard.tsx  │  钱包适配器         │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK (@nexum/scheme-b-sdk)                       │
│  scheme_b/     │  crypto/    │  workers/  │  listeners/     │
├─────────────────────────────────────────────────────────────┤
│  Solana 链上程序 (Anchor)                                    │
│  nexum_pool (主程序)         │  zk_verifier (CPI 目标)       │
├─────────────────────────────────────────────────────────────┤
│  ZK 电路 (Circom)                                           │
│  balance_transition.circom — Scheme A 和 B 共用              │
└─────────────────────────────────────────────────────────────┘
```

### 链上程序

| 程序 | 地址 | 说明 |
|------|------|------|
| `nexum_pool` | `BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P` | 主结算协议 — 账本管理、提交/接受/执行/取消指令 |
| `zk_verifier` | `AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi` | Groth16 BN254 配对验证，通过 `sol_alt_bn128_pairing` 系统调用 |

### 三步结算流程

```
  发起方                          区块链                         对手方
    │                              │                              │
    │──── initiate_commit ────────>│                              │
    │   (锁定 Ledger A,             │                              │
    │    创建 CommitSlot)           │                              │
    │                              │<──── accept_commit ──────────│
    │                              │   (同时锁定双方账本,           │
    │                              │    PendingInitiator→BothPending│
    │                              │    Active→PendingCounterparty) │
    │<────────────────── 双方已锁定 ──────────────────────────────>│
    │                              │                              │
    │──── execute_settle_b ──────>│                              │
    │   (双份 ZK 证明 +              │                              │
    │    ElGamal 密文,               │                              │
    │    承诺哈希验证,                │                              │
    │    ~400K CU)                   │                              │
    │                              │                              │
    │<─────── 结算完成 ─────────────┴──────────────────────────────>│
             双方账本 → Active
```

**超时分支：**
- `cancel_initiate` — 发起方在对手方 60 秒内未响应时取消。
- `cancel_mutual` — 双锁后 120 秒内未执行时，任一方可取消。

### ZK 电路

`balance_transition.circom` 电路证明核心不变量：

```
old_balance = new_balance + transfer_amount
```

- **公开输入**：`transfer_lo`、`transfer_hi`（转账金额的低/高 32 位）
- **私密输入**：`old_balance_lo/hi`、`new_balance_lo/hi`（余额的低/高 32 位）
- **证明系统**：Groth16 on BN254 曲线（每份证明约 256 字节）
- **链上验证**：通过 `sol_alt_bn128_pairing` 系统调用进行双证明验证（约 400K 计算单元）

### 链上数据账户

| 账户 | 大小 | PDA 种子 | 用途 |
|------|------|---------|------|
| `UserLedger` | 738 B | `["ledger", owner, mint]` | 用户-资产余额状态 + 加密余额 |
| `CommitSlot` | 202 B | `["cslot", ledger_a, nonce_le8]` | 单笔结算的承诺哈希锚点 |
| `ProofData` | 1,537 B | `["proofs", nonce_le8]` | 双份 ZK 证明 + ElGamal 密文存储 |
| `VersionSlot` | 98 B | `["vslot", ledger, slot_index_le8]` | 做市商并行证明生成 |
| `ProtocolConfig` | 67 B | `["nexum_config"]` | 全局时间参数（单例） |
| `SettlementRecord` | 130 B | `["settlement", commit_slot, nonce_le8]` | 永久结算凭证 |

### 时间参数

| 参数 | 值 | 说明 |
|------|------|------|
| `min_init_window` | 30 秒 | 发起有效期下限 |
| `max_init_window` | 60 秒 | 发起有效期上限 |
| `execute_window` | 120 秒 | 双锁后执行窗口 |
| `clock_tolerance` | 5 秒 | Solana 时钟偏差容忍 |
| `max_version_slots` | 20 | 每账本最大并发版本槽 |

## 项目结构

```
Nexum-B/
├── programs/
│   ├── nexum_pool/               # 主 Anchor 程序 (Scheme A + B)
│   │   └── src/
│   │       ├── instructions/     # 11 个指令处理器
│   │       ├── state/            # 6 种账户类型
│   │       └── utils/            # 承诺哈希计算
│   └── zk_verifier/              # Groth16 验证程序
│       └── src/
│           ├── lib.rs            # verify_proof — BN254 配对检查
│           └── vk.rs             # 自动生成的验证密钥
├── sdk/
│   └── src/
│       ├── scheme_b/             # initiate, accept, execute, cancel
│       ├── crypto/               # 承诺哈希、ElGamal 加密
│       ├── workers/              # 浏览器端 ZK 证明器 (snarkjs WASM)
│       └── listeners/            # WebSocket 提交槽监听器
├── app/                          # React 前端
│   └── src/
│       ├── pages/                # settle-b.tsx, maker-dashboard.tsx
│       ├── hooks/                # useSchemeB — 状态机
│       ├── context/              # 钱包提供者
│       └── public/circuits/      # WASM + zkey（浏览器端证明生成）
├── circuits/
│   ├── balance_transition.circom # ZK 电路源码
│   └── build/                    # 编译产物 (r1cs, wasm, zkey, vk)
├── tests/
│   ├── commitment_consistency.test.ts  # 6 个测试
│   ├── elgamal.test.ts                 # 7 个测试
│   ├── worker_prover.test.ts           # 7 个测试
│   └── e2e/                            # 13 个测试
│       ├── scheme_b_basic.ts           # 5 个测试 — 完整流程
│       ├── scheme_b_timeout.ts         # 3 个测试 — 取消分支
│       ├── version_slots.ts            # 3 个测试 — 并发
│       └── zk_verifier.test.ts         # 5 个测试（含篡改证明）
└── scripts/
    ├── devnet-full-flow.ts       # CLI：完整三步 devnet 流程
    ├── devnet-unlock.sh          # CLI：取消卡住的双锁
    └── generate_vk.ts           # 构建：重新生成 VK 常量
```

## 快速开始

### 环境要求

| 工具 | 版本 | 备注 |
|------|------|------|
| Node.js | v20.x | 已测试 v20.20.0 |
| Rust | 1.89.0 | 通过 rust-toolchain.toml 指定 |
| Solana CLI | ≥ 1.18 | 本地验证器和部署 |
| Anchor | 0.32.1 | `avm install 0.32.1 && avm use 0.32.1` |
| circom | 2.2.3 | 仅在修改电路时需要 |
| pnpm | ≥ 8.x | 前端包管理器 |

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/Nexum-B.git
cd Nexum-B

# 安装根目录依赖
npm install

# 安装前端依赖
cd app && pnpm install && cd ..

# 构建 Solana 程序（BPF 编译需要大栈空间）
RUST_MIN_STACK=2147483648 anchor build
```

### 运行测试

```bash
# Rust 单元测试（19 个测试）
cargo test -p nexum_pool      # 18 个测试
cargo test -p zk_verifier     # 1 个测试

# TypeScript 单元测试（20 个测试，顺序执行以避免 WSL2 WASM 段错误）
bash scripts/run_unit_tests.sh

# 单独运行各测试套件
npx ts-node tests/commitment_consistency.test.ts   # 6 个测试
npx ts-node tests/elgamal.test.ts                  # 7 个测试
NODE_PATH=/全局/node_modules路径 npx ts-node tests/worker_prover.test.ts  # 7 个测试

# 端到端测试（需要本地验证器）
solana-test-validator --reset                        # 终端 1
anchor program deploy -p nexum_pool                  # 终端 2
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/e2e/scheme_b_basic.ts
```

### 启动前端

```bash
cd app
pnpm dev
# 打开 http://localhost:5175
```

连接配置为 devnet 的 Solana 钱包（推荐 Phantom）。结算页面提供发起方/对手方双面板界面。

### Devnet 测试（CLI）

在 devnet 上验证完整流程的最快方式：

```bash
# 运行完整三步流程（含真实 ZK 证明）
NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
  npx ts-node scripts/devnet-full-flow.ts

# 取消卡住的账本（上次运行失败时使用）
bash scripts/devnet-unlock.sh
```

## 密码学细节

### 承诺哈希

SHA-256 哈希，输入为 120 字节缓冲区：

```
偏移   长度   字段
0      8 B    nonce (u64 LE)
8      4 B    transfer_amount_lo (u32 LE)
12     4 B    transfer_amount_hi (u32 LE)
16     32 B   asset_a_mint (PublicKey)
48     32 B   asset_b_mint (PublicKey)
80     32 B   counterparty (PublicKey)
112    8 B    expiry_timestamp (i64 LE)
```

Rust 程序和 TypeScript SDK 生成完全相同的哈希值。跨语言一致性通过 6 个专用测试和共享测试向量验证。

### ElGamal 加密

- **曲线**：Baby Jubjub（嵌入 BN254）
- **方案**：Twisted ElGamal — `C₁ = r·G`, `C₂ = r·P + m·G`
- **密文大小**：128 字节（2 个点 × 64 字节打包）
- **解密**：Baby-step Giant-step 算法恢复 u32 离散对数
- **依赖库**：`@zk-kit/baby-jubjub` 曲线运算

### 证明序列化

Groth16 证明序列化为 256 字节（BN254 点格式）：

```
[ProofA_x: 32B] [ProofA_y: 32B]
[ProofB_x_c1: 32B] [ProofB_x_c0: 32B] [ProofB_y_c1: 32B] [ProofB_y_c0: 32B]
[ProofC_x: 32B] [ProofC_y: 32B]
```

G2 坐标遵循 EIP-197 排序（虚部 c1 在实部 c0 之前）。链上验证前，Proof A 的 y 坐标使用 BN254 基域模数 Fp 取反。

## 版本槽（做市商并发）

做市商可每个账本预留最多 20 个 `VersionSlot` PDA，实现并行 ZK 证明生成以支持高吞吐结算。证明基于乐观假设（前置结算成功）并行生成；若任一中间槽失败，后续证明将重新生成（每次约 4 秒）。

## 测试结果

全部 **55 个测试** 通过，覆盖 6 个测试套件：

| 套件 | 测试数 | 类型 |
|------|--------|------|
| nexum_pool Rust 单元测试 | 18 | Anchor 程序逻辑 |
| zk_verifier Rust 单元测试 | 1 | BN254 配对检查 |
| 承诺哈希一致性 | 6 | 跨语言 SHA-256 |
| ElGamal 加密 | 7 | Baby Jubjub 加密/解密 |
| Worker 证明器 | 7 | snarkjs Groth16 证明生成 |
| E2E: scheme_b_basic | 5 | 完整三步流程 |
| E2E: scheme_b_timeout | 3 | 取消分支 + 哈希不匹配 |
| E2E: version_slots | 3 | 余额链 + PDA 一致性 |
| E2E: zk_verifier | 5 | 有效、篡改、错误输入、平凡、值不匹配 |
| **合计** | **55** | |

## 技术栈

| 层级 | 技术 |
|------|------|
| 智能合约 | Anchor (Rust), Solana BPF |
| ZK 证明 | Circom 2.2.3, snarkjs 0.7.6, Groth16/BN254 |
| 加密 | Baby Jubjub ElGamal (@zk-kit/baby-jubjub) |
| SDK | TypeScript, @coral-xyz/anchor, @solana/web3.js |
| 前端 | React 18, Vite 6, Tailwind CSS 3, TypeScript |
| 钱包 | @solana/wallet-adapter (Phantom, Solflare) |

## 安全考量

- **链上无余额明文** — 所有余额变动均经 ElGamal 加密；仅验证正确性证明（old = new + transfer）。
- **承诺哈希绑定** — 发起方在对手方接受前即被密码学绑定到转账金额。
- **对称锁定** — 双方同时锁定，不存在价格操纵的观察窗口。
- **超时安全** — 自动取消防止资金无限期锁定。
- **Groth16 证明完整性** — 通过 Solana 原生 `sol_alt_bn128_pairing` 系统调用进行链上 BN254 配对验证；全零（平凡）证明被快速拒绝。

## 许可证

ISC 许可证。详见 [LICENSE](LICENSE)。

---

<p align="center">
  基于 <a href="https://solana.com">Solana</a> 构建的零知识结算协议
</p>
