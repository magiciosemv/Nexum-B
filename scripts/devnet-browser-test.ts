/**
 * devnet-browser-test.ts — Devnet 全流程测试脚本
 *
 * 生成完整结算数据，输出浏览器测试所需的所有地址和密钥。
 * 运行方式：
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5 \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/devnet-browser-test.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createMint, mintTo, createAssociatedTokenAccount, getAccount,
  TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { computeCommitment } from "../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA, findLedgerPDA, findConfigPDA,
  findSettlementPDA, findProofDataPDA, findTreasuryVaultPDA, splitAmount,
} from "../sdk/src/scheme_b/index";
import { ProverManager, createPrivateCircuitInputs } from "../sdk/src/workers/prover";
import { generateKeypair, encrypt as elgamalEncrypt, serializeCiphertext } from "../sdk/src/crypto/elgamal";
import path from "path";

const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");
const projectRoot = path.resolve(__dirname, "..");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NexumPool as Program;
  const wallet = provider.wallet;

  // Generate fresh keypairs for this test
  const initiator = Keypair.generate();
  const counterparty = Keypair.generate();

  console.log("=== DEVNET BROWSER TEST ===\n");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Initiator:", initiator.publicKey.toBase58());
  console.log("Counterparty:", counterparty.publicKey.toBase58());

  // Airdrop SOL
  console.log("\n[1/8] Airdropping SOL...");
  for (const kp of [initiator, counterparty]) {
    const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
  }

  // Create SPL token mints
  console.log("[2/8] Creating SPL token mints...");
  const mintA = await createMint(provider.connection, initiator, initiator.publicKey, null, 0);
  const mintB = await createMint(provider.connection, counterparty, counterparty.publicKey, null, 0);
  console.log("  Mint A:", mintA.toBase58());
  console.log("  Mint B:", mintB.toBase58());

  // Create ATAs and mint tokens
  console.log("[3/8] Creating token accounts and minting...");
  const initiatorAtaA = await createAssociatedTokenAccount(provider.connection, initiator, mintA, initiator.publicKey);
  await mintTo(provider.connection, initiator, mintA, initiatorAtaA, initiator, 10_000_000n);
  const counterpartyAtaB = await createAssociatedTokenAccount(provider.connection, counterparty, mintB, counterparty.publicKey);
  await mintTo(provider.connection, counterparty, mintB, counterpartyAtaB, counterparty, 10_000_000n);
  const counterpartyAtaA = await createAssociatedTokenAccount(provider.connection, counterparty, mintA, counterparty.publicKey);
  const initiatorAtaB = await createAssociatedTokenAccount(provider.connection, initiator, mintB, initiator.publicKey);
  console.log("  Initiator mintA: 10,000,000 | Counterparty mintB: 10,000,000");

  // Derive PDAs
  const [ledgerA] = findLedgerPDA(initiator.publicKey, mintA, program.programId);
  const [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, program.programId);
  const [configPda] = findConfigPDA(program.programId);
  const [treasuryVaultA] = findTreasuryVaultPDA(mintA, program.programId);
  const [treasuryVaultB] = findTreasuryVaultPDA(mintB, program.programId);

  // Init config
  console.log("[4/8] Initializing protocol config...");
  try {
    await program.methods.initializePool().accounts({
      authority: wallet.publicKey, config: configPda, systemProgram: SystemProgram.programId,
    }).rpc();
  } catch (e: any) {
    if (!e.message?.includes("already in use")) throw e;
    console.log("  Config already exists, skipping");
  }

  // Create Treasury Vaults
  console.log("[5/8] Creating Treasury Vaults...");
  for (const [mint, vault] of [[mintA, treasuryVaultA], [mintB, treasuryVaultB]]) {
    try {
      await program.methods.initializeVault().accounts({
        payer: wallet.publicKey, vault, mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      }).rpc();
      console.log("  Vault created:", vault.toBase58());
    } catch (e: any) {
      if (!e.message?.includes("already in use")) throw e;
      console.log("  Vault exists:", vault.toBase58());
    }
  }

  // Deposit tokens to Treasury Vaults
  console.log("[6/8] Depositing tokens to Treasury Vaults...");
  const depositAmount = 1_000_000n;
  await program.methods.deposit(new anchor.BN(depositAmount.toString())).accounts({
    owner: initiator.publicKey, vault: treasuryVaultA, userToken: initiatorAtaA,
    mint: mintA, config: configPda, tokenProgram: TOKEN_PROGRAM_ID,
  }).signers([initiator]).rpc();
  console.log("  Initiator deposited", depositAmount.toString(), "of mintA");

  await program.methods.deposit(new anchor.BN(depositAmount.toString())).accounts({
    owner: counterparty.publicKey, vault: treasuryVaultB, userToken: counterpartyAtaB,
    mint: mintB, config: configPda, tokenProgram: TOKEN_PROGRAM_ID,
  }).signers([counterparty]).rpc();
  console.log("  Counterparty deposited", depositAmount.toString(), "of mintB");

  // Create user ledgers
  console.log("[7/8] Creating user ledgers...");
  for (const [owner, mint, ledger] of [
    [initiator.publicKey, mintA, ledgerA],
    [counterparty.publicKey, mintB, ledgerB],
  ]) {
    try {
      await program.methods.createUserLedger().accounts({
        owner, mint, ledger, systemProgram: SystemProgram.programId,
      }).signers(owner.equals(initiator.publicKey) ? [initiator] : [counterparty]).rpc();
      console.log("  Ledger created:", ledger.toBase58());
    } catch (e: any) {
      if (!e.message?.includes("already in use")) throw e;
      console.log("  Ledger exists:", ledger.toBase58());
    }
  }

  // === SETTLEMENT FLOW ===
  console.log("\n[8/8] Running settlement flow...");

  // Generate ElGamal keypairs
  const keypairA = generateKeypair();
  const keypairB = generateKeypair();
  console.log("  ElGamal keypairs generated");

  // Compute commitment hash
  const nonce = BigInt(Date.now());
  const expirySeconds = 50;
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
  const { lo: tLo, hi: tHi } = splitAmount(Number(depositAmount));
  const { lo: bLo, hi: b_hi } = splitAmount(Number(depositAmount));

  const commitmentHash = computeCommitment({
    nonce, transferLo: tLo, transferHi: tHi,
    assetA: mintA, assetB: mintB, counterparty: counterparty.publicKey, expiry,
  });

  const [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, program.programId);

  // Step 1: Initiate
  console.log("  Step 1: initiate_commit...");
  const tx1 = await program.methods.initiateCommit({
    assetA: mintA, assetB: mintB, counterparty: counterparty.publicKey,
    expiry: new anchor.BN(expiry), nonce: new anchor.BN(nonce.toString()),
    commitmentHash: Array.from(commitmentHash),
  }).preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  ]).accounts({
    initiator: initiator.publicKey, ledger: ledgerA, commitSlot: commitSlotPda,
    config: configPda, systemProgram: SystemProgram.programId,
  }).signers([initiator]).rpc();
  console.log("  ✓ initiate_commit:", tx1);

  // Step 2: Accept
  console.log("  Step 2: accept_commit...");
  const slotData = await program.account.commitSlot.fetch(commitSlotPda);
  const tx2 = await program.methods.acceptCommit({
    commitmentHash: Array.from(commitmentHash),
  }).preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  ]).accounts({
    counterparty: counterparty.publicKey, ledgerA, ledgerB, commitSlot: commitSlotPda,
    config: configPda, systemProgram: SystemProgram.programId,
  }).signers([counterparty]).rpc();
  console.log("  ✓ accept_commit:", tx2);

  // Step 3: Create proof data + write chunks
  const proofDataPda = findProofDataPDA(nonce, program.programId)[0];
  console.log("  Step 3: create_proof_data + write chunks...");
  try {
    await program.methods.createProofData(new anchor.BN(nonce.toString())).accounts({
      payer: wallet.publicKey, proofData: proofDataPda, systemProgram: SystemProgram.programId,
    }).rpc();
  } catch (e: any) {
    if (!e.message?.includes("already in use")) throw e;
  }

  // Generate real ZK proofs
  console.log("  Generating ZK proofs...");
  const prover = new ProverManager({
    wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
    zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
  });
  await prover.init();

  const proofA = await prover.generateProof(createPrivateCircuitInputs({
    oldBalanceLo: tLo, oldBalanceHi: tHi, newBalanceLo: 0, newBalanceHi: 0,
    swapAmountLo: tLo, swapAmountHi: tHi, transferLo: tLo, transferHi: tHi,
    transferBLo: Number(bLo), transferBHi: Number(b_hi),
    nonce, assetA: mintA, assetB: mintB, counterparty: counterparty.publicKey, expiry,
  }));
  console.log("  ✓ Proof A generated");

  const proofB = await prover.generateProof(createPrivateCircuitInputs({
    oldBalanceLo: Number(bLo), oldBalanceHi: Number(b_hi), newBalanceLo: 0, newBalanceHi: 0,
    swapAmountLo: Number(bLo), swapAmountHi: Number(b_hi), transferLo: tLo, transferHi: tHi,
    transferBLo: Number(bLo), transferBHi: Number(b_hi),
    nonce, assetA: mintA, assetB: mintB, counterparty: counterparty.publicKey, expiry,
  }));
  console.log("  ✓ Proof B generated");

  // Encrypt balances
  const ctA = serializeCiphertext(elgamalEncrypt(0n, keypairA.publicKey));
  const ctB = serializeCiphertext(elgamalEncrypt(0n, keypairB.publicKey));
  const auditA = serializeCiphertext(elgamalEncrypt(BigInt(tLo), keypairA.publicKey));
  const auditB = serializeCiphertext(elgamalEncrypt(BigInt(bLo), keypairB.publicKey));

  // Write proof chunks
  const allData = Buffer.concat([
    proofA.proofBytes, ctA, auditA, proofB.proofBytes, ctB, auditB,
  ]);
  const chunks = [allData.slice(0, 256), allData.slice(256, 768), allData.slice(768, 1024), allData.slice(1024)];
  for (let i = 0; i < chunks.length; i++) {
    await program.methods.writeProofData(
      new anchor.BN(nonce.toString()), i, Array.from(chunks[i]),
    ).accounts({
      payer: wallet.publicKey, proofData: proofDataPda, systemProgram: SystemProgram.programId,
    }).rpc();
    console.log("  ✓ Chunk", i, "written");
  }

  // Step 4: Execute settlement
  console.log("  Step 4: execute_settle_b...");
  const settlementNonce = BigInt(Date.now());
  const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, program.programId);

  const tx3 = await program.methods.executeSettleB({
    nonce: new anchor.BN(nonce.toString()),
    commitmentHashLo: new anchor.BN(proofA.publicSignals[0]),
    commitmentHashHi: new anchor.BN(proofA.publicSignals[1]),
    settlementNonce: new anchor.BN(settlementNonce.toString()),
  }).preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
  ]).accounts({
    ledgerA, ledgerB, commitSlot: commitSlotPda, proofData: proofDataPda,
    settlementRecord: settlementPda, config: configPda,
    feePayer: wallet.publicKey, systemProgram: SystemProgram.programId,
    zkVerifierProgram: ZK_VERIFIER_ID,
  }).rpc();
  console.log("  ✓ execute_settle_b:", tx3);

  // Output all test data
  console.log("\n" + "=".repeat(60));
  console.log("BROWSER TEST DATA — COPY THESE:");
  console.log("=".repeat(60));
  console.log("\n[Regulator Page — Paste in input box]");
  console.log("SettlementRecord:", settlementPda.toBase58());
  console.log("\n[Trader Page — Order form]");
  console.log("Amount:", depositAmount.toString());
  console.log("Mint A:", mintA.toBase58());
  console.log("Mint B:", mintB.toBase58());
  console.log("Counterparty:", counterparty.publicKey.toBase58());
  console.log("\n[ElGamal Keys — For regulator decryption]");
  console.log("Key A (Party A):", keypairA.privateKey.toString());
  console.log("Key B (Party B):", keypairB.privateKey.toString());
  console.log("\n[localStorage — Paste in browser console]");
  console.log(`localStorage.setItem('nexum_elgamal_keys', JSON.stringify({keyA:"${keypairA.privateKey.toString()}",keyB:"${keypairB.privateKey.toString()}",partyA:"${initiator.publicKey.toBase58()}",partyB:"${counterparty.publicKey.toBase58()}",mintA:"${mintA.toBase58()}",mintB:"${mintB.toBase58()}",savedAt:"${new Date().toISOString()}"}));`);
  console.log("\n[Account Addresses]");
  console.log("Ledger A:", ledgerA.toBase58());
  console.log("Ledger B:", ledgerB.toBase58());
  console.log("Treasury Vault A:", treasuryVaultA.toBase58());
  console.log("Treasury Vault B:", treasuryVaultB.toBase58());
  console.log("Commit Slot:", commitSlotPda.toBase58());
  console.log("Proof Data:", proofDataPda.toBase58());
  console.log("=".repeat(60));
}

main().catch(console.error);
