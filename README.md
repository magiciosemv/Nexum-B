<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-14F195?logo=solana&logoColor=white" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.32.1-2CE1F6?logo=rust&logoColor=white" alt="Anchor 0.32.1" />
  <img src="https://img.shields.io/badge/ZK-Groth16%20%2B%20BN254-8B5CF6" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/Tests-55%20%E2%9C%93-brightgreen" alt="55 Tests Pass" />
  <img src="https://img.shields.io/badge/License-ISC-blue" alt="ISC License" />
</p>

<h1 align="center">Nexum Protocol — Scheme B v3.0</h1>

<p align="center">
  <strong>Privacy-Preserving OTC Settlement on Solana</strong><br/>
  Zero-knowledge proofs &middot; ElGamal encrypted balances &middot; Symmetric dual-locking
</p>

---

## Overview

Nexum is a Solana-based private OTC (Over-the-Counter) digital asset settlement protocol. It enables two parties to atomically swap assets without revealing their balance amounts on-chain, using Groth16 zero-knowledge proofs and Baby Jubjub ElGamal homomorphic encryption.

**Scheme B v3.0** is the production-grade settlement flow designed for partially-trusted counterparties. It features:

- **Symmetric Dual-Locking** — Both parties' balances are locked simultaneously, eliminating the "free option" problem where one party can observe market movement before committing.
- **Commitment Anchors** — A SHA-256 commitment hash is stored on-chain as tamper-proof evidence, binding the initiator to a specific transfer amount.
- **Zero-Knowledge Proofs** — Each party generates a Groth16 proof proving `old_balance = new_balance + transfer` without revealing any balance values.
- **Encrypted Balances** — Balance transitions are encrypted via Baby Jubjub ElGamal. On-chain stores only ciphertexts; plaintext amounts never touch the blockchain.
- **Timeout Safety** — Automatic cancellation paths protect both parties if the counterparty becomes unresponsive.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + Tailwind CSS)                     │
│  settle-b.tsx  │  maker-dashboard.tsx  │  Wallet Adapter    │
├─────────────────────────────────────────────────────────────┤
│  TypeScript SDK (@nexum/scheme-b-sdk)                       │
│  scheme_b/     │  crypto/    │  workers/  │  listeners/     │
├─────────────────────────────────────────────────────────────┤
│  Solana Programs (Anchor)                                   │
│  nexum_pool (main)          │  zk_verifier (CPI target)     │
├─────────────────────────────────────────────────────────────┤
│  ZK Circuit (Circom)                                        │
│  balance_transition.circom — shared by Scheme A and B       │
└─────────────────────────────────────────────────────────────┘
```

### Smart Contracts

| Program | Address | Description |
|---------|---------|-------------|
| `nexum_pool` | `BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P` | Main settlement protocol — ledger management, commit/accept/execute/cancel instructions |
| `zk_verifier` | `AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi` | Groth16 BN254 pairing verification via `sol_alt_bn128_pairing` syscall |

### Three-Step Settlement Flow

```
 Initiator                        Chain                       Counterparty
     │                              │                              │
     │──── initiate_commit ────────>│                              │
     │   (lock Ledger A,            │                              │
     │    create CommitSlot)         │                              │
     │                              │<──── accept_commit ──────────│
     │                              │   (dual-lock both ledgers,   │
     │                              │    PendingInitiator → Both    │
     │                              │    Pending, Active →          │
     │                              │    PendingCounterparty)       │
     │<────────────────── Both Locked ─────────────────────────────>│
     │                              │                              │
     │──── execute_settle_b ──────>│                              │
     │   (dual ZK proofs +          │                              │
     │    ElGamal ciphertexts,       │                              │
     │    commitment hash verify,    │                              │
     │    ~400K CU)                  │                              │
     │                              │                              │
     │<─────── Settlement Complete ─┴──────────────────────────────>│
              Both ledgers → Active
```

**Timeout branches:**
- `cancel_initiate` — Initiator cancels if counterparty doesn't respond within 60 seconds.
- `cancel_mutual` — Either party cancels if execution doesn't occur within 120 seconds after dual-lock.

### ZK Circuit

The `balance_transition.circom` circuit proves the core invariant:

```
old_balance = new_balance + transfer_amount
```

- **Public inputs**: `transfer_lo`, `transfer_hi` (the transfer amount in two u32 limbs)
- **Private inputs**: `old_balance_lo/hi`, `new_balance_lo/hi` (balances in u32 limbs)
- **Proof system**: Groth16 on BN254 curve (~256 bytes per proof)
- **On-chain verification**: Dual-proof verification via `sol_alt_bn128_pairing` syscall (~400K compute units)

### On-Chain Data Accounts

| Account | Size | PDA Seeds | Purpose |
|---------|------|-----------|---------|
| `UserLedger` | 738 B | `["ledger", owner, mint]` | Per-user per-asset balance state + encrypted balances |
| `CommitSlot` | 202 B | `["cslot", ledger_a, nonce_le8]` | Commitment hash anchor for a single settlement |
| `ProofData` | 1,537 B | `["proofs", nonce_le8]` | Dual ZK proofs + ElGamal ciphertexts storage |
| `VersionSlot` | 98 B | `["vslot", ledger, slot_index_le8]` | Parallel proof generation for market makers |
| `ProtocolConfig` | 67 B | `["nexum_config"]` | Global timing parameters (singleton) |
| `SettlementRecord` | 130 B | `["settlement", commit_slot, nonce_le8]` | Permanent settlement evidence |

### Timing Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `min_init_window` | 30 s | Minimum validity window for initiate |
| `max_init_window` | 60 s | Maximum validity window for initiate |
| `execute_window` | 120 s | Time to execute after dual-lock |
| `clock_tolerance` | 5 s | Solana clock skew tolerance |
| `max_version_slots` | 20 | Maximum concurrent version slots per ledger |

## Project Structure

```
Nexum-B/
├── programs/
│   ├── nexum_pool/               # Main Anchor program (Scheme A + B)
│   │   └── src/
│   │       ├── instructions/     # 11 instruction handlers
│   │       ├── state/            # 6 account types
│   │       └── utils/            # Commitment hash computation
│   └── zk_verifier/              # Groth16 verification program
│       └── src/
│           ├── lib.rs            # verify_proof — BN254 pairing check
│           └── vk.rs             # Auto-generated verification key
├── sdk/
│   └── src/
│       ├── scheme_b/             # initiate, accept, execute, cancel
│       ├── crypto/               # Commitment hash, ElGamal encryption
│       ├── workers/              # Browser ZK prover (snarkjs WASM)
│       └── listeners/            # WebSocket commit slot listener
├── app/                          # React frontend
│   └── src/
│       ├── pages/                # settle-b.tsx, maker-dashboard.tsx
│       ├── hooks/                # useSchemeB — state machine
│       ├── context/              # Wallet provider
│       └── public/circuits/      # WASM + zkey for browser proof gen
├── circuits/
│   ├── balance_transition.circom # ZK circuit source
│   └── build/                    # Compiled artifacts (r1cs, wasm, zkey, vk)
├── tests/
│   ├── commitment_consistency.test.ts  # 6 tests
│   ├── elgamal.test.ts                 # 7 tests
│   ├── worker_prover.test.ts           # 7 tests
│   └── e2e/                            # 13 tests
│       ├── scheme_b_basic.ts           # 5 tests — full flow
│       ├── scheme_b_timeout.ts         # 3 tests — cancel branches
│       ├── version_slots.ts            # 3 tests — concurrency
│       └── zk_verifier.test.ts         # 5 tests (including tampered proof)
└── scripts/
    ├── devnet-full-flow.ts       # CLI: complete 3-step devnet flow
    ├── devnet-unlock.sh          # CLI: cancel stuck dual-locks
    └── generate_vk.ts           # Build: regenerate VK constants
```

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v20.x | v20.20.0 tested |
| Rust | 1.89.0 | Via rust-toolchain.toml |
| Solana CLI | ≥ 1.18 | For local validator and deployment |
| Anchor | 0.32.1 | `avm install 0.32.1 && avm use 0.32.1` |
| circom | 2.2.3 | Only needed if modifying the circuit |
| pnpm | ≥ 8.x | Package manager for app |

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/Nexum-B.git
cd Nexum-B

# Install root dependencies
npm install

# Install frontend dependencies
cd app && pnpm install && cd ..

# Build Solana programs (requires large stack for BPF)
RUST_MIN_STACK=2147483648 anchor build
```

### Running Tests

```bash
# Rust unit tests (19 tests)
cargo test -p nexum_pool      # 18 tests
cargo test -p zk_verifier     # 1 test

# TypeScript unit tests (20 tests, run sequentially to avoid WSL2 WASM segfault)
bash scripts/run_unit_tests.sh

# Individual test suites
npx ts-node tests/commitment_consistency.test.ts   # 6 tests
npx ts-node tests/elgamal.test.ts                  # 7 tests
NODE_PATH=/path/to/global/node_modules npx ts-node tests/worker_prover.test.ts  # 7 tests

# E2E tests (requires local validator)
solana-test-validator --reset                        # Terminal 1
anchor program deploy -p nexum_pool                  # Terminal 2
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
  ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/e2e/scheme_b_basic.ts
```

### Running the Frontend

```bash
cd app
pnpm dev
# Open http://localhost:5175
```

Connect a Solana wallet (Phantom recommended) configured for devnet. The settlement page provides a two-panel interface for initiator and counterparty.

### Devnet Testing (CLI)

The fastest way to verify the full flow on devnet:

```bash
# Run the complete 3-step flow with real ZK proofs
NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
  npx ts-node scripts/devnet-full-flow.ts

# Cancel stuck ledgers if a previous run failed
bash scripts/devnet-unlock.sh
```

## Cryptographic Details

### Commitment Hash

SHA-256 of a 120-byte buffer:

```
Offset  Length  Field
0       8 B     nonce (u64 LE)
8       4 B     transfer_amount_lo (u32 LE)
12      4 B     transfer_amount_hi (u32 LE)
16      32 B    asset_a_mint (PublicKey)
48      32 B    asset_b_mint (PublicKey)
80      32 B    counterparty (PublicKey)
112     8 B     expiry_timestamp (i64 LE)
```

Both the Rust program and TypeScript SDK produce identical hashes. Cross-language consistency is verified by 6 dedicated tests with a shared test vector.

### ElGamal Encryption

- **Curve**: Baby Jubjub (embedded in BN254)
- **Scheme**: Twisted ElGamal — `C₁ = r·G`, `C₂ = r·P + m·G`
- **Ciphertext size**: 128 bytes (2 points × 64 bytes packed)
- **Decryption**: Baby-step Giant-step for u32 discrete log recovery
- **Library**: `@zk-kit/baby-jubjub` for curve operations

### Proof Serialization

Groth16 proofs are serialized to 256 bytes (BN254 point format):

```
[ProofA_x: 32B] [ProofA_y: 32B]
[ProofB_x_c1: 32B] [ProofB_x_c0: 32B] [ProofB_y_c1: 32B] [ProofB_y_c0: 32B]
[ProofC_x: 32B] [ProofC_y: 32B]
```

G2 coordinates follow EIP-197 ordering (c1 imaginary before c0 real). Proof A's y-coordinate is negated using the BN254 base field modulus Fp before on-chain verification.

## Version Slots (Market Maker Concurrency)

Market makers can reserve up to 20 `VersionSlot` PDAs per ledger, enabling parallel ZK proof generation for high-throughput settlement. Proofs are generated optimistically assuming prior settlements succeed; if any intermediate slot fails, subsequent proofs are regenerated (~4 seconds each).

## Test Results

All **55 tests** pass across 6 test suites:

| Suite | Tests | Type |
|-------|-------|------|
| nexum_pool Rust unit tests | 18 | Anchor program logic |
| zk_verifier Rust unit tests | 1 | BN254 pairing check |
| Commitment hash consistency | 6 | Cross-language SHA-256 |
| ElGamal encryption | 7 | Baby Jubjub encrypt/decrypt |
| Worker prover | 7 | snarkjs Groth16 proof generation |
| E2E: scheme_b_basic | 5 | Full 3-step flow |
| E2E: scheme_b_timeout | 3 | Cancel branches + hash mismatch |
| E2E: version_slots | 3 | Balance chain + PDA consistency |
| E2E: zk_verifier | 5 | Valid, tampered, wrong inputs, trivial, mismatched |
| **Total** | **55** | |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Anchor (Rust), Solana BPF |
| ZK Proofs | Circom 2.2.3, snarkjs 0.7.6, Groth16/BN254 |
| Encryption | Baby Jubjub ElGamal (@zk-kit/baby-jubjub) |
| SDK | TypeScript, @coral-xyz/anchor, @solana/web3.js |
| Frontend | React 18, Vite 6, Tailwind CSS 3, TypeScript |
| Wallet | @solana/wallet-adapter (Phantom, Solflare) |

## Security Considerations

- **No plaintext balances on-chain** — All balance transitions are ElGamal encrypted; only the proof of correctness (old = new + transfer) is verified.
- **Commitment hash binding** — Initiator is cryptographically bound to the transfer amount before counterparty accepts.
- **Symmetric locking** — Both parties locked simultaneously; no observation window for price manipulation.
- **Timeout safety** — Automatic cancellation prevents indefinite fund lockup.
- **Groth16 proof integrity** — On-chain BN254 pairing verification via Solana's native `sol_alt_bn128_pairing` syscall; trivial (all-zeros) proofs fast-rejected.

## License

ISC License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ZK proofs on <a href="https://solana.com">Solana</a>
</p>
