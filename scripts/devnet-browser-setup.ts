/**
 * devnet-browser-setup.ts — One-time setup for browser testing on devnet
 *
 * Creates SPL mints, mints tokens to both parties, prints browser test data.
 *
 * Usage:
 *   NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *   npx ts-node scripts/devnet-browser-setup.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint, mintTo, createAssociatedTokenAccount,
  getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { findLedgerPDA, findConfigPDA } from "../sdk/src/scheme_b/index";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const NEXUM_POOL_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const COUNTERPARTY_KEYPAIR_PATH = path.resolve(__dirname, "keys/counterparty.json");

async function main() {
  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8")))
  );
  const counterparty = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(COUNTERPARTY_KEYPAIR_PATH, "utf-8")))
  );

  console.log("=== Devnet Browser Test Setup ===\n");

  // 1. SOL to counterparty
  console.log("[1/5] Transfer SOL to counterparty...");
  const solTx = new anchor.web3.Transaction().add(
    SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: counterparty.publicKey, lamports: 2 * LAMPORTS_PER_SOL })
  );
  await connection.sendTransaction(solTx, [deployer]);
  console.log("  Counterparty SOL:", (await connection.getBalance(counterparty.publicKey)) / LAMPORTS_PER_SOL);

  // 2. Create mints
  console.log("\n[2/5] Creating SPL mints...");
  const mintA = await createMint(connection, deployer, deployer.publicKey, null, 0);
  const mintB = await createMint(connection, counterparty, counterparty.publicKey, null, 0);
  console.log("  Mint A:", mintA.toBase58());
  console.log("  Mint B:", mintB.toBase58());

  // 3. Create ATAs + mint tokens
  console.log("\n[3/5] Creating ATAs + minting tokens...");
  // Party A (deployer)
  const partyATokenA = getAssociatedTokenAddressSync(mintA, deployer.publicKey);
  await createAssociatedTokenAccount(connection, deployer, mintA, deployer.publicKey);
  await mintTo(connection, deployer, mintA, partyATokenA, deployer, 10_000_000n);
  console.log("  Party A mintA:", (await getAccount(connection, partyATokenA)).amount.toString());

  // Party B (counterparty)
  const partyBTokenB = getAssociatedTokenAddressSync(mintB, counterparty.publicKey);
  await createAssociatedTokenAccount(connection, counterparty, mintB, counterparty.publicKey);
  await mintTo(connection, counterparty, mintB, partyBTokenB, counterparty, 10_000_000n);
  console.log("  Party B mintB:", (await getAccount(connection, partyBTokenB)).amount.toString());

  // Receive ATAs
  await createAssociatedTokenAccount(connection, counterparty, mintA, counterparty.publicKey);
  await createAssociatedTokenAccount(connection, deployer, mintB, deployer.publicKey);
  console.log("  Receive ATAs created");

  // 4. Create ledgers
  console.log("\n[4/5] Creating user ledgers...");
  const wallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../target/idl/nexum_pool.json"), "utf-8"));
  const program = new anchor.Program(idl, provider);
  const [configPda] = findConfigPDA(NEXUM_POOL_ID);

  const [ledgerA] = findLedgerPDA(deployer.publicKey, mintA, NEXUM_POOL_ID);
  const [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, NEXUM_POOL_ID);

  try {
    await program.methods.createUserLedger()
      .accounts({ owner: deployer.publicKey, ledger: ledgerA, mint: mintA, config: configPda, systemProgram: SystemProgram.programId })
      .signers([deployer]).rpc();
    console.log("  Ledger A:", ledgerA.toBase58());
  } catch (e: any) {
    if (e.message?.includes("already")) console.log("  Ledger A already exists");
    else throw e;
  }

  try {
    await program.methods.createUserLedger()
      .accounts({ owner: counterparty.publicKey, ledger: ledgerB, mint: mintB, config: configPda, systemProgram: SystemProgram.programId })
      .signers([counterparty]).rpc();
    console.log("  Ledger B:", ledgerB.toBase58());
  } catch (e: any) {
    if (e.message?.includes("already")) console.log("  Ledger B already exists");
    else throw e;
  }

  // 5. Print browser test data
  console.log("\n[5/5] Browser test data:");
  console.log("┌────────────────────────────────────────────────────────────────────┐");
  console.log("│                     BROWSER TEST DATA                            │");
  console.log("├────────────────────────────────────────────────────────────────────┤");
  console.log(`│ Amount:          1000000                                          │`);
  console.log(`│ Asset A Mint:    ${mintA.toBase58()}  │`);
  console.log(`│ Asset B Mint:    ${mintB.toBase58()}  │`);
  console.log(`│ Counterparty:    ${counterparty.publicKey.toBase58()}  │`);
  console.log("├────────────────────────────────────────────────────────────────────┤");
  console.log("│ After initiate, run:                                             │");
  console.log(`│ NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \\`);
  console.log(`│ npx ts-node scripts/devnet-accept-execute.ts <NONCE> \\`);
  console.log(`│   ${mintA.toBase58()} \\`);
  console.log(`│   ${mintB.toBase58()}`);
  console.log("└────────────────────────────────────────────────────────────────────┘");

  // Save config for accept-execute script
  const config = {
    mintA: mintA.toBase58(),
    mintB: mintB.toBase58(),
    counterparty: counterparty.publicKey.toBase58(),
    initiator: deployer.publicKey.toBase58(),
  };
  fs.writeFileSync(path.resolve(__dirname, "keys/browser-test-config.json"), JSON.stringify(config, null, 2));
  console.log("\nConfig saved to scripts/keys/browser-test-config.json");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
