/**
 * devnet-spl-flow.ts — Full Scheme B Two-Way Swap on Devnet with Real SPL Tokens
 *
 * Flow: create mints → create ATAs → mint tokens → initiate → accept → execute
 * Uses private ZK circuit, real Groth16 proofs, ElGamal ciphertexts, SPL transfers.
 *
 * Usage:
 *   NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *   npx ts-node scripts/devnet-spl-flow.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, ComputeBudgetProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint, mintTo, createAssociatedTokenAccount, getAccount,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

import { computeCommitment } from "../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA, findLedgerPDA, findConfigPDA,
  findSettlementPDA, findProofDataPDA, findDelegatePDA, splitAmount,
} from "../sdk/src/scheme_b/index";
import { ProverManager, createPrivateCircuitInputs } from "../sdk/src/workers/prover";
import {
  generateKeypair, encrypt as elgamalEncrypt, serializeCiphertext,
} from "../sdk/src/crypto/elgamal";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const NEXUM_POOL_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");

function step(msg: string) {
  console.log(`\n[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function txLink(sig: string) {
  console.log(`  TX: ${sig}`);
  console.log(`  Solscan: https://solscan.io/tx/${sig}?cluster=devnet`);
}

async function main() {
  // ── Setup ──────────────────────────────────────────────────────────
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8")))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../target/idl/nexum_pool.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);

  const initiator = walletKeypair; // deployer wallet acts as initiator
  const counterparty = Keypair.generate();

  console.log("=== Nexum Devnet SPL Token Flow ===");
  console.log("Initiator:", initiator.publicKey.toBase58());
  console.log("Counterparty:", counterparty.publicKey.toBase58());

  // Transfer SOL to counterparty from deployer wallet
  step("Transfer SOL to counterparty");
  const transferIx = anchor.web3.SystemProgram.transfer({
    fromPubkey: initiator.publicKey,
    toPubkey: counterparty.publicKey,
    lamports: 2 * LAMPORTS_PER_SOL,
  });
  const transferTx = new anchor.web3.Transaction().add(transferIx);
  await provider.sendAndConfirm(transferTx, [initiator]);
  console.log("  Counterparty balance:", await connection.getBalance(counterparty.publicKey) / LAMPORTS_PER_SOL, "SOL");

  // ── Create SPL Mints ───────────────────────────────────────────────
  step("Create SPL token mints");
  const mintA = await createMint(connection, initiator, initiator.publicKey, null, 0);
  const mintB = await createMint(connection, counterparty, counterparty.publicKey, null, 0);
  console.log("  Mint A:", mintA.toBase58());
  console.log("  Mint B:", mintB.toBase58());

  // ── Create ATAs and Mint Tokens ────────────────────────────────────
  step("Create ATAs and mint tokens");
  const partyATokenA = getAssociatedTokenAddressSync(mintA, initiator.publicKey);
  const partyBTokenA = getAssociatedTokenAddressSync(mintA, counterparty.publicKey);
  const partyBTokenB = getAssociatedTokenAddressSync(mintB, counterparty.publicKey);
  const partyATokenB = getAssociatedTokenAddressSync(mintB, initiator.publicKey);

  await createAssociatedTokenAccount(connection, initiator, mintA, initiator.publicKey);
  await mintTo(connection, initiator, mintA, partyATokenA, initiator, 10_000_000n);

  await createAssociatedTokenAccount(connection, counterparty, mintB, counterparty.publicKey);
  await mintTo(connection, counterparty, mintB, partyBTokenB, counterparty, 10_000_000n);

  // Create receive ATAs
  await createAssociatedTokenAccount(connection, counterparty, mintA, counterparty.publicKey);
  await createAssociatedTokenAccount(connection, initiator, mintB, initiator.publicKey);

  console.log("  Party A mintA balance:", (await getAccount(connection, partyATokenA)).amount.toString());
  console.log("  Party B mintB balance:", (await getAccount(connection, partyBTokenB)).amount.toString());

  // ── Derive PDAs ────────────────────────────────────────────────────
  const [ledgerA] = findLedgerPDA(initiator.publicKey, mintA, NEXUM_POOL_ID);
  const [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, NEXUM_POOL_ID);
  const [configPda] = findConfigPDA(NEXUM_POOL_ID);

  // ── Initialize Pool ────────────────────────────────────────────────
  step("Initialize protocol config");
  try {
    const sig = await program.methods.initializePool()
      .accounts({ authority: initiator.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    txLink(sig);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  Config already exists, skipping");
    } else {
      throw e;
    }
  }

  // ── Create User Ledgers ────────────────────────────────────────────
  step("Create user ledgers");
  try {
    const sig1 = await program.methods.createUserLedger()
      .accounts({ owner: initiator.publicKey, ledger: ledgerA, mint: mintA, config: configPda, systemProgram: SystemProgram.programId })
      .signers([initiator])
      .rpc();
    txLink(sig1);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  Ledger A already exists, skipping");
    } else { throw e; }
  }

  try {
    const sig2 = await program.methods.createUserLedger()
      .accounts({ owner: counterparty.publicKey, ledger: ledgerB, mint: mintB, config: configPda, systemProgram: SystemProgram.programId })
      .signers([counterparty])
      .rpc();
    txLink(sig2);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  Ledger B already exists, skipping");
    } else { throw e; }
  }

  // ── Step 1: Initiate ───────────────────────────────────────────────
  step("Step 1: Initiate commit");
  const transferAmountA = 1_000_000n;
  const transferAmountB = 500_000n;
  const nonce = BigInt(Date.now());
  const currentSlot = await connection.getSlot();
  const chainTime = await connection.getBlockTime(currentSlot) || Math.floor(Date.now() / 1000);
  const expiry = chainTime + 45;

  const { lo: a_lo, hi: a_hi } = splitAmount(transferAmountA);
  const { lo: b_lo, hi: b_hi } = splitAmount(transferAmountB);

  const commitmentHash = await computeCommitment({
    nonce,
    transfer_a_lo: a_lo, transfer_a_hi: a_hi,
    transfer_b_lo: b_lo, transfer_b_hi: b_hi,
    asset_a_mint: mintA.toBytes(), asset_b_mint: mintB.toBytes(),
    counterparty: counterparty.publicKey.toBytes(),
    expiry_timestamp: expiry,
  });

  const [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, NEXUM_POOL_ID);

  const sig1 = await program.methods
    .initiateCommit({
      nonce: new anchor.BN(nonce.toString()),
      counterparty: counterparty.publicKey,
      assetBMint: mintB,
      commitmentHash: Array.from(commitmentHash),
      expiryInit: new anchor.BN(expiry),
    })
    .accounts({
      s: initiator.publicKey, ledgerA, commitSlot: commitSlotPda,
      config: configPda, systemProgram: SystemProgram.programId,
    })
    .signers([initiator])
    .rpc();
  txLink(sig1);

  // ── Step 2: Accept ─────────────────────────────────────────────────
  step("Step 2: Accept commit (counterparty)");
  const [delegatePda] = findDelegatePDA(commitSlotPda, NEXUM_POOL_ID);

  const sig2 = await program.methods
    .acceptCommit()
    .accounts({
      s: counterparty.publicKey, ledgerA, ledgerB,
      commitSlot: commitSlotPda, config: configPda,
      partyBToken: partyBTokenB, delegate: delegatePda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([counterparty])
    .rpc();
  txLink(sig2);

  // ── Step 3: Execute with ZK Proofs + SPL Transfers ─────────────────
  step("Step 3: Generate ZK proofs and execute settlement");

  const projectRoot = path.resolve(__dirname, "..");
  const prover = new ProverManager({
    wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
    zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
  });
  await prover.init();

  const keypairA = generateKeypair();
  const keypairB = generateKeypair();

  const slotInfo = await (program.account as any).commitSlot.fetch(commitSlotPda);
  const slotNonce = BigInt((slotInfo.nonce as any).toString());
  const slotExpiry = (slotInfo.expiryInit as any).toNumber();
  const slotMintA = new Uint8Array(slotInfo.assetAMint.toBytes().subarray(0, 32));
  const slotMintB = new Uint8Array(slotInfo.assetBMint.toBytes().subarray(0, 32));
  const slotCounterparty = new Uint8Array(slotInfo.counterparty.toBytes().subarray(0, 32));

  const preimage = { nonce: slotNonce, asset_a_mint: slotMintA, asset_b_mint: slotMintB, counterparty: slotCounterparty, expiry: slotExpiry };

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

  console.log("  Proof A public signals:", proofA.public_signals);
  console.log("  Proof B public signals:", proofB.public_signals);

  // ElGamal encrypt
  const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
  const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
  const audit_a_lo = elgamalEncrypt(BigInt(a_lo), keypairA.publicKey);
  const audit_a_hi = elgamalEncrypt(BigInt(a_hi), keypairA.publicKey);
  const ct_b_lo = elgamalEncrypt(BigInt(b_lo), keypairB.publicKey);
  const ct_b_hi = elgamalEncrypt(BigInt(b_hi), keypairB.publicKey);
  const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey);
  const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);

  // Build chunks
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

  // Create + write ProofData
  const [proofDataPda] = findProofDataPDA(nonce, NEXUM_POOL_ID);

  step("Create ProofData account");
  const sig3 = await program.methods
    .createProofData({ nonce: new anchor.BN(nonce.toString()) })
    .accounts({ proofData: proofDataPda, authority: initiator.publicKey, systemProgram: SystemProgram.programId })
    .signers([initiator])
    .rpc();
  txLink(sig3);

  step("Write proof chunks");
  const chunks = [chunk0, chunk1, chunk2, chunk3];
  for (let i = 0; i < 4; i++) {
    const sig = await program.methods
      .writeProofData({ nonce: new anchor.BN(nonce.toString()), chunkIndex: i, data: Buffer.from(chunks[i]) })
      .accounts({ proofData: proofDataPda, authority: initiator.publicKey })
      .signers([initiator])
      .rpc();
    console.log(`  Chunk ${i} written: ${sig}`);
  }

  // Record balances before
  const balABefore = (await getAccount(connection, partyATokenA)).amount;
  const balBBeforeA = (await getAccount(connection, partyBTokenA)).amount;
  const balBBeforeB = (await getAccount(connection, partyBTokenB)).amount;
  const balABeforeB = (await getAccount(connection, partyATokenB)).amount;
  console.log("\n  Before: A has", balABefore.toString(), "mintA,", balABeforeB.toString(), "mintB");
  console.log("  Before: B has", balBBeforeA.toString(), "mintA,", balBBeforeB.toString(), "mintB");

  step("Execute settlement");
  const settlementNonce = BigInt(Date.now());
  const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, NEXUM_POOL_ID);

  const sig4 = await program.methods
    .executeSettleB({
      nonce: new anchor.BN(nonce.toString()),
      commitmentHashLo: new anchor.BN(proofA.public_signals[0]),
      commitmentHashHi: new anchor.BN(proofA.public_signals[1]),
      settlementNonce: new anchor.BN(settlementNonce.toString()),
      transferAmountA: new anchor.BN(transferAmountA.toString()),
      transferAmountB: new anchor.BN(transferAmountB.toString()),
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .accounts({
      ledgerA, ledgerB, commitSlot: commitSlotPda,
      proofData: proofDataPda, settlementRecord: settlementPda,
      config: configPda, feePayer: initiator.publicKey,
      systemProgram: SystemProgram.programId,
      zkVerifierProgram: ZK_VERIFIER_ID,
      partyATokenA, partyBTokenA, partyBTokenB, partyATokenB,
      delegate: delegatePda, tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([initiator])
    .rpc();
  txLink(sig4);

  // Verify balances after
  const balAAfter = (await getAccount(connection, partyATokenA)).amount;
  const balBAfterA = (await getAccount(connection, partyBTokenA)).amount;
  const balBAfterB = (await getAccount(connection, partyBTokenB)).amount;
  const balAAfterB = (await getAccount(connection, partyATokenB)).amount;

  console.log("\n  After:  A has", balAAfter.toString(), "mintA,", balAAfterB.toString(), "mintB");
  console.log("  After:  B has", balBAfterA.toString(), "mintA,", balBAfterB.toString(), "mintB");

  // Verify
  const aSent = balABefore - balAAfter;
  const bReceived = balAAfterB - balABeforeB;
  const bSent = balBBeforeB - balBAfterB;
  const aReceived = balBAfterA - balBBeforeA;

  console.log("\n  A→B:", aSent.toString(), "mintA");
  console.log("  B→A:", bSent.toString(), "mintB");

  if (aSent === transferAmountA && bSent === transferAmountB &&
      aReceived === transferAmountA && bReceived === transferAmountB) {
    console.log("\n  ✓ TWO-WAY SWAP VERIFIED ON DEVNET!");
  } else {
    console.log("\n  ✗ BALANCE MISMATCH!");
    console.log("    Expected A→B:", transferAmountA.toString(), "Got:", aSent.toString());
    console.log("    Expected B→A:", transferAmountB.toString(), "Got:", bSent.toString());
  }

  console.log("\n=== Devnet SPL Flow Complete ===");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
