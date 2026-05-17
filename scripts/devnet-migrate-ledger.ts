/**
 * devnet-migrate-ledger.ts — Migrate UserLedger accounts from 746B to 994B
 *
 * Usage:
 *   npx ts-node scripts/devnet-migrate-ledger.ts <ledger地址>
 */

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://devnet.helius-rpc.com";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: npx ts-node scripts/devnet-migrate-ledger.ts <ledger地址>");
    process.exit(1);
  }

  const ledgerKey = new PublicKey(args[0]);
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

  // Check current size
  const accountInfo = await connection.getAccountInfo(ledgerKey);
  if (!accountInfo) {
    console.error("Account not found:", ledgerKey.toBase58());
    process.exit(1);
  }
  console.log("Current ledger size:", accountInfo.data.length, "bytes");
  console.log("Expected size: 994 bytes");

  if (accountInfo.data.length >= 994) {
    console.log("Ledger already at expected size, no migration needed.");
    return;
  }

  console.log("\nSending migrate_ledger...");
  try {
    const tx = await program.methods
      .migrateLedger()
      .accounts({
        ledger: ledgerKey,
        signer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    console.log("migrate_ledger TX:", tx);
    console.log("View: https://solscan.io/tx/" + tx + "?cluster=devnet");

    // Verify
    const newInfo = await connection.getAccountInfo(ledgerKey);
    console.log("New ledger size:", newInfo?.data.length, "bytes");
  } catch (e: any) {
    console.log("Error:", e.message?.slice(0, 500));
  }
}

main().catch(console.error);
