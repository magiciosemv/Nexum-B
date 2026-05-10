/**
 * devnet-accept.ts — 对手方自动 accept 脚本
 *
 * 浏览器发起 initiate 后，运行此脚本自动 accept。
 * 用法：npx ts-node scripts/devnet-accept.ts <mintA> <mintB> <initiator> <nonce>
 *
 * nonce 从浏览器 Trader 页面 console 输出获取（initiate 后会打印）。
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { findLedgerPDA, findConfigPDA, findCommitSlotPDA, findTreasuryVaultPDA } from "../sdk/src/scheme_b/index";
import fs from "fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error("Usage: npx ts-node scripts/devnet-accept.ts <mintA> <mintB> <initiator> <nonce>");
    process.exit(1);
  }

  const mintA = new PublicKey(args[0]);
  const mintB = new PublicKey(args[1]);
  const initiator = new PublicKey(args[2]);
  const nonce = BigInt(args[3]);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.NexumPool as Program;

  // Load counterparty keypair
  const cpSecret = JSON.parse(fs.readFileSync("/tmp/counterparty.json", "utf-8"));
  const counterparty = Keypair.fromSecretKey(Uint8Array.from(cpSecret));
  console.log("Counterparty:", counterparty.publicKey.toBase58());

  // Fund counterparty if needed
  const bal = await provider.connection.getBalance(counterparty.publicKey);
  if (bal < 0.1 * LAMPORTS_PER_SOL) {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: counterparty.publicKey, lamports: LAMPORTS_PER_SOL })
    );
    await provider.sendAndConfirm(tx);
    console.log("Counterparty funded with 1 SOL");
  }

  // Derive PDAs
  const [ledgerA] = findLedgerPDA(initiator, mintA, program.programId);
  const [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, program.programId);
  const [configPda] = findConfigPDA(program.programId);

  // Derive CommitSlot PDA from nonce
  const [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, program.programId);
  console.log("Commit Slot:", commitSlotPda.toBase58());

  // Fetch CommitSlot to get commitment hash
  const slot = await program.account.commitSlot.fetch(commitSlotPda);
  const commitmentHash = (slot as any).commitmentHash;
  console.log("Commitment hash loaded");

  // Create counterparty's ledger if needed
  try {
    await program.methods.createUserLedger().accounts({
      owner: counterparty.publicKey, mint: mintB, ledger: ledgerB,
      systemProgram: SystemProgram.programId,
    }).signers([counterparty]).rpc();
    console.log("Counterparty ledger created");
  } catch (e: any) {
    if (!e.message?.includes("already in use")) {
      console.log("Ledger creation:", e.message?.slice(0, 80));
    }
  }

  // Create Treasury Vaults if needed
  for (const [mint, label] of [[mintA, "A"], [mintB, "B"]]) {
    const [vault] = findTreasuryVaultPDA(mint, program.programId);
    try {
      await program.methods.initializeVault().accounts({
        payer: provider.wallet.publicKey, vault, mint,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      }).rpc();
      console.log("Treasury Vault", label, "created");
    } catch (e: any) {
      if (!e.message?.includes("already in use")) {
        console.log("Vault", label, ":", e.message?.slice(0, 80));
      }
    }
  }

  // Deposit counterparty's tokens to Treasury Vault
  const [vaultB] = findTreasuryVaultPDA(mintB, program.programId);
  const cpAtaB = getAssociatedTokenAddressSync(mintB, counterparty.publicKey);
  try {
    await program.methods.deposit(new anchor.BN("1000000")).accounts({
      owner: counterparty.publicKey, vault: vaultB, userToken: cpAtaB,
      mint: mintB, config: configPda, tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([counterparty]).rpc();
    console.log("Counterparty deposited 1,000,000 of mintB");
  } catch (e: any) {
    console.log("Deposit:", e.message?.slice(0, 80));
  }

  // Accept commit
  console.log("\nAccepting commit...");
  const tx = await program.methods.acceptCommit({
    commitmentHash: Array.from(commitmentHash),
  }).preInstructions([
    anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  ]).accounts({
    counterparty: counterparty.publicKey,
    ledgerA, ledgerB, commitSlot: commitSlotPda,
    config: configPda, systemProgram: SystemProgram.programId,
  }).signers([counterparty]).rpc();

  console.log("✓ accept_commit TX:", tx);
  console.log("\nCommit Slot:", commitSlotPda.toBase58());
  console.log("Now run execute from the browser or run devnet-execute.ts");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
