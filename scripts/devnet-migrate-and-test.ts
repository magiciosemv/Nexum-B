/**
 * devnet-migrate-and-test.ts — 迁移 config + 注册监管公钥
 *
 * 用法：
 *   npx ts-node scripts/devnet-migrate-and-test.ts
 */

import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { sha256 } from "@noble/hashes/sha256";
import * as babyJub from "@zk-kit/baby-jubjub";
import fs from "fs";
import path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

function bigintToLeBytes(val: bigint, buf: Uint8Array, offset: number): void {
  for (let i = 0; i < 32; i++) {
    buf[offset + i] = Number((val >> BigInt(i * 8)) & BigInt(0xff));
  }
}

function deriveRegulatorKey(wallet: Keypair): { privateKey: bigint; publicKey: Uint8Array } {
  const message = new TextEncoder().encode("Nexum Regulator Key Derivation");
  const { ed25519 } = require("@noble/curves/ed25519");
  const signature = ed25519.sign(message, wallet.secretKey.slice(0, 32));
  const hash = sha256(signature);
  const hashHex = Buffer.from(hash).toString("hex");
  const privateKey = BigInt("0x" + hashHex) % babyJub.subOrder;
  const publicKeyPoint = babyJub.mulPointEscalar(babyJub.Base8, privateKey);
  const publicKey = new Uint8Array(64);
  bigintToLeBytes(publicKeyPoint[0], publicKey, 0);
  bigintToLeBytes(publicKeyPoint[1], publicKey, 32);
  return { privateKey, publicKey };
}

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

  // ── Step 1: Migrate config ────────────────────────────────────────

  console.log("\n=== Step 1: Migrate config (realloc to 171B) ===");
  const configInfo = await connection.getAccountInfo(configPda);
  console.log("Current config size:", configInfo?.data.length, "bytes");

  try {
    const migrateTx = await program.methods
      .migrateConfig()
      .accounts({
        config: configPda,
        signer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    console.log("migrateConfig TX:", migrateTx);

    // Verify new size
    const newConfigInfo = await connection.getAccountInfo(configPda);
    console.log("New config size:", newConfigInfo?.data.length, "bytes");
  } catch (e: any) {
    console.log("migrateConfig error:", e.message?.slice(0, 300));
  }

  // ── Step 2: Derive and register regulator key ─────────────────────

  console.log("\n=== Step 2: Register regulator ===");
  const { privateKey: regPrivKey, publicKey: regPubKey } = deriveRegulatorKey(wallet);
  console.log("Regulator pubkey:", Buffer.from(regPubKey).toString("hex"));

  try {
    const regTx = await program.methods
      .registerRegulator(Array.from(regPubKey) as number[])
      .accounts({
        config: configPda,
        signer: wallet.publicKey,
      })
      .signers([wallet])
      .rpc();
    console.log("registerRegulator TX:", regTx);

    // Verify
    const updatedConfig = await connection.getAccountInfo(configPda);
    if (updatedConfig) {
      const regPubKeyOnChain = updatedConfig.data.slice(107, 171);
      console.log("Regulator pubkey on-chain:", Buffer.from(regPubKeyOnChain).toString("hex"));
    }
  } catch (e: any) {
    console.log("registerRegulator error:", e.message?.slice(0, 300));
  }

  // ── Output ────────────────────────────────────────────────────────

  console.log("\n=== Summary ===");
  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Regulator privkey (bigint):", regPrivKey.toString());
  console.log("Regulator pubkey (hex):", Buffer.from(regPubKey).toString("hex"));
  console.log("\nUse this wallet to sign in the regulator page.");
}

main().catch(console.error);
