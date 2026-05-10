/**
 * devnet-accept-execute.ts — Browser-initiated flow helper (Vault Model)
 *
 * After the browser calls initiateCommit, run this script to:
 * 1. Create counterparty ledger (if needed)
 * 2. acceptCommit (counterparty signs — no delegate approval needed)
 * 3. Browser auto-triggers settlement execution (encrypted balance update only)
 *
 * Usage:
 *   NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *   npx ts-node scripts/devnet-accept-execute.ts <NONCE> <MINT_A> <MINT_B> <INITIATOR>
 *
 * Example:
 *   npx ts-node scripts/devnet-accept-execute.ts 1715234567890 \
 *     275A7tPzyWBPSpNnVovQ594u8AU2R5cmFXaqmDWPqdmH \
 *     JAv2zw1jdBGBqBDvKmvZ1CRamYDyCaSNdSD7z5e7uecT \
 *     CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

import {
  findCommitSlotPDA, findLedgerPDA, findConfigPDA,
  findSettlementPDA, findProofDataPDA, splitAmount,
} from "../sdk/src/scheme_b/index";
import { computeCommitment } from "../sdk/src/crypto/commitment";
import { ProverManager, createPrivateCircuitInputs } from "../sdk/src/workers/prover";
import { generateKeypair, encrypt as elgamalEncrypt, serializeCiphertext } from "../sdk/src/crypto/elgamal";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const NEXUM_POOL_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");
const COUNTERPARTY_KEYPAIR_PATH = path.resolve(__dirname, "keys/counterparty.json");

function step(msg: string) { console.log(`\n[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.log("Usage: npx ts-node scripts/devnet-accept-execute.ts <NONCE> <MINT_A> <MINT_B> <INITIATOR> [TRANSFER_AMOUNT_A] [TRANSFER_AMOUNT_B]");
    console.log("  NONCE: the nonce from the browser initiate (e.g. 1715234567890)");
    console.log("  MINT_A: asset A mint address");
    console.log("  MINT_B: asset B mint address");
    console.log("  INITIATOR: the browser wallet address (Phantom)");
    console.log("  TRANSFER_AMOUNT_A: amount A sends to B (default: 1000000)");
    console.log("  TRANSFER_AMOUNT_B: amount B sends to A (default: 500000)");
    process.exit(1);
  }

  const nonce = BigInt(args[0]);
  const mintA = new PublicKey(args[1]);
  const mintB = new PublicKey(args[2]);
  const initiatorPk = new PublicKey(args[3]);
  const transferAmountA = args[4] ? BigInt(args[4]) : 1_000_000n;
  const transferAmountB = args[5] ? BigInt(args[5]) : 500_000n;

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const counterpartyKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(COUNTERPARTY_KEYPAIR_PATH, "utf-8")))
  );
  const wallet = new anchor.Wallet(counterpartyKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../target/idl/nexum_pool.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);

  console.log("=== Accept + Execute ===");
  console.log("Counterparty:", counterpartyKeypair.publicKey.toBase58());
  console.log("Nonce:", nonce.toString());
  console.log("Mint A:", mintA.toBase58());
  console.log("Mint B:", mintB.toBase58());
  console.log("Transfer A→B:", transferAmountA.toString());
  console.log("Transfer B→A:", transferAmountB.toString());

  // Derive initiator from the CommitSlot
  const [configPda] = findConfigPDA(NEXUM_POOL_ID);

  // Find the CommitSlot — need to know whose ledger it is
  // The browser creates it with the initiator's ledger. We need the initiator's public key.
  // We'll scan for it from the on-chain commit slot using the nonce.
  // Actually, we can derive it: the browser user's wallet is the initiator.
  // The script needs the initiator's mint to derive ledger A.
  // But we don't know the initiator's key... Let's find the commit slot by scanning.

  // Alternative: we know the CommitSlot PDA is ["cslot", ledger_a, nonce_le8].
  // We need ledger_a = findLedgerPDA(initiator, mintA, NEXUM_POOL_ID).
  // We don't know the initiator key. But the user can pass it, or we can fetch it from the slot.

  // Let's use a simpler approach: fetch the CommitSlot by deriving from the expected PDAs.
  // We'll try the most common case: the deployer wallet is the initiator.

  // Check if there's a way to find the commit slot from the nonce alone...
  // CommitSlot seeds: ["cslot", ledger_a, nonce_le8] — we need ledger_a.

  // We'll read the deployer keypair as potential initiator
  const deployerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8")))
  );

  const [ledgerA] = findLedgerPDA(initiatorPk, mintA, NEXUM_POOL_ID);
  const [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, NEXUM_POOL_ID);

  console.log("Initiator:", initiatorPk.toBase58());
  console.log("Ledger A:", ledgerA.toBase58());
  console.log("CommitSlot:", commitSlotPda.toBase58());

  // Fetch CommitSlot to get the expiry and verify it exists
  step("Fetch CommitSlot");
  let slotInfo: any;
  try {
    slotInfo = await (program.account as any).commitSlot.fetch(commitSlotPda);
    console.log("  Status:", JSON.stringify(slotInfo.status));
    console.log("  Counterparty:", slotInfo.counterparty.toBase58());
  } catch (e) {
    console.error("  CommitSlot not found! Did the browser initiate?");
    process.exit(1);
  }

  // Create counterparty ledger if needed
  const [ledgerB] = findLedgerPDA(counterpartyKeypair.publicKey, mintB, NEXUM_POOL_ID);

  step("Ensure counterparty ledger exists");
  try {
    const sig = await program.methods.createUserLedger()
      .accounts({ owner: counterpartyKeypair.publicKey, ledger: ledgerB, mint: mintB, config: configPda, systemProgram: SystemProgram.programId })
      .signers([counterpartyKeypair])
      .rpc();
    console.log("  Ledger B created:", sig);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  Ledger B already exists");
    } else {
      // Might be "already initialized" or similar
      console.log("  Ledger B creation:", e.message?.substring(0, 100));
    }
  }

  // Step 2: Accept commit (vault model — no delegate approval needed)
  step("Accept commit");

  try {
    const sig = await program.methods.acceptCommit()
      .accounts({
        s: counterpartyKeypair.publicKey, ledgerA, ledgerB,
        commitSlot: commitSlotPda, config: configPda,
      })
      .signers([counterpartyKeypair])
      .rpc();
    console.log("  Accept TX:", sig);
    console.log("  Solscan: https://solscan.io/tx/" + sig + "?cluster=devnet");
  } catch (e: any) {
    console.error("  Accept failed:", e.message?.substring(0, 200));
    process.exit(1);
  }

  // Step 3: Generate ZK proofs
  step("Generate ZK proofs");
  const projectRoot = path.resolve(__dirname, "..");
  const prover = new ProverManager({
    wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
    zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
  });
  await prover.init();

  const { lo: a_lo, hi: a_hi } = splitAmount(transferAmountA);
  const { lo: b_lo, hi: b_hi } = splitAmount(transferAmountB);

  // Re-fetch slot for canonical preimage
  const freshSlot = await (program.account as any).commitSlot.fetch(commitSlotPda);
  const slotNonce = BigInt((freshSlot.nonce as any).toString());
  const slotExpiry = (freshSlot.expiryInit as any).toNumber();
  const slotMintA = new Uint8Array(freshSlot.assetAMint.toBytes().subarray(0, 32));
  const slotMintB = new Uint8Array(freshSlot.assetBMint.toBytes().subarray(0, 32));
  const slotCounterparty = new Uint8Array(freshSlot.counterparty.toBytes().subarray(0, 32));
  const preimage = { nonce: slotNonce, asset_a_mint: slotMintA, asset_b_mint: slotMintB, counterparty: slotCounterparty, expiry: slotExpiry };

  const keypairA = generateKeypair();
  const keypairB = generateKeypair();

  console.log("  Generating proof A...");
  const proofA = await prover.generateProof(createPrivateCircuitInputs({
    old_balance_lo: Number(a_lo), old_balance_hi: Number(a_hi),
    new_balance_lo: 0, new_balance_hi: 0,
    swap_amount_lo: Number(a_lo), swap_amount_hi: Number(a_hi),
    transfer_lo: Number(a_lo), transfer_hi: Number(a_hi),
    transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
    ...preimage,
  }));

  console.log("  Generating proof B...");
  const proofB = await prover.generateProof(createPrivateCircuitInputs({
    old_balance_lo: Number(b_lo), old_balance_hi: Number(b_hi),
    new_balance_lo: 0, new_balance_hi: 0,
    swap_amount_lo: Number(b_lo), swap_amount_hi: Number(b_hi),
    transfer_lo: Number(a_lo), transfer_hi: Number(a_hi),
    transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
    ...preimage,
  }));

  console.log("  Public signals match:", proofA.public_signals[0] === proofB.public_signals[0] && proofA.public_signals[1] === proofB.public_signals[1]);

  // ElGamal encrypt
  const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
  const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
  const audit_a_lo = elgamalEncrypt(BigInt(a_lo), keypairA.publicKey);
  const audit_a_hi = elgamalEncrypt(BigInt(a_hi), keypairA.publicKey);
  const ct_b_lo = elgamalEncrypt(BigInt(b_lo), keypairB.publicKey);
  const ct_b_hi = elgamalEncrypt(BigInt(b_hi), keypairB.publicKey);
  const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey);
  const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);

  // Build + write ProofData
  const [proofDataPda] = findProofDataPDA(nonce, NEXUM_POOL_ID);

  step("Create + write ProofData");
  try {
    const sig = await program.methods
      .createProofData({ nonce: new anchor.BN(nonce.toString()) })
      .accounts({ proofData: proofDataPda, authority: counterpartyKeypair.publicKey, systemProgram: SystemProgram.programId })
      .signers([counterpartyKeypair])
      .rpc();
    console.log("  ProofData created:", sig);
  } catch (e: any) {
    if (e.message?.includes("already")) {
      console.log("  ProofData already exists");
    } else { throw e; }
  }

  const chunk0 = proofA.proof_a;
  const chunk1 = [
    ...Array.from(serializeCiphertext(ct_a_lo)),
    ...Array.from(serializeCiphertext(ct_a_hi)),
    ...Array.from(serializeCiphertext(audit_a_lo)),
    ...Array.from(serializeCiphertext(audit_a_hi)),
  ];
  const chunk2 = proofB.proof_a;
  const chunk3 = [
    ...Array.from(serializeCiphertext(ct_b_lo)),
    ...Array.from(serializeCiphertext(ct_b_hi)),
    ...Array.from(serializeCiphertext(audit_b_lo)),
    ...Array.from(serializeCiphertext(audit_b_hi)),
  ];

  for (let i = 0; i < 4; i++) {
    const data = [chunk0, chunk1, chunk2, chunk3][i];
    const sig = await program.methods
      .writeProofData({ nonce: new anchor.BN(nonce.toString()), chunkIndex: i, data: Buffer.from(data) })
      .accounts({ proofData: proofDataPda, authority: counterpartyKeypair.publicKey })
      .signers([counterpartyKeypair])
      .rpc();
    console.log(`  Chunk ${i}: ${sig}`);
  }

  // Step 4: Browser handles execute (Party A must sign A→B transfer)
  step("Accept complete — browser should auto-execute now");
  console.log("  Both ledgers locked. Browser should detect and auto-execute.");
  console.log("  (Execute requires Party A's signature for A→B token transfer)");
  console.log("\n  ✓ ACCEPT COMPLETE — waiting for browser to execute...");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
