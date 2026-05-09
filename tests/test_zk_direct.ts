import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { serializeProof } from "../sdk/src/workers/prover";
const snarkjs = require("snarkjs");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ZkVerifier as Program;

  const inputs = {
    old_balance_lo: "1000000", old_balance_hi: "0",
    transfer_lo: "1000000", transfer_hi: "0",
    new_balance_lo: "0", new_balance_hi: "0",
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    "circuits/build/balance_transition_js/balance_transition.wasm",
    "circuits/build/balance_transition_final.zkey"
  );

  const proofBytes = serializeProof(proof.pi_a, proof.pi_b, proof.pi_c);
  console.log("Public signals:", publicSignals);

  try {
    const sig = await program.methods
      .verifyProof(
        Buffer.from(proofBytes),
        1000000, 0, 1000000, 0, 0, 0
      )
      .rpc();
    console.log("DIRECT VERIFY: PASSED! tx:", sig);
  } catch (e: any) {
    console.log("DIRECT VERIFY: FAILED!");
    console.log("Error:", e.message?.substring(0, 300));
    if (e.logs) {
      for (const log of e.logs) {
        if (log.includes("verify") || log.includes("Proof") || log.includes("pairing")) {
          console.log("  LOG:", log);
        }
      }
    }
    throw e;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
