/**
 * devnet-accept.ts — 对手方接受结算
 *
 * 用法：
 *   npx ts-node scripts/devnet-accept.ts <initiator地址> <nonce>
 *
 * 示例：
 *   npx ts-node scripts/devnet-accept.ts CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue 1778439908079
 */

// ── WSL2 fix: force IPv4 for native fetch (IPv6 unreachable in WSL2) ──
const _dns = require("dns");
_dns.setDefaultResultOrder("ipv4first");
// Override native fetch to use node's https module (respects ipv4first)
const _https = require("https");
const _http = require("http");
(globalThis as any).fetch = function(url: string, opts: any) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? _https : _http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: opts?.method || "GET",
      headers: opts?.headers || {},
    }, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString())),
          text: () => Promise.resolve(Buffer.concat(chunks).toString()),
        } as any);
      });
    });
    req.on("error", reject);
    if (opts?.body) req.write(opts.body);
    req.end();
  });
};

// ── Load .env ───────────────────────────────────────────────────────
const envPath = require("path").join(__dirname, "..", ".env");
if (require("fs").existsSync(envPath)) {
  require("fs").readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l: string) => l && !l.startsWith("#"))
    .forEach((l: string) => {
      const idx = l.indexOf("=");
      if (idx > 0) {
        const k = l.slice(0, idx).trim();
        const v = l.slice(idx + 1).trim();
        if (k && v) process.env[k] = v;
      }
    });
}

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
const MINT_B = new PublicKey("krzeZAdbCYEaAYPxKznJ4VVcqqjH8tow67CwmWU9PQf");

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

  // ── Step 0: Ensure counterparty's Ledger B exists and is correct size ──
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
    // Migrate if too small (UserLedger needs 1056 bytes)
    if (ledgerBInfo.data.length < 1056) {
      console.log("Ledger B too small, migrating...");
      try {
        const migrateSig = await program.methods
          .migrateLedger()
          .accounts({
            ledger: ledgerB,
            signer: cpKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([cpKeypair])
          .rpc();
        console.log("migrateLedger TX:", migrateSig);
      } catch (e: any) {
        console.log("migrateLedger error:", e.message?.slice(0, 300));
        return;
      }
    }
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
