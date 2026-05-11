/**
 * devnet-reinit-config.ts — 关闭旧 ProtocolConfig 并重新初始化（新版 171B）
 *
 * 用法：
 *   npx ts-node scripts/devnet-reinit-config.ts
 */

import { Connection, PublicKey, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

async function main() {
  const connection = new Connection(RPC, "confirmed");

  const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  console.log("Wallet:", wallet.publicKey.toBase58());

  const idlPath = path.join(__dirname, "../target/idl/nexum_pool.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
  const program = new Program(idl as anchor.Idl, provider);

  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("nexum_config")], PROGRAM_ID);
  console.log("Config PDA:", configPda.toBase58());

  // Check current config size
  const configInfo = await connection.getAccountInfo(configPda);
  if (configInfo) {
    console.log("Current config size:", configInfo.data.length, "bytes");
    console.log("Owner:", configInfo.owner.toBase58());
    console.log("Lamports:", configInfo.lamports);

    // Close the account by transferring all lamports to wallet
    // The PDA is owned by the program, so we need to call the program to close it
    // Since there's no close instruction, we'll use a workaround:
    // Send a transaction that tries to allocate the correct size

    // Actually, we need to close the old account first.
    // The program doesn't have a close instruction, so let's try to
    // create a transaction that the program will accept.

    // Alternative: use solana CLI to close the account
    console.log("\nClosing old config account...");
    console.log("Note: This requires the program to support closing PDA accounts.");
    console.log("If this fails, we need to add a close instruction to the program.");
  } else {
    console.log("Config PDA not found, can initialize fresh");
  }

  // Try to initialize pool
  console.log("\nTrying initialize_pool...");
  try {
    const tx = await program.methods
      .initializePool()
      .accounts({
        authority: wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    console.log("initializePool TX:", tx);
  } catch (e: any) {
    console.log("initializePool error:", e.message?.slice(0, 300));

    // If account already exists, we need to close it first
    if (e.message?.includes("already in use") || e.message?.includes("AccountAlreadyInitialized")) {
      console.log("\nAccount already exists. Need to close it first.");
      console.log("Options:");
      console.log("1. Add a close_config instruction to the program");
      console.log("2. Use a different config PDA (change seeds)");
      console.log("3. Deploy to a fresh program ID");
    }
  }
}

main().catch(console.error);
