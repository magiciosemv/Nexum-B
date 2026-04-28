// Cancel stuck ledgers on devnet - plain JS to avoid TS compilation issues
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const DIR = path.dirname(__filename);
const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");

const initiator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(DIR, "keys/initiator.json"), "utf8"))));
const counterparty = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(DIR, "keys/counterparty.json"), "utf8"))));
const rawIdl = require(path.join(DIR, "../target/idl/nexum_pool.json"));
const idl = { ...rawIdl, name: rawIdl.metadata?.name || "nexum_pool", version: rawIdl.metadata?.version || "0.1.0" };

const conn = new anchor.web3.Connection(RPC, "confirmed");
const wallet = new anchor.Wallet(initiator);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
const program = new anchor.Program(idl, PROGRAM_ID, provider);

const LEDGER_A = new PublicKey("CpdbXz82qQPJFBHxzZBukkQ7ETGpvvBGfaiBLLFYr7Js");
const LEDGER_B = new PublicKey("CjAUG1comMvGZj5rDjGaEVSuR2Q9SyRyrhWggmNkdtbD");
const COMMIT_SLOT = new PublicKey("2nbAHWfL77Y1ac5P6qShq7FsLxFnGhJLVvsnN6Vyjxi3");
const CONFIG = new PublicKey("DxqwvoyHAzzkbbpFPekfY78vgfBe7nimKMZpNGzms8jC");

async function run() {
  const ledgerA = await program.account.userLedger.fetch(LEDGER_A);
  console.log("Ledger A status:", JSON.stringify(ledgerA.status));

  console.log("Sending cancel_mutual...");
  const tx = await program.methods.cancelMutual()
    .accounts({
      initiator: initiator.publicKey,
      counterparty: counterparty.publicKey,
      ledgerA: LEDGER_A,
      ledgerB: LEDGER_B,
      commitSlot: COMMIT_SLOT,
      protocolConfig: CONFIG,
      systemProgram: PublicKey.default,
    })
    .signers([initiator, counterparty])
    .rpc();
  console.log("TX:", tx);
  console.log("https://solscan.io/tx/" + tx + "?cluster=devnet");

  const ledgerA2 = await program.account.userLedger.fetch(LEDGER_A);
  console.log("After:", JSON.stringify(ledgerA2.status));
}

run().catch(e => console.error("ERROR:", e.message));
