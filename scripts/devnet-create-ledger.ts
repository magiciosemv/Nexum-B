/**
 * devnet-create-ledger.ts — Create UserLedger PDA for a given owner + mint
 *
 * Usage:
 *   npx ts-node scripts/devnet-create-ledger.ts <mint地址>
 */

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://devnet.helius-rpc.com";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

function findLedgerPDA(owner: PublicKey, mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
}

function findConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nexum_config")],
    PROGRAM_ID
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: npx ts-node scripts/devnet-create-ledger.ts <mint地址>");
    process.exit(1);
  }

  const mint = new PublicKey(args[0]);
  const connection = new Connection(RPC, "confirmed");

  const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Mint:", mint.toBase58());

  const idlPath = path.join(__dirname, "../target/idl/nexum_pool.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
  const program = new Program(idl as anchor.Idl, provider);

  const [ledger] = findLedgerPDA(wallet.publicKey, mint);
  const [configPda] = findConfigPDA();

  console.log("Ledger PDA:", ledger.toBase58());

  // Check if exists
  const info = await connection.getAccountInfo(ledger);
  if (info) {
    console.log("Ledger already exists (" + info.data.length + " bytes)");
    return;
  }

  console.log("\nCreating UserLedger...");
  try {
    const tx = await program.methods
      .createUserLedger()
      .accounts({
        owner: wallet.publicKey,
        ledger: ledger,
        mint: mint,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    console.log("createUserLedger TX:", tx);
    console.log("View: https://solscan.io/tx/" + tx + "?cluster=devnet");

    const newInfo = await connection.getAccountInfo(ledger);
    console.log("Ledger size:", newInfo?.data.length, "bytes");
  } catch (e: any) {
    console.log("Error:", e.message?.slice(0, 500));
  }
}

main().catch(console.error);
