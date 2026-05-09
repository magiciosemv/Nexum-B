/**
 * zk_verifier isolation test — DEFECT-004
 *
 * Directly tests the zk_verifier program's verify_proof instruction
 * with real Groth16 proofs (private circuit) and adversarial inputs.
 *
 * Private circuit: 2 public inputs (commitment_hash_lo, commitment_hash_hi)
 *
 * Test cases:
 * 1. Real valid proof → PASS
 * 2. Tampered proof (flipped byte) → FAIL
 * 3. Wrong public inputs (mismatched hash) → FAIL
 * 4. Zero/trivial proof → FAIL (TrivialProof)
 * 5. Valid proof for different preimage → FAIL
 *
 * Requires: local validator running, programs deployed.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { assert } from "chai";
import { ProverManager, createPrivateCircuitInputs } from "../../sdk/src/workers/prover";
import path from "path";
import * as fs from "fs";

const ZK_IDL: Idl = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../target/idl/zk_verifier.json"), "utf-8")
);

describe("zk_verifier — Isolation Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(ZK_IDL, provider);
  let prover: ProverManager;

  // Shared test parameters
  const TRANSFER_A_LO = 1000000;
  const TRANSFER_A_HI = 0;
  const TRANSFER_B_LO = 500000;
  const TRANSFER_B_HI = 0;
  const NONCE = BigInt(Date.now());
  const EXPIRY = Math.floor(Date.now() / 1000) + 60;
  const ASSET_A = new Uint8Array(32);
  const ASSET_B = new Uint8Array(32);
  const COUNTERPARTY = new Uint8Array(32);

  before(async () => {
    const projectRoot = path.resolve(__dirname, "../..");
    prover = new ProverManager({
      wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
      zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
    });
    await prover.init();
  });

  it("Test 1: Real valid proof → PASS", async () => {
    const inputs = createPrivateCircuitInputs({
      old_balance_lo: TRANSFER_A_LO, old_balance_hi: TRANSFER_A_HI,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: TRANSFER_A_LO, swap_amount_hi: TRANSFER_A_HI,
      transfer_lo: TRANSFER_A_LO, transfer_hi: TRANSFER_A_HI,
      transfer_b_lo: TRANSFER_B_LO, transfer_b_hi: TRANSFER_B_HI,
      nonce: NONCE, asset_a_mint: ASSET_A, asset_b_mint: ASSET_B,
      counterparty: COUNTERPARTY, expiry: EXPIRY,
    });
    const proof = await prover.generateProof(inputs);

    const sig = await program.methods
      .verifyProof(
        Array.from(proof.proof_a),
        new anchor.BN(proof.public_signals[0]),
        new anchor.BN(proof.public_signals[1])
      )
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
      .rpc();

    assert.isString(sig, "verifyProof must return a transaction signature");
    assert.isAbove(sig.length, 0, "Transaction signature must not be empty");
  });

  it("Test 2: Tampered proof (flipped byte) → FAIL", async () => {
    const inputs = createPrivateCircuitInputs({
      old_balance_lo: TRANSFER_A_LO, old_balance_hi: TRANSFER_A_HI,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: TRANSFER_A_LO, swap_amount_hi: TRANSFER_A_HI,
      transfer_lo: TRANSFER_A_LO, transfer_hi: TRANSFER_A_HI,
      transfer_b_lo: TRANSFER_B_LO, transfer_b_hi: TRANSFER_B_HI,
      nonce: NONCE, asset_a_mint: ASSET_A, asset_b_mint: ASSET_B,
      counterparty: COUNTERPARTY, expiry: EXPIRY,
    });
    const proof = await prover.generateProof(inputs);

    const tamperedProof = [...proof.proof_a];
    tamperedProof[42] ^= 0xFF;

    try {
      await program.methods
        .verifyProof(
          tamperedProof,
          new anchor.BN(proof.public_signals[0]),
          new anchor.BN(proof.public_signals[1])
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Tampered proof should have failed");
    } catch (e: any) {
      assert.include(e.message, "ProofVerificationFailed", "Should fail with ProofVerificationFailed");
    }
  });

  it("Test 3: Wrong public inputs (mismatched hash) → FAIL", async () => {
    const inputs = createPrivateCircuitInputs({
      old_balance_lo: TRANSFER_A_LO, old_balance_hi: TRANSFER_A_HI,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: TRANSFER_A_LO, swap_amount_hi: TRANSFER_A_HI,
      transfer_lo: TRANSFER_A_LO, transfer_hi: TRANSFER_A_HI,
      transfer_b_lo: TRANSFER_B_LO, transfer_b_hi: TRANSFER_B_HI,
      nonce: NONCE, asset_a_mint: ASSET_A, asset_b_mint: ASSET_B,
      counterparty: COUNTERPARTY, expiry: EXPIRY,
    });
    const proof = await prover.generateProof(inputs);

    // Submit with WRONG hash (increment lo by 1)
    const wrongLo = new anchor.BN(proof.public_signals[0]).add(new anchor.BN(1));
    try {
      await program.methods
        .verifyProof(
          Array.from(proof.proof_a),
          wrongLo,
          new anchor.BN(proof.public_signals[1])
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Wrong public inputs should have failed");
    } catch (e: any) {
      assert.include(e.message, "ProofVerificationFailed", "Should fail with ProofVerificationFailed");
    }
  });

  it("Test 4: Zero/trivial proof → FAIL (TrivialProof)", async () => {
    const zeroProof = new Array(256).fill(0);

    try {
      await program.methods
        .verifyProof(
          zeroProof,
          new anchor.BN(0),
          new anchor.BN(0)
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Zero proof should have been rejected");
    } catch (e: any) {
      assert.include(e.message, "TrivialProof", "Should fail with TrivialProof");
    }
  });

  it("Test 5: Valid proof used for different preimage → FAIL", async () => {
    // Generate proof for one preimage
    const inputs = createPrivateCircuitInputs({
      old_balance_lo: 500000, old_balance_hi: 0,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: 500000, swap_amount_hi: 0,
      transfer_lo: 500000, transfer_hi: 0,
      transfer_b_lo: 300000, transfer_b_hi: 0,
      nonce: NONCE, asset_a_mint: ASSET_A, asset_b_mint: ASSET_B,
      counterparty: COUNTERPARTY, expiry: EXPIRY,
    });
    const proof = await prover.generateProof(inputs);

    // Submit with a DIFFERENT preimage's hash (from Test 1)
    const otherInputs = createPrivateCircuitInputs({
      old_balance_lo: TRANSFER_A_LO, old_balance_hi: TRANSFER_A_HI,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: TRANSFER_A_LO, swap_amount_hi: TRANSFER_A_HI,
      transfer_lo: TRANSFER_A_LO, transfer_hi: TRANSFER_A_HI,
      transfer_b_lo: TRANSFER_B_LO, transfer_b_hi: TRANSFER_B_HI,
      nonce: NONCE, asset_a_mint: ASSET_A, asset_b_mint: ASSET_B,
      counterparty: COUNTERPARTY, expiry: EXPIRY,
    });
    const otherProof = await prover.generateProof(otherInputs);

    try {
      await program.methods
        .verifyProof(
          Array.from(proof.proof_a),
          new anchor.BN(otherProof.public_signals[0]),
          new anchor.BN(otherProof.public_signals[1])
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Proof for different preimage should have failed");
    } catch (e: any) {
      assert.include(e.message, "ProofVerificationFailed", "Should fail with ProofVerificationFailed");
    }
  });
});
