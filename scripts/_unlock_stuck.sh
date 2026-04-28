#!/bin/bash
# Unlock stuck ledgers from devnet-full-flow.ts keypairs
set -e
cd "$(dirname "$0")/.."

echo "=== Unlocking stuck ledgers ==="

/home/magic/.nvm/versions/node/v20.20.0/bin/node -e '
const anchor = require("@coral-xyz/anchor");
const { Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");
const idlJson = require("./target/idl/nexum_pool.json");
const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");
const MINT_A = new PublicKey("B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw");
const MINT_B = new PublicKey("Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k");

const initKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("scripts/keys/initiator.json","utf8"))));
const cpKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("scripts/keys/counterparty.json","utf8"))));
const [ledgerA] = PublicKey.findProgramAddressSync([Buffer.from("ledger"), initKp.publicKey.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID);
const [ledgerB] = PublicKey.findProgramAddressSync([Buffer.from("ledger"), cpKp.publicKey.toBuffer(), MINT_B.toBuffer()], PROGRAM_ID);
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("nexum_config")], PROGRAM_ID);

async function main() {
  const conn = new anchor.web3.Connection(RPC, "confirmed");
  const wallet = new anchor.Wallet(cpKp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const program = new anchor.Program(idlJson, provider);

  const laInfo = await conn.getAccountInfo(ledgerA);
  if (!laInfo) { console.log("Ledger A not found:", ledgerA.toBase58()); return; }
  const statusNames = ["Active","PendingInitiator","BothPending","PendingCounterparty","Emergency"];
  const status = laInfo.data[592];
  console.log("Ledger A:", ledgerA.toBase58(), statusNames[status]);
  if (status === 0) { console.log("Already Active, nothing to do."); return; }

  const nonce = laInfo.data.readBigUInt64LE(730);
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(nonce);
  const [csPda] = PublicKey.findProgramAddressSync([Buffer.from("cslot"), ledgerA.toBuffer(), buf], PROGRAM_ID);
  console.log("CommitSlot:", csPda.toBase58());

  console.log("Sending cancel_mutual via counterparty...");
  const sig = await program.methods.cancelMutual().accounts({
    s: cpKp.publicKey,
    ledgerA, ledgerB, commitSlot: csPda, config: configPda,
    systemProgram: SystemProgram.programId,
  }).rpc({ commitment: "confirmed" });
  console.log("TX:", sig);
  console.log("https://solscan.io/tx/" + sig + "?cluster=devnet");

  const la2 = await conn.getAccountInfo(ledgerA);
  console.log("Ledger A after:", la2.data[592] === 0 ? "Active" : "Still locked");
}
main().catch(e => console.error("ERROR:", e.message));
'

echo "=== Done ==="
