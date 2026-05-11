/**
 * devnet-regulator-test.ts — 注册监管公钥 + 完整结算流程（含监管密文）
 *
 * 用法：
 *   npx ts-node scripts/devnet-regulator-test.ts
 *
 * 前提：solana CLI 已配置 devnet，钱包有足够 SOL。
 */

import { Connection, PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { sha256 } from "@noble/hashes/sha256";
import * as babyJub from "@zk-kit/baby-jubjub";
import fs from "fs";
import path from "path";

// ── Config ────────────────────────────────────────────────────────────

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

// ── Helpers ───────────────────────────────────────────────────────────

function bigintToLeBytes(val: bigint, buf: Uint8Array, offset: number): void {
  for (let i = 0; i < 32; i++) {
    buf[offset + i] = Number((val >> BigInt(i * 8)) & BigInt(0xff));
  }
}

function deriveRegulatorKey(wallet: Keypair): { privateKey: bigint; publicKey: Uint8Array } {
  const message = new TextEncoder().encode("Nexum Regulator Key Derivation");
  // ed25519 sign using @noble/curves
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

function findConfigPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("nexum_config")], programId);
}

function findLedgerPDA(owner: PublicKey, mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
    programId
  );
}

function findCommitSlotPDA(ledgerA: PublicKey, nonce: bigint, programId: PublicKey): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("cslot"), ledgerA.toBuffer(), nonceBuf],
    programId
  );
}

function findProofDataPDA(commitSlot: PublicKey, nonce: bigint, programId: PublicKey): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proofs"), commitSlot.toBuffer(), nonceBuf],
    programId
  );
}

function findVaultPDA(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nexum_vault"), mint.toBuffer()],
    programId
  );
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME!, ".config/solana/id.json");
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  console.log("Wallet:", walletKeypair.publicKey.toBase58());

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/nexum_pool.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(walletKeypair), {
    commitment: "confirmed",
  });
  const program = new Program(idl as anchor.Idl, provider);

  // ── Step 1: Derive regulator key ──────────────────────────────────

  console.log("\n=== Step 1: Derive regulator ElGamal key ===");
  const { privateKey: regPrivKey, publicKey: regPubKey } = deriveRegulatorKey(walletKeypair);
  console.log("Regulator pubkey (64B hex):", Buffer.from(regPubKey).toString("hex"));

  // ── Step 2: Register regulator ────────────────────────────────────

  console.log("\n=== Step 2: Register regulator on-chain ===");
  const [configPda] = findConfigPDA(PROGRAM_ID);

  try {
    const configAccount = await connection.getAccountInfo(configPda);
    if (!configAccount) {
      console.log("Config PDA not found, need to initialize pool first");
    } else {
      console.log("Config PDA found, size:", configAccount.data.length);
    }
  } catch (e) {
    console.log("Config fetch error:", e);
  }

  try {
    const regTx = await program.methods
      .registerRegulator(Array.from(regPubKey) as number[])
      .accounts({
        config: configPda,
        signer: walletKeypair.publicKey,
      })
      .signers([walletKeypair])
      .rpc();
    console.log("registerRegulator TX:", regTx);
  } catch (e: any) {
    console.log("registerRegulator error:", e.message?.slice(0, 200));
    console.log("Note: If 'Account not initialized', run initialize_pool first");
  }

  // ── Step 3: Check config ──────────────────────────────────────────

  console.log("\n=== Step 3: Verify config ===");
  try {
    const configInfo = await connection.getAccountInfo(configPda);
    if (configInfo) {
      // Parse regulator_pubkey at offset: disc(8)+authority(32)+is_paused(1)+min(8)+max(8)+exec(8)+clock(8)+max_slots(1)+bump(1)+reg_auth(32) = 107
      const regPubKeyOnChain = configInfo.data.slice(107, 171);
      const isZero = regPubKeyOnChain.every(b => b === 0);
      console.log("Regulator pubkey on-chain:", isZero ? "(all zeros - not set)" : Buffer.from(regPubKeyOnChain).toString("hex"));
    }
  } catch (e) {
    console.log("Config read error:", e);
  }

  console.log("\n=== Done ===");
  console.log("Regulator private key (bigint):", regPrivKey.toString());
  console.log("Regulator pubkey hex:", Buffer.from(regPubKey).toString("hex"));
  console.log("\nUse this wallet in the regulator page to decrypt.");
}

main().catch(console.error);
