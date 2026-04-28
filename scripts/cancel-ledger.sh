#!/bin/bash
# Cancel stuck Ledger A (Phantom wallet's ledger) using counterparty keypair
# Works when Ledger A is in PendingInitiator status (no accept happened)
#
# Usage: bash scripts/cancel-ledger.sh

set -e
cd "$(dirname "$0")/.."

RPC="https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5"
PROGRAM_ID="BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P"
LEDGER_A="5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK"
MINT_B="Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k"

echo "=== Cancel Stuck Ledger ==="

/home/magic/.nvm/versions/node/v20.20.0/bin/node -e '
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, SystemProgram } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "'"$RPC"'";
const PROGRAM_ID = new PublicKey("'"$PROGRAM_ID"'");
const LEDGER_A = new PublicKey("'"$LEDGER_A"'");
const MINT_B = new PublicKey("'"$MINT_B"'");

const statusNames = ["Active","PendingInitiator","BothPending","PendingCounterparty","Emergency"];

async function main() {
  const conn = new anchor.web3.Connection(RPC, "confirmed");
  const info = await conn.getAccountInfo(LEDGER_A);
  if (!info) { console.log("Ledger A not found"); return; }

  const status = info.data[592];
  console.log("Ledger A status:", statusNames[status] || "Unknown(" + status + ")");

  if (status === 0) { console.log("Already Active, nothing to do."); return; }

  // Derive CommitSlot from pending nonce
  const nonce = info.data.readBigUInt64LE(730);
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(nonce);
  const [csPda] = PublicKey.findProgramAddressSync([Buffer.from("cslot"), LEDGER_A.toBuffer(), buf], PROGRAM_ID);
  console.log("CommitSlot:", csPda.toBase58());

  // Load counterparty keypair
  const cpKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("scripts/keys/counterparty.json","utf8"))));
  console.log("Counterparty:", cpKp.publicKey.toBase58());

  // Derive Ledger B for counterparty
  const [ledgerB] = PublicKey.findProgramAddressSync([Buffer.from("ledger"), cpKp.publicKey.toBuffer(), MINT_B.toBuffer()], PROGRAM_ID);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("nexum_config")], PROGRAM_ID);

  // Setup Anchor program
  const idlJson = require("./target/idl/nexum_pool.json");
  const wallet = new anchor.Wallet(cpKp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idlJson, provider);

  console.log("Sending cancel_mutual...");
  try {
    const sig = await program.methods.cancelMutual().accounts({
      s: cpKp.publicKey,
      ledgerA: LEDGER_A,
      ledgerB: ledgerB,
      commitSlot: csPda,
      config: configPda,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: "confirmed" });
    console.log("TX:", sig);
    console.log("https://solscan.io/tx/" + sig + "?cluster=devnet");

    const info2 = await conn.getAccountInfo(LEDGER_A);
    console.log("Ledger A after:", info2.data[592] === 0 ? "Active" : "Still locked");
  } catch(e) {
    console.error("Error:", e.message);
    if (e.message.includes("ExecuteWindowActive")) {
      console.log("");
      console.log("Execute window still active. Wait ~2 minutes and retry.");
    }
  }
}

main().catch(e => console.error("ERROR:", e.message));
'

echo "=== Done ==="
