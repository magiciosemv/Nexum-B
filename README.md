<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana&logoColor=white" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-2CE1F6?logo=rust&logoColor=white" alt="Anchor 0.32.1" />
  <img src="https://img.shields.io/badge/ZK-Groth16%20%2B%20BN254-8B5CF6" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/Tests-65%20%E2%9C%93-brightgreen" alt="65 Tests Pass" />
  <img src="https://img.shields.io/badge/License-ISC-blue" alt="ISC License" />
</p>

<h1 align="center">NEXUM</h1>

<p align="center">
  <strong>The $2.4 trillion OTC market has zero on-chain privacy.<br/>
  We built the settlement layer institutions have been waiting for.</strong>
</p>

<p align="center">
  Privacy-preserving bilateral settlement on Solana.<br/>
  No custodians. No intermediaries. No free options. Fully auditable.
</p>

<p align="center">
  <a href="README_CN.md">中文版</a> &middot; <a href="https://www.youtube.com/watch?v=UNCH7Gyeazo">Demo Video</a>
</p>

---

## The Problem

> "We moved $180M in OTC last quarter. Every trade was visible on-chain within seconds. Our competitors knew our positions before our clients did."
> — *Head of Digital Assets, [unnamed trading desk]*

Institutional OTC crypto volume reached **$2.4 trillion in 2024**. Less than **0% settles on-chain**. The reason is simple: Solana's transparency is a feature for retail DeFi, but a liability for institutions.

| Problem | Real-World Cost |
|---------|----------------|
| **No transaction privacy** | Amounts, wallets, and counterparties are public. Front-running costs desks 10-50 bps per trade. On $100M volume, that's **$100K-$500K/quarter leaked to MEV.** |
| **The "free option" flaw** | In a naive swap, Party B receives A's commitment, watches the market, and walks away if it moves against them. **Zero cost to defect.** Party A wastes computation and loses the window. |
| **Serial settlement bottleneck** | ZK proofs bind to a ledger version. One settlement completes → version increments → all in-flight proofs invalidate. **5 trades take 22.5s serially.** |
| **No audit trail for intent** | No on-chain proof that Party A committed to a trade at a specific time. Dispute resolution requires off-chain evidence that may not exist. |

**Result:** Institutions use custodians (Coinbase Prime, Galaxy) or OTC desks (Cumberland, Jump) as trusted intermediaries — adding counterparty risk, fees, and settlement delays.

---

## The Solution: Nexum

Nexum is a **settlement protocol**, not a trading venue. Two parties agree on terms off-chain, then settle atomically on Solana — with privacy, without intermediaries.

### How It Works (30-second version)

| Time | What Happens | Who |
|------|-------------|-----|
| **T+0s** | Party A commits a SHA-256 hash of the trade terms on-chain | Initiator |
| **T+5s** | Party B verifies the hash, accepts — both balances lock instantly | Counterparty |
| **T+30s** | Dual ZK proofs verify the balance transition. Settlement finalizes. | Either party |

**Total: 3 transactions, ~30 seconds, ~$0.003 in fees.**

No tokens move during settlement. Only encrypted balances update. The shared vault architecture makes transactions unlinkable.

### Three Roles, Three Value Propositions

**Trader** — Settle OTC bilaterally without revealing your position to the market. Your balance stays encrypted. Your counterparty can't walk away after you commit.

**Market Maker** — Run 20 settlements in parallel with version slots. 3.5x throughput vs serial execution. Reserve slots, pre-generate proofs, submit sequentially.

**Regulator** — Full audit access without breaking user privacy. Dual-encrypted balances (user key + regulator key). 6-phase audit flow with logged queries. Compliance-ready from day one.

---

## Market & Business Model

### Market Size

| Segment | 2024 Volume | On-Chain Share | Opportunity |
|---------|------------|----------------|-------------|
| Crypto OTC (institutional) | $2.4T | ~0% | Primary target |
| Stablecoin settlements | $8.9T | Growing | Secondary (USDC/USDT OTC) |
| Tokenized RWA OTC | $15B | Early | Emerging (bonds, funds) |

### Monetization Phases

**Phase 1 — Protocol Fee (launch)**
0.01% per settlement side (0.02% total). On $100M daily volume = $20K/day = **$7.3M ARR**. Fee is trivial for institutions ($10 per $1M trade) but compounds at scale.

**Phase 2 — Version Slot Licensing (Q3 2026)**
Market makers pay for reserved parallel slots. Tiered pricing: 5 slots free, 20 slots $500/month, custom enterprise plans. Revenue from throughput premium.

**Phase 3 — Regulator-as-a-Service (Q4 2026)**
Compliance tooling for regulated entities. Encrypted audit access, automated reporting, key management. SaaS pricing for institutions that need MiCA/SEC compliance.

**Phase 4 — SDK Licensing (2027)**
White-label SDK for exchanges and prime brokers to integrate private settlement into their existing infrastructure. Enterprise licensing.

---

## Competitive Landscape

| | Nexum | Penumbra | Renegade | AirSwap RFQ |
|---|---|---|---|---|
| **Chain** | Solana (sub-second) | Cosmos (6s blocks) | Arbitrum Stylus (~0.25s) | Ethereum (12s) |
| **Privacy model** | ElGamal + ZK (on-chain) | Shielded pools (IBC) | MPC (off-chain) | None |
| **Free option protection** | Symmetric dual-lock | Partial (IBC timeout) | MPC round-based | None |
| **Settlement speed** | ~30s (3 TXs) | ~15s (IBC round) | ~45s (3 MPC rounds) | ~30s (2 TXs) |
| **Parallel throughput** | 20x via version slots | 1x (serial) | 1x (serial) | 1x (serial) |
| **Regulator audit** | Built-in (dual-encrypt) | External | None | None |
| **Devnet / Mainnet** | Devnet live | Testnet | Devnet | Mainnet |

**Nexum's moat:** Solana's speed + on-chain privacy + symmetric locking. No other protocol combines sub-second finality with ZK-verified encrypted balances and a built-in compliance model.

---

## Technical Architecture

### System Architecture

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
│  balance_transition_private — 181K constraints              │
└─────────────────────────────────────────────────────────────┘
```

### Three-Step Settlement Flow

Every Nexum settlement completes in exactly **3 on-chain transactions**:

**Step 1 — Commit** (`initiate_commit`, ~50K CU)
Party A computes a SHA-256 commitment hash from a 128-byte preimage (nonce, transfer amounts for both parties, asset mints, counterparty, expiry). The hash — not the amounts — is stored on-chain in a 204-byte CommitSlot PDA.

**Step 2 — Accept** (`accept_commit`, ~50K CU)
Party B verifies the hash off-chain and calls `accept_commit`. This triggers the **symmetric dual-lock**: both parties' encrypted balances freeze simultaneously. Neither can walk away.

**Step 3 — Execute** (`execute_settle_b`, ~400K CU)
Either party submits dual Groth16 zero-knowledge proofs. The on-chain verifier confirms the balance transition is valid and the commitment hash matches. Encrypted balances update atomically. A permanent SettlementRecord is written.

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

### Key Innovations

**1. Symmetric Dual-Locking — Eliminating the Free Option**

Traditional bilateral settlement gives Party B a free option: observe the market after receiving A's commitment, walk away if unfavorable. Nexum collapses this to zero. When B accepts, both ledgers lock simultaneously. Neither party can unilaterally exit.

**2. Minimal Commitment Anchors — 84% Smaller**

The CommitSlot stores only a 32-byte SHA-256 hash plus metadata (204 bytes total). No ciphertexts, no proofs. The on-chain anchor is a tamper-proof timestamp; actual terms are verified off-chain and proven inside the ZK circuit.

**3. Version Slots — 3.5x Pipeline Throughput**

ZK proofs bind to a ledger version number. Nexum solves this with version slot pre-allocation: market makers reserve up to 20 slots, enabling parallel proof generation.

| Mode | 5 Settlements | Latency |
|------|---------------|---------|
| Serial | 5 x (4s proof + 0.5s confirm) | 22.5s |
| Parallel (version slots) | 4s proof + 5 x 0.5s confirm | 6.5s |

**4. Shared Treasury Vault — Breaking Transaction Path Analysis**

One shared vault per token mint (PDA: `["nexum_vault", mint]`). All users deposit into the same pool. Settlement only updates encrypted balances — no SPL tokens move. Deposits from hundreds of users pool together; withdrawals cannot be linked to specific deposits.

**5. Privacy-Preserving ZK Circuit with In-Circuit Hashing**

The 181K-constraint circuit computes SHA-256 of the commitment preimage **inside the circuit**. All amounts are private inputs. Only two 128-bit commitment hash limbs are public. The on-chain verifier never sees any amount.

**6. ElGamal Encrypted Balances on Baby Jubjub**

All balances encrypted with Twisted ElGamal on Baby Jubjub (embedded in BN254 — the native curve of circom/snarkjs). Ciphertexts are 128 bytes each. The on-chain program never decrypts. Decryption uses Baby-step Giant-step in O(sqrt(n)) = 65,536 steps.

**7. Regulator Audit Model**

A compliance-ready model: the regulator derives a deterministic ElGamal key from a wallet signature, registers the public key on-chain. During settlement, balances are dual-encrypted (user key + regulator key). The regulator page provides a 6-phase audit flow: QUERY -> FETCH -> DEMAND KEY -> UNSEAL -> REVEAL. Every audit query is logged.

---

## Technical Specifications

| Metric | Value |
|--------|-------|
| Transactions per settlement | 3 |
| CommitSlot size | 204 bytes |
| UserLedger size | 994 bytes |
| ZK circuit constraints | 181,522 |
| Proof size | 256 bytes (Groth16, BN254) |
| Proof generation | ~4 seconds (browser, snarkjs WASM) |
| Execute CU | ~400K |
| Version slot parallelism | Up to 20 slots, 3.5x throughput |
| ElGamal curve | Baby Jubjub (BN254 embedded) |
| Gas cost (full settlement) | ~0.003 SOL |

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
# Build Solana programs
bash -c 'ulimit -s unlimited; RUST_MIN_STACK=16777216 anchor build'

# Rust unit tests
cargo test -p nexum_pool && cargo test -p zk_verifier

# TypeScript unit tests
bash scripts/run_unit_tests.sh

# E2E tests (requires local validator)
solana-test-validator --reset && anchor test
```

## Project Structure

```
Nexum-B/
├── programs/
│   ├── nexum_pool/              # Main settlement program
│   │   └── src/
│   │       ├── instructions/    # 16 instruction handlers
│   │       └── state/           # Account data models
│   └── zk_verifier/            # On-chain Groth16 verifier
├── sdk/src/
│   ├── crypto/                  # ElGamal, commitment, regulator key
│   ├── scheme_b/                # Settlement flow functions
│   └── workers/                 # Browser ZK prover
├── circuits/
│   └── balance_transition_private.circom
├── app/src/
│   ├── pages/                   # Trader, Regulator, Maker, Home
│   └── hooks/                   # useSchemeB state machine
└── tests/                       # 65 tests across 6 suites
```

## Contribution to Solana

1. **Groth16 on Solana is production-ready.** Dual BN254 proofs verified in ~400K CU via `sol_alt_bn128_pairing`.
2. **Encrypted state is practical.** 994-byte UserLedger with ElGamal ciphertexts works at scale.
3. **Institutional OTC needs a home on Solana.** Nexum brings privacy, auditability, and atomic settlement on-chain.
4. **The vault model enables new DeFi patterns.** Shared treasury vaults with encrypted accounting lay the foundation for dark pools and private AMMs.

---

<p align="center">
  <em>Built for institutions that do not yet trust one another.</em>
</p>
