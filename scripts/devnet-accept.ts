/**
 * devnet-accept.ts — 对手方接受结算
 *
 * 用法：
 *   npx ts-node scripts/devnet-accept.ts <initiator地址> <nonce>
 *
 * 示例：
 *   npx ts-node scripts/devnet-accept.ts CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue 1778439908079
 */

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const MINT_A = new PublicKey("krzeZAdbCYEaAYPxKznJ4VVcqqjH8tow67CwmWU9PQf");
const MINT_B = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");

function findLedgerPDA(owner: PublicKey, mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
}

function findCommitSlotPDA(ledgerA: PublicKey, nonce: bigint): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cslot"), ledgerA.toBuffer(), nonceBuf],
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
  if (args.length < 2) {
    console.error("Usage: npx ts-node scripts/devnet-accept.ts <initiator地址> <nonce>");
    process.exit(1);
  }

  const initiator = new PublicKey(args[0]);
  const nonce = BigInt(args[1]);

  const connection = new Connection(RPC, "confirmed");

  const cpPath = path.join(__dirname, "keys/counterparty.json");
  const cpKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(cpPath, "utf-8")))
  );
  console.log("Counterparty:", cpKeypair.publicKey.toBase58());

  const idlPath = path.join(__dirname, "../target/idl/nexum_pool.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(cpKeypair), { commitment: "confirmed" });
  const program = new Program(idl as anchor.Idl, provider);

  // Derive PDAs
  const [ledgerA] = findLedgerPDA(initiator, MINT_A);
  const [ledgerB] = findLedgerPDA(cpKeypair.publicKey, MINT_B);
  const [commitSlot] = findCommitSlotPDA(ledgerA, nonce);
  const [configPda] = findConfigPDA();

  console.log("Initiator:", initiator.toBase58());
  console.log("Ledger A:", ledgerA.toBase58());
  console.log("Ledger B:", ledgerB.toBase58());
  console.log("CommitSlot:", commitSlot.toBase58());
  console.log("Nonce:", nonce.toString());

  // ── Step 0: Ensure counterparty's Ledger B exists ────────────────
  const ledgerBInfo = await connection.getAccountInfo(ledgerB);
  if (!ledgerBInfo) {
    console.log("\nLedger B not found. Creating for counterparty...");
    try {
      const createTx = await program.methods
        .createUserLedger()
        .accounts({
          owner: cpKeypair.publicKey,
          ledger: ledgerB,
          mint: MINT_B,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([cpKeypair])
        .rpc();
      console.log("createUserLedger TX:", createTx);
    } catch (e: any) {
      console.log("createUserLedger error:", e.message?.slice(0, 300));
      return;
    }
  } else {
    console.log("Ledger B exists (" + ledgerBInfo.data.length + " bytes)");
  }

  // ── Step 1: Accept commit ────────────────────────────────────────
  console.log("\nSending accept_commit...");
  try {
    const tx = await program.methods
      .acceptCommit()
      .accounts({
        s: cpKeypair.publicKey,
        ledgerA: ledgerA,
        ledgerB: ledgerB,
        commitSlot: commitSlot,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([cpKeypair])
      .rpc();
    console.log("accept_commit TX:", tx);
    console.log("View: https://solscan.io/tx/" + tx + "?cluster=devnet");
  } catch (e: any) {
    console.log("Error:", e.message?.slice(0, 500));
  }
}

main().catch(console.error);
