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
  <a href="README_CN.md">中文版</a>
</p>

---

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
