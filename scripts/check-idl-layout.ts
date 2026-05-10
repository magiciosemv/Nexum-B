import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { deserializeCiphertext } from "../sdk/src/index";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  // Check IDL account size
  const idl = require("../app/src/idl/nexum_pool.json");
  const ledgerAccount = idl.accounts?.find((a: any) => a.name === "UserLedger");
  if (ledgerAccount) {
    console.log("IDL UserLedger fields:");
    let totalSize = 8; // discriminator
    for (const field of ledgerAccount.type.fields) {
      let size = 0;
      if (field.type === "publicKey") size = 32;
      else if (field.type === "u64" || field.type === "i64") size = 8;
      else if (field.type === "u8") size = 1;
      else if (field.type.kind === "defined" && field.type.defined === "LedgerStatus") size = 1;
      else if (field.type.kind === "array" && field.type.type === "u8") size = field.type.size;
      else size = 0;
      console.log(`  ${field.name}: ${field.type.kind === "array" ? `[u8;${field.type.size}]` : field.type} = ${size}B`);
      totalSize += size;
    }
    console.log(`  TOTAL: ${totalSize}B`);
  }

  // Try Anchor deserialization
  const provider = new anchor.AnchorProvider(conn, {} as any, {});
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID
  );

  try {
    const ledger = await (program.account as any).userLedger.fetch(pda);
    console.log("\n=== Anchor deserialization ===");
    console.log("Owner:", ledger.owner?.toBase58());
    console.log("Mint:", ledger.mint?.toBase58());
    console.log("Version:", ledger.version?.toString());
    console.log("Status:", JSON.stringify(ledger.status));
    console.log("balance_ct_lo type:", typeof ledger.balanceCtLo, "length:", ledger.balanceCtLo?.length);
    console.log("balance_ct_lo first 16B:", Buffer.from(ledger.balanceCtLo || []).toString("hex").slice(0, 32));

    // Try deserializing the ciphertext from Anchor
    if (ledger.balanceCtLo) {
      try {
        const ct = deserializeCiphertext(new Uint8Array(ledger.balanceCtLo));
        console.log("✓ Anchor ct_lo deserialize OK");
      } catch (e: any) {
        console.log("✗ Anchor ct_lo deserialize FAILED:", e.message);
      }
    }
  } catch (e: any) {
    console.log("Anchor fetch failed:", e.message.slice(0, 200));
  }

  // Raw byte comparison
  const info = await conn.getAccountInfo(pda);
  if (!info) return;
  const buf = Buffer.from(info.data);

  console.log("\n=== Raw byte verification ===");
  // With corrected offsets (72 instead of 74)
  const ctLo = buf.slice(72, 200);
  try {
    const ct = deserializeCiphertext(new Uint8Array(ctLo));
    console.log("✓ Raw offset 72 deserialize OK");
    console.log("  c1[0]:", ct.c1[0].toString().slice(0, 20) + "...");
  } catch (e: any) {
    console.log("✗ Raw offset 72 FAILED:", e.message);
  }

  // Check version at offset 584
  const version = buf.readBigUInt64LE(584);
  const status = buf[592];
  console.log(`Version @584: ${version}, Status @592: ${status}`);
}

main().catch(console.error);
