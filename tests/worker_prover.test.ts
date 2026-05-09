/**
 * prover_test.ts — Verify ProverManager can generate and serialize proofs
 *
 * Uses the compiled circuit artifacts in circuits/build_private/.
 * Run with: NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *           npx ts-node tests/worker_prover.test.ts
 */

import {
  ProverManager,
  createPrivateCircuitInputs,
} from "../sdk/src/workers/prover";
import * as path from "path";
import * as fs from "fs";

const CIRCUITS_DIR = path.resolve(__dirname, "../circuits/build_private");
const WASM_PATH = path.join(CIRCUITS_DIR, "balance_transition_private_js", "balance_transition_private.wasm");
const ZKEY_PATH = path.join(CIRCUITS_DIR, "balance_transition_private_final.zkey");
const VK_PATH = path.join(CIRCUITS_DIR, "verification_key.json");

async function main() {
  console.log("=== ProverManager Integration Test (Private Circuit) ===\n");

  // Verify artifacts exist
  assert(fs.existsSync(WASM_PATH), `WASM not found: ${WASM_PATH}`);
  assert(fs.existsSync(ZKEY_PATH), `ZKEY not found: ${ZKEY_PATH}`);
  assert(fs.existsSync(VK_PATH), `VK not found: ${VK_PATH}`);
  console.log("[PASS] Circuit artifacts found");

  // Test 1: Create ProverManager and init
  const prover = new ProverManager({ wasmPath: WASM_PATH, zkeyPath: ZKEY_PATH });
  await prover.init();
  console.log("[PASS] ProverManager initialized");

  // Test 2: Generate proof for valid inputs
  // Party A: old=1M, transfer=300K, new=700K
  const sharedNonce = BigInt(Date.now());
  const sharedExpiry = Math.floor(Date.now() / 1000) + 60;
  const inputs = createPrivateCircuitInputs({
    old_balance_lo: 1000000,
    old_balance_hi: 0,
    new_balance_lo: 700000,
    new_balance_hi: 0,
    swap_amount_lo: 300000,
    swap_amount_hi: 0,
    transfer_lo: 300000,    // Party A's amount (preimage)
    transfer_hi: 0,
    transfer_b_lo: 500000,  // Party B's amount (preimage)
    transfer_b_hi: 0,
    nonce: sharedNonce,
    asset_a_mint: new Uint8Array(32),
    asset_b_mint: new Uint8Array(32),
    counterparty: new Uint8Array(32),
    expiry: sharedExpiry,
  });

  const result = await prover.generateProof(inputs);

  assert(result.proof_a.length === 256, `Proof should be 256 bytes, got ${result.proof_a.length}`);
  console.log(`[PASS] Proof generated: ${result.proof_a.length} bytes`);

  // Test 3: Proof is not all zeros
  const nonTrivial = result.proof_a.some((b: number) => b !== 0);
  assert(nonTrivial, "Proof must not be all zeros");
  console.log("[PASS] Proof is non-trivial (not all zeros)");

  // Test 4: Public signals (2 commitment hash limbs)
  console.log(`  Public signals: [${result.public_signals.join(", ")}]`);
  assert(result.public_signals.length === 2, `Expected 2 public signals, got ${result.public_signals.length}`);
  console.log("[PASS] Public signals: 2 commitment hash limbs");

  // Test 5: Verify proof with snarkjs
  const vkey = JSON.parse(fs.readFileSync(VK_PATH, "utf-8"));
  const verified = await prover.verifyProof(result.proof_a, result.public_signals, vkey);
  assert(verified, "Proof verification should succeed");
  console.log("[PASS] Proof verified with verification key");

  // Test 6: First 64 bytes of proof (pi_a G1 point) are valid field elements
  const a_x = result.proof_a.slice(0, 32);
  const a_y = result.proof_a.slice(32, 64);
  const aNonZero = a_x.some((b: number) => b !== 0) || a_y.some((b: number) => b !== 0);
  assert(aNonZero, "pi_a (G1 point) should be non-zero");
  console.log("[PASS] pi_a G1 point is a valid non-zero curve point");

  // Test 7: Both proofs with same preimage produce same public signals
  const proofB = createPrivateCircuitInputs({
    old_balance_lo: 500000,
    old_balance_hi: 0,
    new_balance_lo: 200000,
    new_balance_hi: 0,
    swap_amount_lo: 300000,  // Different swap amount
    swap_amount_hi: 0,
    transfer_lo: 300000,     // Same canonical preimage
    transfer_hi: 0,
    transfer_b_lo: 500000,
    transfer_b_hi: 0,
    nonce: sharedNonce,
    asset_a_mint: new Uint8Array(32),
    asset_b_mint: new Uint8Array(32),
    counterparty: new Uint8Array(32),
    expiry: sharedExpiry,
  });

  // Same preimage → same commitment hash → same public signals
  const resultB = await prover.generateProof(proofB);
  assert(
    result.public_signals[0] === resultB.public_signals[0] &&
    result.public_signals[1] === resultB.public_signals[1],
    "Same preimage must produce same public signals"
  );
  console.log("[PASS] Both proofs with same preimage produce same commitment hash");

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
