/**
 * Minimal test: just call verify_proof on-chain with known-good proof
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { ProverManager, createPrivateCircuitInputs, serializeProof } from "../../sdk/src/workers/prover";
import path from "path";
import fs from "fs";

const ZK_VERIFIER_ID = new PublicKey("6X4MCKGaZHVUpzVKJSmgZgUcK5ZTvxPixK4f3ARNfPyN");

describe("Verify Proof Only", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("verifies a proof directly via zk_verifier", async () => {
    const projectRoot = path.resolve(__dirname, "../..");

    // Load snarkjs for local verification
    const snarkjs = require("snarkjs");

    // Known test inputs
    const nonce = BigInt(Date.now());
    const transfer_lo = 1000000;
    const transfer_hi = 0;
    const transfer_b_lo = 500000;
    const transfer_b_hi = 0;
    const asset_a = new Uint8Array(32);
    const asset_b = new Uint8Array(32);
    const counterparty = new Uint8Array(32);
    const expiry = Math.floor(Date.now() / 1000) + 50;

    const inputs = createPrivateCircuitInputs({
      old_balance_lo: transfer_lo, old_balance_hi: transfer_hi,
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: transfer_lo, swap_amount_hi: transfer_hi,
      transfer_lo, transfer_hi,
      transfer_b_lo, transfer_b_hi,
      nonce, asset_a_mint: asset_a, asset_b_mint: asset_b,
      counterparty, expiry,
    });

    console.log("Generating proof...");
    const wasmPath = path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm");
    const zkeyPath = path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey");
    const vkeyPath = path.join(projectRoot, "circuits/build_private/verification_key.json");

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);
    console.log("Public signals:", publicSignals);

    // Local verify
    const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf-8"));
    const localValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    console.log("Local verify:", localValid);

    // Serialize to 256 bytes
    const proofBytes = serializeProof(proof.pi_a, proof.pi_b, proof.pi_c);
    console.log("Proof bytes length:", proofBytes.length);
    console.log("First 16 bytes:", proofBytes.slice(0, 16).join(","));

    // Convert public signals to u128 LE bytes
    const hashLoBN = new anchor.BN(publicSignals[0]);
    const hashHiBN = new anchor.BN(publicSignals[1]);
    console.log("hashLo:", hashLoBN.toString());
    console.log("hashHi:", hashHiBN.toString());

    // Build raw instruction to call verify_proof directly
    const discriminator = Buffer.from([217, 211, 191, 110, 144, 13, 186, 98]);
    const proofBuf = Buffer.from(proofBytes);
    // BN to 16-byte LE buffer
    const loHex = hashLoBN.toString(16).padStart(32, "0");
    const hiHex = hashHiBN.toString(16).padStart(32, "0");
    const loBytes = Buffer.from(loHex, "hex").reverse(); // LE
    const hiBytes = Buffer.from(hiHex, "hex").reverse(); // LE

    const ixData = Buffer.concat([discriminator, proofBuf, loBytes, hiBytes]);
    console.log("IX data length:", ixData.length);

    // Send raw instruction
    const ix = new anchor.web3.TransactionInstruction({
      programId: ZK_VERIFIER_ID,
      keys: [],
      data: ixData,
    });

    const tx = new anchor.web3.Transaction().add(ix);
    try {
      const sig = await provider.sendAndConfirm(tx);
      console.log("✓ verify_proof PASSED! TX:", sig);
      if (!sig || sig.length === 0) throw new Error("Empty transaction signature");
    } catch (err: any) {
      console.log("✗ verify_proof FAILED:", err.message?.substring(0, 200));
      throw err;
    }
  });
});
