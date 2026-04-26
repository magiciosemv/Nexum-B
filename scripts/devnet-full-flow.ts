/**
 * devnet-full-flow.ts — Complete Scheme B 3-Step Flow on Devnet
 *
 * Runs: initiate → accept → execute_settle_b with REAL ZK proofs
 * Both parties are script-controlled keypairs.
 *
 * Usage:
 *   NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *   npx ts-node scripts/devnet-full-flow.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// SDK imports (direct source paths for ts-node)
import { computeCommitment } from "../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  splitAmount,
} from "../sdk/src/scheme_b/index";
import { ProverManager, createCircuitInputs } from "../sdk/src/workers/prover";
import {
  generateKeypair,
  encrypt as elgamalEncrypt,
  serializeCiphertext,
} from "../sdk/src/crypto/elgamal";
import * as idlJson from "../target/idl/nexum_pool.json";

// ── Constants ────────────────────────────────────────────────────────

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");
const ZK_VERIFIER_ID = new PublicKey("AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi");
const TRANSFER_AMOUNT = 1_000_000n; // 1M units

// ── Helpers ──────────────────────────────────────────────────────────

function step(msg: string) {
  console.log(`\n[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function txLink(sig: string) {
  console.log(`  TX: ${sig}`);
  console.log(`  Solscan: https://solscan.io/tx/${sig}?cluster=devnet`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Nexum Protocol — Full Scheme B Flow on Devnet");
  console.log("═══════════════════════════════════════════════════════════");

  // ── Load keypairs ─────────────────────────────────────────────────
  const initBytes = JSON.parse(fs.readFileSync("scripts/keys/initiator.json", "utf8"));
  const cpBytes = JSON.parse(fs.readFileSync("scripts/keys/counterparty.json", "utf8"));
  const initKp = Keypair.fromSecretKey(Uint8Array.from(initBytes));
  const cpKp = Keypair.fromSecretKey(Uint8Array.from(cpBytes));

  console.log(`Initiator:     ${initKp.publicKey.toBase58()}`);
  console.log(`Counterparty:  ${cpKp.publicKey.toBase58()}`);

  // ── Setup Anchor ──────────────────────────────────────────────────
  const connection = new anchor.web3.Connection(RPC, "confirmed");

  // We need two providers (one per wallet)
  const initWallet = new anchor.Wallet(initKp);
  const cpWallet = new anchor.Wallet(cpKp);

  const initProvider = new anchor.AnchorProvider(connection, initWallet, { commitment: "confirmed" });
  const cpProvider = new anchor.AnchorProvider(connection, cpWallet, { commitment: "confirmed" });

  const initProgram = new anchor.Program(idlJson as any, initProvider);
  const cpProgram = new anchor.Program(idlJson as any, cpProvider);

  // ── Mint addresses (use random pubkeys — no SPL token needed for test) ──
  const MINT_A = new PublicKey("B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw");
  const MINT_B = new PublicKey("Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k");

  // ── Derive PDAs ───────────────────────────────────────────────────
  const [ledgerA] = findLedgerPDA(initKp.publicKey, MINT_A, PROGRAM_ID);
  const [ledgerB] = findLedgerPDA(cpKp.publicKey, MINT_B, PROGRAM_ID);
  const [configPda] = findConfigPDA(PROGRAM_ID);

  console.log(`Ledger A:      ${ledgerA.toBase58()}`);
  console.log(`Ledger B:      ${ledgerB.toBase58()}`);
  console.log(`Config:        ${configPda.toBase58()}`);
  console.log(`Transfer:      ${TRANSFER_AMOUNT}`);

  // ── Step 0: Create ledgers if needed ──────────────────────────────
  const ledgerAInfo = await connection.getAccountInfo(ledgerA);
  if (!ledgerAInfo) {
    step("Creating Ledger A for initiator...");
    const sig = await initProgram.methods
      .createUserLedger()
      .accounts({
        owner: initKp.publicKey,
        ledger: ledgerA,
        mint: MINT_A,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    txLink(sig);
  } else {
    step("Ledger A already exists.");
  }

  const ledgerBInfo = await connection.getAccountInfo(ledgerB);
  if (!ledgerBInfo) {
    step("Creating Ledger B for counterparty...");
    const sig = await cpProgram.methods
      .createUserLedger()
      .accounts({
        owner: cpKp.publicKey,
        ledger: ledgerB,
        mint: MINT_B,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });
    txLink(sig);
  } else {
    step("Ledger B already exists.");
  }

  // ── Step 1: Initiate Commit ──────────────────────────────────────
  step("STEP 1: Initiator locks ledger (initiate_commit)");

  const nonce = BigInt(Date.now());
  const currentSlot = await connection.getSlot();
  const chainTime = (await connection.getBlockTime(currentSlot)) ?? Math.floor(Date.now() / 1000);
  const expiry = chainTime + 55;
  const { lo: transfer_lo, hi: transfer_hi } = splitAmount(TRANSFER_AMOUNT);

  const commitmentHash = await computeCommitment({
    nonce,
    transfer_amount_lo: transfer_lo,
    transfer_amount_hi: transfer_hi,
    asset_a_mint: MINT_A.toBytes(),
    asset_b_mint: MINT_B.toBytes(),
    counterparty: cpKp.publicKey.toBytes(),
    expiry_timestamp: expiry,
  });

  const [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, PROGRAM_ID);
  console.log(`  CommitSlot: ${commitSlotPda.toBase58()}`);
  console.log(`  Hash: ${Buffer.from(commitmentHash).toString("hex").slice(0, 32)}...`);
  console.log(`  Expiry: ${expiry} (chain time)`);

  const sig1 = await initProgram.methods
    .initiateCommit({
      nonce: new anchor.BN(nonce.toString()),
      counterparty: cpKp.publicKey,
      assetBMint: MINT_B,
      commitmentHash: Array.from(commitmentHash),
      expiryInit: new anchor.BN(expiry),
    })
    .accounts({
      s: initKp.publicKey,
      ledgerA: ledgerA,
      commitSlot: commitSlotPda,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("  ✓ Initiate committed");
  txLink(sig1);

  // ── Step 2: Accept Commit ────────────────────────────────────────
  step("STEP 2: Counterparty accepts (accept_commit)");

  const sig2 = await cpProgram.methods
    .acceptCommit()
    .accounts({
      s: cpKp.publicKey,
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: commitSlotPda,
      config: configPda,
    })
    .rpc({ commitment: "confirmed" });

  console.log("  ✓ Dual-lock confirmed");
  txLink(sig2);

  // Verify BothLocked
  const slotData = await (initProgram.account as any).commitSlot.fetch(commitSlotPda);
  console.log(`  Status: ${JSON.stringify((slotData as any).status)}`);

  // ── Step 3: Execute Settlement with Real ZK Proofs ──────────────
  step("STEP 3: Generating ZK proofs...");

  const projectRoot = path.resolve(__dirname, "..");
  const prover = new ProverManager({
    wasmPath: path.join(projectRoot, "circuits/build/balance_transition_js/balance_transition.wasm"),
    zkeyPath: path.join(projectRoot, "circuits/build/balance_transition_final.zkey"),
  });
  await prover.init();
  console.log("  ✓ Prover initialized");

  // Generate ElGamal keypairs
  const keypairA = generateKeypair();
  const keypairB = generateKeypair();
  console.log("  ✓ ElGamal keypairs generated");

  // Party A proof: old=transfer, new=0, transfer=transfer
  // Circuit: old_balance = new_balance + transfer → transfer = 0 + transfer ✓
  console.log("  Generating proof A (sender)...");
  const proofA = await prover.generateProof(createCircuitInputs({
    old_balance_lo: Number(transfer_lo),
    old_balance_hi: Number(transfer_hi),
    new_balance_lo: 0,
    new_balance_hi: 0,
    transfer_lo: Number(transfer_lo),
    transfer_hi: Number(transfer_hi),
  }));
  console.log(`  ✓ Proof A: ${proofA.proof_a.length} bytes`);

  // Party B proof: same values (circuit constraint is identical for receiver)
  console.log("  Generating proof B (receiver)...");
  const proofB = await prover.generateProof(createCircuitInputs({
    old_balance_lo: Number(transfer_lo),
    old_balance_hi: Number(transfer_hi),
    new_balance_lo: 0,
    new_balance_hi: 0,
    transfer_lo: Number(transfer_lo),
    transfer_hi: Number(transfer_hi),
  }));
  console.log(`  ✓ Proof B: ${proofB.proof_a.length} bytes`);

  // ElGamal encryption
  console.log("  Encrypting balances with ElGamal...");
  // Party A: new balance = 0 (sent everything), old balance = transfer_amount (for audit)
  const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
  const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
  const audit_a_lo = elgamalEncrypt(BigInt(Number(transfer_lo)), keypairA.publicKey);
  const audit_a_hi = elgamalEncrypt(BigInt(Number(transfer_hi)), keypairA.publicKey);

  // Party B: new balance = transfer_amount (received), old balance = 0 (for audit)
  const ct_b_lo = elgamalEncrypt(BigInt(Number(transfer_lo)), keypairB.publicKey);
  const ct_b_hi = elgamalEncrypt(BigInt(Number(transfer_hi)), keypairB.publicKey);
  const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey);
  const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);
  console.log("  ✓ Balances encrypted (8 ciphertexts)");

  // Build proof chunks
  const chunk0 = proofA.proof_a; // 256 bytes: proof_a
  const chunk1 = [ // 512 bytes: ct_a
    ...Array.from(serializeCiphertext(ct_a_lo)),
    ...Array.from(serializeCiphertext(ct_a_hi)),
    ...Array.from(serializeCiphertext(audit_a_lo)),
    ...Array.from(serializeCiphertext(audit_a_hi)),
  ];
  const chunk2 = proofB.proof_a; // 256 bytes: proof_b
  const chunk3 = [ // 512 bytes: ct_b
    ...Array.from(serializeCiphertext(ct_b_lo)),
    ...Array.from(serializeCiphertext(ct_b_hi)),
    ...Array.from(serializeCiphertext(audit_b_lo)),
    ...Array.from(serializeCiphertext(audit_b_hi)),
  ];

  // ── Step 3a: Create ProofData ────────────────────────────────────
  step("STEP 3a: Creating ProofData account on-chain...");

  const slotNonce = BigInt((slotData.nonce as anchor.BN).toString());
  const [proofDataPda] = findProofDataPDA(slotNonce, PROGRAM_ID);
  console.log(`  ProofData: ${proofDataPda.toBase58()}`);

  // Use a payer — either party works, use initiator
  const sig3a = await initProgram.methods
    .createProofData({
      nonce: new anchor.BN(slotNonce.toString()),
    })
    .accounts({
      proofData: proofDataPda,
      authority: initKp.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed" });

  console.log("  ✓ ProofData created");
  txLink(sig3a);

  // ── Step 3b: Write proof chunks ──────────────────────────────────
  step("STEP 3b: Writing proof chunks (4 transactions)...");

  const chunks = [chunk0, chunk1, chunk2, chunk3];
  const chunkSigs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const sig = await initProgram.methods
      .writeProofData({
        nonce: new anchor.BN(slotNonce.toString()),
        chunkIndex: i,
        data: Buffer.from(chunks[i]),
      })
      .accounts({
        proofData: proofDataPda,
        authority: initKp.publicKey,
      })
      .rpc({ commitment: "confirmed" });
    chunkSigs.push(sig);
    console.log(`  ✓ Chunk ${i}/3 written (${chunks[i].length} bytes)`);
    txLink(sig);
  }

  // ── Step 3c: Execute settlement ──────────────────────────────────
  step("STEP 3c: Executing settlement (execute_settle_b)...");

  const settlementNonce = BigInt(Date.now());
  const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, PROGRAM_ID);
  console.log(`  SettlementRecord: ${settlementPda.toBase58()}`);
  console.log(`  Compute budget: 400,000 CU`);

  const sig3c = await initProgram.methods
    .executeSettleB({
      nonce: new anchor.BN(slotNonce.toString()),
      transferLo: transfer_lo,
      transferHi: transfer_hi,
      settlementNonce: new anchor.BN(settlementNonce.toString()),
      // Party A: old=transfer, new=0 (sender)
      oldALo: Number(transfer_lo),
      oldAHi: Number(transfer_hi),
      newALo: 0,
      newAHi: 0,
      // Party B: old=transfer, new=0 (circuit convention for receiver)
      oldBLo: Number(transfer_lo),
      oldBHi: Number(transfer_hi),
      newBLo: 0,
      newBHi: 0,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ])
    .accounts({
      ledgerA: ledgerA,
      ledgerB: ledgerB,
      commitSlot: commitSlotPda,
      proofData: proofDataPda,
      settlementRecord: settlementPda,
      config: configPda,
      feePayer: initKp.publicKey,
      systemProgram: SystemProgram.programId,
      zkVerifierProgram: ZK_VERIFIER_ID,
    })
    .rpc({ commitment: "confirmed" });

  console.log("  ✓ SETTLEMENT EXECUTED");
  txLink(sig3c);

  // ── Verify final state ──────────────────────────────────────────
  step("Verifying final state...");

  const la = await (initProgram.account as any).userLedger.fetch(ledgerA);
  const lb = await (initProgram.account as any).userLedger.fetch(ledgerB);
  const record = await (initProgram.account as any).settlementRecord.fetch(settlementPda);

  console.log(`  Ledger A status: ${JSON.stringify((la as any).status)}`);
  console.log(`  Ledger B status: ${JSON.stringify((lb as any).status)}`);
  console.log(`  Settlement transfer_lo: ${(record as any).transferLo}`);
  console.log(`  Settlement scheme: ${JSON.stringify((record as any).scheme)}`);

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SETTLEMENT COMPLETE — All 3 steps succeeded on devnet!");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n  Step 1 — Initiate:  ${sig1}`);
  console.log(`  Step 2 — Accept:    ${sig2}`);
  console.log(`  Step 3a — ProofData: ${sig3a}`);
  console.log(`  Step 3b — Chunk 0:  ${chunkSigs[0]}`);
  console.log(`  Step 3b — Chunk 1:  ${chunkSigs[1]}`);
  console.log(`  Step 3b — Chunk 2:  ${chunkSigs[2]}`);
  console.log(`  Step 3b — Chunk 3:  ${chunkSigs[3]}`);
  console.log(`  Step 3c — Execute:  ${sig3c}`);
  console.log(`\n  Total transactions: 8`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("\n═══ FATAL ERROR ═══");
  console.error(e.message);
  if (e.logs) console.error("Program logs:", e.logs);
  process.exit(1);
});
