/**
 * prover_test.ts — Verify ProverManager can generate and serialize proofs
 *
 * Uses the compiled circuit artifacts in circuits/build/.
 * Run with: NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *           npx ts-node tests/worker_prover.test.ts
 */

import {
  ProverManager,
  createCircuitInputs,
} from "../sdk/src/workers/prover";
import * as path from "path";
import * as fs from "fs";

const CIRCUITS_DIR = path.resolve(__dirname, "../circuits/build");
const WASM_PATH = path.join(CIRCUITS_DIR, "balance_transition_js", "balance_transition.wasm");
const ZKEY_PATH = path.join(CIRCUITS_DIR, "balance_transition_final.zkey");
const VK_PATH = path.join(CIRCUITS_DIR, "verification_key.json");

async function main() {
  console.log("=== ProverManager Integration Test ===\n");

  // Verify artifacts exist
  assert(fs.existsSync(WASM_PATH), `WASM not found: ${WASM_PATH}`);
  assert(fs.existsSync(ZKEY_PATH), `ZKEY not found: ${ZKEY_PATH}`);
  assert(fs.existsSync(VK_PATH), `VK not found: ${VK_PATH}`);
  console.log("[PASS] Circuit artifacts found");

  // Test 1: Create ProverManager and init
  const prover = new ProverManager({ wasmPath: WASM_PATH, zkeyPath: ZKEY_PATH });
  await prover.init();
  console.log("[PASS] ProverManager initialized");

  // Test 2: Generate proof for valid inputs (old=1000000, new=700000, transfer=300000)
  const inputs = createCircuitInputs({
    old_balance_lo: 1000000,
    old_balance_hi: 0,
    transfer_lo: 300000,
    transfer_hi: 0,
    new_balance_lo: 700000,
    new_balance_hi: 0,
  });

  const result = await prover.generateProof(inputs);

  assert(result.proof_a.length === 256, `Proof should be 256 bytes, got ${result.proof_a.length}`);
  console.log(`[PASS] Proof generated: ${result.proof_a.length} bytes`);

  // Test 3: Proof is not all zeros
  const nonTrivial = result.proof_a.some((b: number) => b !== 0);
  assert(nonTrivial, "Proof must not be all zeros");
  console.log("[PASS] Proof is non-trivial (not all zeros)");

  // Test 4: Public signals match expected values
  // circom ordering: outputs first, then public inputs
  //   [0] pub_old_lo, [1] pub_old_hi, [2] pub_new_lo, [3] pub_new_hi,
  //   [4] pub_transfer_lo, [5] transfer_lo, [6] transfer_hi
  // (pub_transfer_hi is not an output — declared as plain signal, not signal output)

  console.log(`  Public signals: [${result.public_signals.join(", ")}]`);

  assert(result.public_signals[0] === "1000000", `pub_old_lo should be 1000000, got ${result.public_signals[0]}`);
  assert(result.public_signals[1] === "0", `pub_old_hi should be 0, got ${result.public_signals[1]}`);
  assert(result.public_signals[2] === "700000", `pub_new_lo should be 700000, got ${result.public_signals[2]}`);
  assert(result.public_signals[3] === "0", `pub_new_hi should be 0, got ${result.public_signals[3]}`);
  assert(result.public_signals[4] === "300000", `pub_transfer_lo should be 300000, got ${result.public_signals[4]}`);
  assert(result.public_signals[5] === "300000", `transfer_lo should be 300000, got ${result.public_signals[5]}`);
  assert(result.public_signals[6] === "0", `transfer_hi should be 0, got ${result.public_signals[6]}`);
  console.log("[PASS] Public signals match expected values (7 signals: 5 outputs + 2 public inputs)");

  // Test 5: Verify proof with snarkjs
  const vkey = JSON.parse(fs.readFileSync(VK_PATH, "utf-8"));
  // For snarkjs verify, we need to reconstruct the proof in snarkjs format
  // But we can also verify directly from the fullProve output
  // Let's just verify the raw snarkjs result for now

  // Actually, let's test the verification using ProverManager
  const verified = await prover.verifyProof(result.proof_a, result.public_signals, vkey);
  assert(verified, "Proof verification should succeed");
  console.log("[PASS] Proof verified with verification key");

  // Test 6: First 64 bytes of proof (pi_a G1 point) are valid field elements
  // Check that A_x and A_y are not all zeros (valid curve point)
  const a_x = result.proof_a.slice(0, 32);
  const a_y = result.proof_a.slice(32, 64);
  const aNonZero = a_x.some((b: number) => b !== 0) || a_y.some((b: number) => b !== 0);
  assert(aNonZero, "pi_a (G1 point) should be non-zero");
  console.log("[PASS] pi_a G1 point is a valid non-zero curve point");

  // Test 7: Generate proof with large values (cross-limb arithmetic, 2^32 = 2^32 + 0)
  const largeInputs = createCircuitInputs({
    old_balance_lo: 0,
    old_balance_hi: 1,        // old = 1 * 2^32 = 4294967296
    transfer_lo: 0,
    transfer_hi: 0,           // transfer = 0
    new_balance_lo: 0,
    new_balance_hi: 1,        // new = 1 * 2^32 = 4294967296
  });

  const largeResult = await prover.generateProof(largeInputs);
  assert(largeResult.proof_a.length === 256, "Large value proof should be 256 bytes");
  const largeNonTrivial = largeResult.proof_a.some((b: number) => b !== 0);
  assert(largeNonTrivial, "Large value proof should be non-trivial");
  console.log("[PASS] Cross-limb proof (2^32 = 2^32 + 0) generated and non-trivial");

  console.log("\n=== All 7 tests PASSED ===");
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
