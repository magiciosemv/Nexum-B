/**
 * zk_verifier isolation test — DEFECT-004
 *
 * Directly tests the zk_verifier program's verify_proof instruction
 * with real Groth16 proofs and adversarial inputs.
 *
 * Test cases:
 * 1. Real valid proof → PASS
 * 2. Tampered proof (flipped byte) → FAIL
 * 3. Wrong public inputs (mismatched old_balance) → FAIL
 * 4. Zero/trivial proof → FAIL (TrivialProof)
 * 5. Valid proof for different values → FAIL
 *
 * Requires: local validator running, programs deployed.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { assert } from "chai";
import { ProverManager, createCircuitInputs } from "../../sdk/src/workers/prover";
import path from "path";
import * as fs from "fs";

// Use the real compiled IDL — hand-written IDL lacks Anchor coder structure
const ZK_IDL: Idl = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../target/idl/zk_verifier.json"), "utf-8")
);

describe("zk_verifier — Isolation Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Anchor 0.32.1: 2-arg constructor, programId read from IDL's address field
  const program = new Program(ZK_IDL, provider);

  // Prover setup
  let prover: ProverManager;

  // Test vector: old=1000000, new=0, transfer=1000000
  const OLD_LO = 1000000;
  const OLD_HI = 0;
  const NEW_LO = 0;
  const NEW_HI = 0;
  const TRANSFER_LO = 1000000;
  const TRANSFER_HI = 0;

  before(async () => {
    const projectRoot = path.resolve(__dirname, "../..");
    prover = new ProverManager({
      wasmPath: path.join(projectRoot, "circuits/build/balance_transition_js/balance_transition.wasm"),
      zkeyPath: path.join(projectRoot, "circuits/build/balance_transition_final.zkey"),
    });
    await prover.init();
  });

  it("Test 1: Real valid proof → PASS", async () => {
    const proof = await prover.generateProof(
      createCircuitInputs({
        old_balance_lo: OLD_LO,
        old_balance_hi: OLD_HI,
        new_balance_lo: NEW_LO,
        new_balance_hi: NEW_HI,
        transfer_lo: TRANSFER_LO,
        transfer_hi: TRANSFER_HI,
      })
    );

    await program.methods
      .verifyProof(
        Array.from(proof.proof_a),
        TRANSFER_LO,
        TRANSFER_HI,
        OLD_LO,
        OLD_HI,
        NEW_LO,
        NEW_HI
      )
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
      .rpc();

    // If we get here, proof verification passed
    assert.isTrue(true, "Real proof should pass pairing check");
  });

  it("Test 2: Tampered proof (flipped byte) → FAIL", async () => {
    const proof = await prover.generateProof(
      createCircuitInputs({
        old_balance_lo: OLD_LO,
        old_balance_hi: OLD_HI,
        new_balance_lo: NEW_LO,
        new_balance_hi: NEW_HI,
        transfer_lo: TRANSFER_LO,
        transfer_hi: TRANSFER_HI,
      })
    );

    // Flip a byte in the proof to break the pairing
    const tamperedProof = [...proof.proof_a];
    tamperedProof[42] ^= 0xFF; // flip byte at index 42 (inside proof_a y-coordinate)

    try {
      await program.methods
        .verifyProof(
          tamperedProof,
          TRANSFER_LO,
          TRANSFER_HI,
          OLD_LO,
          OLD_HI,
          NEW_LO,
          NEW_HI
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Tampered proof should have failed");
    } catch (e: any) {
      assert.include(
        e.message,
        "ProofVerificationFailed",
        "Should fail with ProofVerificationFailed"
      );
    }
  });

  it("Test 3: Wrong public inputs (mismatched old_balance) → FAIL", async () => {
    const proof = await prover.generateProof(
      createCircuitInputs({
        old_balance_lo: OLD_LO,
        old_balance_hi: OLD_HI,
        new_balance_lo: NEW_LO,
        new_balance_hi: NEW_HI,
        transfer_lo: TRANSFER_LO,
        transfer_hi: TRANSFER_HI,
      })
    );

    // Submit with WRONG old_lo (999999 instead of 1000000)
    try {
      await program.methods
        .verifyProof(
          Array.from(proof.proof_a),
          TRANSFER_LO,
          TRANSFER_HI,
          999999, // WRONG
          OLD_HI,
          NEW_LO,
          NEW_HI
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Wrong public inputs should have failed");
    } catch (e: any) {
      assert.include(
        e.message,
        "ProofVerificationFailed",
        "Should fail with ProofVerificationFailed"
      );
    }
  });

  it("Test 4: Zero/trivial proof → FAIL (TrivialProof)", async () => {
    const zeroProof = new Array(256).fill(0);

    try {
      await program.methods
        .verifyProof(
          zeroProof,
          TRANSFER_LO,
          TRANSFER_HI,
          OLD_LO,
          OLD_HI,
          NEW_LO,
          NEW_HI
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Zero proof should have been rejected");
    } catch (e: any) {
      assert.include(
        e.message,
        "TrivialProof",
        "Should fail with TrivialProof"
      );
    }
  });

  it("Test 5: Valid proof used for different values → FAIL", async () => {
    // Generate proof for: old=500000, new=0, transfer=500000
    const proof = await prover.generateProof(
      createCircuitInputs({
        old_balance_lo: 500000,
        old_balance_hi: 0,
        new_balance_lo: 0,
        new_balance_hi: 0,
        transfer_lo: 500000,
        transfer_hi: 0,
      })
    );

    // Submit with DIFFERENT values: old=1000000, new=0, transfer=1000000
    try {
      await program.methods
        .verifyProof(
          Array.from(proof.proof_a),
          1000000, // different transfer
          0,
          1000000, // different old
          0,
          0,
          0
        )
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
        .rpc();
      assert.fail("Proof for different values should have failed");
    } catch (e: any) {
      assert.include(
        e.message,
        "ProofVerificationFailed",
        "Should fail with ProofVerificationFailed"
      );
    }
  });
});
