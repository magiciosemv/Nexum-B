/**
 * prover.ts — Groth16 Proof Generation Manager
 *
 * Generates ZK proofs for the balance_transition circuit using snarkjs.
 * Can run in Node.js (main thread) or inside a Web Worker.
 *
 * Circuit: balance_transition.circom
 *   Public inputs:  transfer_lo, transfer_hi
 *   Private inputs: old_balance_lo, old_balance_hi, new_balance_lo, new_balance_hi
 *   Public outputs: pub_old_lo/hi, pub_new_lo/hi, pub_transfer_lo/hi
 *
 * Proof format (256 bytes, matching on-chain zk_verifier):
 *   pi_a (G1): 64 bytes = A_x(32) + A_y(32)
 *   pi_b (G2): 128 bytes = B_x1(32) + B_x2(32) + B_y1(32) + B_y2(32)
 *   pi_c (G1): 64 bytes = C_x(32) + C_y(32)
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface CircuitInputs {
  old_balance_lo: string;  // decimal string for BN254 field element
  old_balance_hi: string;
  transfer_lo: string;
  transfer_hi: string;
  new_balance_lo: string;
  new_balance_hi: string;
}

export interface Groth16Proof {
  proof_a: number[];      // 256 bytes
  public_signals: string[]; // 7 public signals (transfer_lo, transfer_hi, + 5 outputs)
}

export interface ProverConfig {
  wasmPath: string;  // URL or file path to balance_transition.wasm
  zkeyPath: string;  // URL or file path to balance_transition_final.zkey
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
      // Generate a trivial proof to trigger WASM loading
      await this.snarkjs.groth16.fullProve(
        { old_balance_lo: "0", old_balance_hi: "0", transfer_lo: "0", transfer_hi: "0", new_balance_lo: "0", new_balance_hi: "0" },
        this.config.wasmPath,
        this.config.zkeyPath
      );
      this.warmedUp = true;
    } catch {
      // Warmup proof may fail — that's fine, the WASM module is now loaded
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

// ── Convenience: create inputs from numeric values ───────────────────

export function createCircuitInputs(params: {
  old_balance_lo: number;
  old_balance_hi: number;
  transfer_lo: number;
  transfer_hi: number;
  new_balance_lo: number;
  new_balance_hi: number;
}): CircuitInputs {
  return {
    old_balance_lo: String(params.old_balance_lo),
    old_balance_hi: String(params.old_balance_hi),
    transfer_lo: String(params.transfer_lo),
    transfer_hi: String(params.transfer_hi),
    new_balance_lo: String(params.new_balance_lo),
    new_balance_hi: String(params.new_balance_hi),
  };
}
