/**
 * devnet-setup-counterparty.ts — Setup counterparty with SOL + SPL tokens
 *
 * Run once before browser testing to prepare the counterparty account.
 *
 * Usage:
 *   NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules \
 *   npx ts-node scripts/devnet-setup-counterparty.ts <MINT_A> <MINT_B>
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint, mintTo, createAssociatedTokenAccount, getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const COUNTERPARTY_KEYPAIR_PATH = path.resolve(__dirname, "keys/counterparty.json");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: npx ts-node scripts/devnet-setup-counterparty.ts <MINT_A> <MINT_B>");
    process.exit(1);
  }

  const mintA = new PublicKey(args[0]);
  const mintB = new PublicKey(args[1]);

  const connection = new anchor.web3.Connection(RPC, "confirmed");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME!, ".config/solana/id.json"), "utf-8")))
  );
  const counterparty = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(COUNTERPARTY_KEYPAIR_PATH, "utf-8")))
  );

  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("Counterparty:", counterparty.publicKey.toBase58());

  // Transfer SOL to counterparty
  console.log("\n1. Transfer SOL to counterparty...");
  const solIx = SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: counterparty.publicKey, lamports: 2 * LAMPORTS_PER_SOL });
  const solTx = new anchor.web3.Transaction().add(solIx);
  await connection.sendTransaction(solTx, [deployer]);
  console.log("   Done. Balance:", await connection.getBalance(counterparty.publicKey) / LAMPORTS_PER_SOL, "SOL");

  // Create ATA for mintB and mint tokens
  console.log("\n2. Create ATA + mint mintB tokens to counterparty...");
  try {
    await createAssociatedTokenAccount(connection, counterparty, mintB, counterparty.publicKey);
  } catch (e: any) {
    if (!e.message?.includes("already")) throw e;
    console.log("   ATA already exists");
  }
  await mintTo(connection, deployer, mintB, getAssociatedTokenAddressSync(mintB, counterparty.publicKey), deployer, 10_000_000n);
  console.log("   MintB balance:", (await getAccount(connection, getAssociatedTokenAddressSync(mintB, counterparty.publicKey))).amount.toString());

  // Also create ATA for mintA (counterparty needs it to receive A→B transfer)
  console.log("\n3. Create ATA for mintA (receive side)...");
  try {
    await createAssociatedTokenAccount(connection, counterparty, mintA, counterparty.publicKey);
  } catch (e: any) {
    if (!e.message?.includes("already")) throw e;
    console.log("   ATA already exists");
  }

  console.log("\n✓ Counterparty setup complete");
  console.log("  Address:", counterparty.publicKey.toBase58());
  console.log("  Use as Counterparty in browser");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
