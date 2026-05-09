/**
 * prover.ts — Groth16 Proof Generation Manager
 *
 * Generates ZK proofs for the balance_transition_private circuit using snarkjs.
 * All balance/amount values are PRIVATE. Only commitment_hash is public.
 *
 * Circuit: balance_transition_private.circom
 *   Public inputs:  commitment_hash_lo, commitment_hash_hi (two 128-bit limbs)
 *   Private inputs: old_balance_lo/hi, transfer_lo/hi, new_balance_lo/hi,
 *                   nonce_bits[64], asset_a_mint_bytes[32], asset_b_mint_bytes[32],
 *                   counterparty_bytes[32], expiry_bits[64]
 *   Public outputs: none
 *
 * Proof format (256 bytes, matching on-chain zk_verifier):
 *   pi_a (G1): 64 bytes = A_x(32) + A_y(32)
 *   pi_b (G2): 128 bytes = B_x1(32) + B_x2(32) + B_y1(32) + B_y2(32)
 *   pi_c (G1): 64 bytes = C_x(32) + C_y(32)
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CircuitInputs {
  old_balance_lo: string;
  old_balance_hi: string;
  new_balance_lo: string;
  new_balance_hi: string;
  swap_amount_lo: string;   // This party's actual transfer amount (balance constraint)
  swap_amount_hi: string;
  transfer_lo: string;       // Party A's amount (preimage-only, canonical)
  transfer_hi: string;
  transfer_b_lo: string;     // Party B's amount (preimage-only, canonical)
  transfer_b_hi: string;
  nonce_bits: string[];
  asset_a_mint_bytes: string[];
  asset_b_mint_bytes: string[];
  counterparty_bytes: string[];
  expiry_bits: string[];
  commitment_hash_lo: string;
  commitment_hash_hi: string;
}

export interface Groth16Proof {
  proof_a: number[];      // 256 bytes
  public_signals: string[]; // 2 public signals (commitment_hash_lo, commitment_hash_hi)
}

export interface ProverConfig {
  wasmPath: string;  // URL or file path to balance_transition_private.wasm
  zkeyPath: string;  // URL or file path to balance_transition_private_final.zkey
}

// ── Proof serialization ──────────────────────────────────────────────

/**
 * Convert a BN254 field element (decimal string) to 32-byte big-endian array.
 */
function fieldToBytes32(fieldStr: string): number[] {
  // Remove any surrounding quotes or whitespace
  const cleaned = fieldStr.replace(/"/g, "").trim();

  // Handle modular arithmetic — BN254 field modulus
  // snarkjs may return values like "21888...xxx" which are already reduced
  let value: bigint;
  try {
    value = BigInt(cleaned);
  } catch {
    throw new Error(`Invalid field element: "${cleaned}"`);
  }

  const p = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  if (value < 0n) {
    value = value + p;
  }

  const bytes: number[] = [];
  let v = value;
  for (let i = 0; i < 32; i++) {
    bytes.unshift(Number(v & 0xFFn));
    v >>= 8n;
  }
  return bytes;
}

/**
 * Serialize a Groth16 proof from snarkjs format to 256 bytes.
 *
 * snarkjs output:
 *   pi_a: ["x", "y"]
 *   pi_b: [["x1", "x2"], ["y1", "y2"]]
 *   pi_c: ["x", "y"]
 *
 * On-chain format (256 bytes, EIP-197 G2 order — c1 before c0):
 *   A_x(32) + A_y(32) + B_x_c1(32) + B_x_c0(32) + B_y_c1(32) + B_y_c0(32) + C_x(32) + C_y(32)
 *
 * snarkjs pi_b: [[x_c0, x_c1], [y_c0, y_c1]]
 * EIP-197/Solana BN254: c1(imaginary) before c0(real) for each Fp² coordinate.
 */
export function serializeProof(
  pi_a: string[],
  pi_b: string[][],
  pi_c: string[]
): number[] {
  const a_x = fieldToBytes32(pi_a[0]);
  const a_y = fieldToBytes32(pi_a[1]);
  // G2: snarkjs gives [c0, c1], Solana expects [c1, c0] per coordinate
  const b_x_c0 = fieldToBytes32(pi_b[0][0]);
  const b_x_c1 = fieldToBytes32(pi_b[0][1]);
  const b_y_c0 = fieldToBytes32(pi_b[1][0]);
  const b_y_c1 = fieldToBytes32(pi_b[1][1]);
  const c_x = fieldToBytes32(pi_c[0]);
  const c_y = fieldToBytes32(pi_c[1]);

  return [...a_x, ...a_y, ...b_x_c1, ...b_x_c0, ...b_y_c1, ...b_y_c0, ...c_x, ...c_y];
}

// ── Prover Manager ───────────────────────────────────────────────────

export class ProverManager {
  private config: ProverConfig;
  private snarkjs: any = null;
  private warmedUp = false;

  constructor(config: ProverConfig) {
    this.config = config;
  }

  /**
   * Initialize the prover by loading snarkjs.
   * Must be called before generateProof.
   * Includes retry logic for intermittent WASM initialization failures (WSL2).
   */
  async init(): Promise<void> {
    if (this.snarkjs) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const snarkjs = require("snarkjs");

    if (!snarkjs || !snarkjs.groth16) {
      throw new Error("snarkjs loaded but groth16 not found. Check snarkjs version.");
    }

    this.snarkjs = snarkjs;
  }

  /**
   * Warmup: trigger WASM module loading with a trivial proof.
   * Call this early to avoid segfaults during critical operations.
   */
  async warmup(): Promise<void> {
    if (this.warmedUp) return;
    await this.init();
    try {
      const warmupInputs = createPrivateCircuitInputs({
        old_balance_lo: 0, old_balance_hi: 0,
        new_balance_lo: 0, new_balance_hi: 0,
        swap_amount_lo: 0, swap_amount_hi: 0,
        transfer_lo: 0, transfer_hi: 0,
        transfer_b_lo: 0, transfer_b_hi: 0,
        nonce: 0n,
        asset_a_mint: new Uint8Array(32),
        asset_b_mint: new Uint8Array(32),
        counterparty: new Uint8Array(32),
        expiry: 0,
      });
      await this.snarkjs.groth16.fullProve(
        warmupInputs,
        this.config.wasmPath,
        this.config.zkeyPath
      );
      this.warmedUp = true;
    } catch {
      this.warmedUp = true;
    }
  }

  /**
   * Generate a Groth16 proof for the balance_transition circuit.
   * Includes retry logic (up to 2 retries) for intermittent WASM failures.
   *
   * @param inputs - Circuit inputs (all values as decimal strings)
   * @returns Serialized 256-byte proof + public signals
   */
  async generateProof(inputs: CircuitInputs): Promise<Groth16Proof> {
    if (!this.snarkjs) {
      await this.init();
    }

    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const { proof, publicSignals } = await this.snarkjs.groth16.fullProve(
          inputs,
          this.config.wasmPath,
          this.config.zkeyPath
        );

        const proofBytes = serializeProof(proof.pi_a, proof.pi_b, proof.pi_c);

        if (proofBytes.length !== 256) {
          throw new Error(`Proof serialization error: expected 256 bytes, got ${proofBytes.length}`);
        }

        return {
          proof_a: proofBytes,
          public_signals: publicSignals.map((s: any) => String(s)),
        };
      } catch (err: any) {
        lastError = err;
        // Only retry on WASM initialization errors or segfault-like failures
        const isRetryable = err.message?.includes("malloc") ||
          err.message?.includes("wasm") ||
          err.message?.includes("abort") ||
          err.message?.includes("OOM") ||
          err.code === "ERR_MODULE_NOT_FOUND";
        if (!isRetryable || attempt === maxRetries) break;
        // Brief delay before retry
        await new Promise(r => setTimeout(r, 500));
      }
    }

    throw lastError;
  }

  /**
   * Verify a proof locally (off-chain) before submitting on-chain.
   * Uses the verification key to check the Groth16 proof.
   */
  async verifyProof(
    proofBytes: number[],
    publicSignals: string[],
    vkey: any
  ): Promise<boolean> {
    if (!this.snarkjs) {
      await this.init();
    }

    // Reconstruct snarkjs proof format from 256 bytes (EIP-197 order)
    // This is the inverse of serializeProof: G2 bytes are [c1, c0] per coordinate
    const proof = {
      pi_a: [
        bytesToField(proofBytes, 0),
        bytesToField(proofBytes, 32),
      ],
      pi_b: [
        // bytes 64=x_c1, 96=x_c0 → snarkjs wants [x_c0, x_c1]
        [bytesToField(proofBytes, 96), bytesToField(proofBytes, 64)],
        // bytes 128=y_c1, 160=y_c0 → snarkjs wants [y_c0, y_c1]
        [bytesToField(proofBytes, 160), bytesToField(proofBytes, 128)],
      ],
      pi_c: [
        bytesToField(proofBytes, 192),
        bytesToField(proofBytes, 224),
      ],
      protocol: "groth16",
      curve: "bn128",
    };

    return await this.snarkjs.groth16.verify(vkey, publicSignals, proof);
  }
}

// ── Helper: bytes to field element string ────────────────────────────

function bytesToField(bytes: number[], offset: number): string {
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(bytes[offset + i]);
  }
  return value.toString();
}

// ── Convenience: create inputs for the private circuit ────────────────

/** Convert a u64/i64 value to an array of 64 bits (LSB-first). */
function toBits64(val: bigint | number): string[] {
  const v = BigInt(val);
  return Array.from({ length: 64 }, (_, i) => String(Number((v >> BigInt(i)) & 1n)));
}

/** Split SHA-256 hash (32 bytes) into two 128-bit field elements. */
export function splitHashToLimbs(hash: Uint8Array): { lo: bigint; hi: bigint } {
  if (hash.length !== 32) throw new Error("Hash must be 32 bytes");
  const hi = BigInt("0x" + Buffer.from(hash.subarray(0, 16)).toString("hex"));
  const lo = BigInt("0x" + Buffer.from(hash.subarray(16, 32)).toString("hex"));
  return { lo, hi };
}

export interface PrivateCircuitParams {
  old_balance_lo: number;
  old_balance_hi: number;
  new_balance_lo: number;
  new_balance_hi: number;
  swap_amount_lo: number;   // This party's actual transfer amount (balance constraint)
  swap_amount_hi: number;
  transfer_lo: number;       // Party A's amount (preimage-only, canonical)
  transfer_hi: number;
  transfer_b_lo: number;     // Party B's amount (preimage-only, canonical)
  transfer_b_hi: number;
  nonce: bigint;
  asset_a_mint: Uint8Array;
  asset_b_mint: Uint8Array;
  counterparty: Uint8Array;
  expiry: number;
}

export function createPrivateCircuitInputs(params: PrivateCircuitParams): CircuitInputs {
  const { old_balance_lo, old_balance_hi, new_balance_lo, new_balance_hi,
    swap_amount_lo, swap_amount_hi,
    transfer_lo, transfer_hi, transfer_b_lo, transfer_b_hi,
    nonce, asset_a_mint, asset_b_mint, counterparty, expiry } = params;

  // Build 128-byte preimage (v3.1 layout with transfer_b)
  const preimage = Buffer.alloc(128);
  preimage.writeBigUInt64LE(nonce, 0);
  preimage.writeUInt32LE(transfer_lo, 8);
  preimage.writeUInt32LE(transfer_hi, 12);
  preimage.writeUInt32LE(transfer_b_lo, 16);
  preimage.writeUInt32LE(transfer_b_hi, 20);
  preimage.set(asset_a_mint, 24);
  preimage.set(asset_b_mint, 56);
  preimage.set(counterparty, 88);
  preimage.writeInt32LE(expiry & 0xFFFFFFFF, 120);
  preimage.writeInt32LE(Math.floor(expiry / 0x100000000), 124);

  // Compute SHA-256 commitment hash
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256").update(preimage).digest();
  const { lo: hashLo, hi: hashHi } = splitHashToLimbs(hash);

  return {
    old_balance_lo: String(old_balance_lo),
    old_balance_hi: String(old_balance_hi),
    new_balance_lo: String(new_balance_lo),
    new_balance_hi: String(new_balance_hi),
    swap_amount_lo: String(swap_amount_lo),
    swap_amount_hi: String(swap_amount_hi),
    transfer_lo: String(transfer_lo),
    transfer_hi: String(transfer_hi),
    transfer_b_lo: String(transfer_b_lo),
    transfer_b_hi: String(transfer_b_hi),
    nonce_bits: toBits64(nonce),
    asset_a_mint_bytes: Array.from(asset_a_mint).map(String),
    asset_b_mint_bytes: Array.from(asset_b_mint).map(String),
    counterparty_bytes: Array.from(counterparty).map(String),
    expiry_bits: toBits64(expiry),
    commitment_hash_lo: hashLo.toString(),
    commitment_hash_hi: hashHi.toString(),
  };
}

/** @deprecated Use createPrivateCircuitInputs for Scheme B (private circuit) */
export function createCircuitInputs(params: {
  old_balance_lo: number;
  old_balance_hi: number;
  transfer_lo: number;
  transfer_hi: number;
  new_balance_lo: number;
  new_balance_hi: number;
}): { old_balance_lo: string; old_balance_hi: string; transfer_lo: string; transfer_hi: string; new_balance_lo: string; new_balance_hi: string } {
  return {
    old_balance_lo: String(params.old_balance_lo),
    old_balance_hi: String(params.old_balance_hi),
    transfer_lo: String(params.transfer_lo),
    transfer_hi: String(params.transfer_hi),
    new_balance_lo: String(params.new_balance_lo),
    new_balance_hi: String(params.new_balance_hi),
  };
}
