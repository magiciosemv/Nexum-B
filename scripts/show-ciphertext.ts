import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const CPTY = new PublicKey("A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
const MINT_B = new PublicKey("krzeZAdbCYEaAYPxKznJ4VVcqqjH8tow67CwmWU9PQf");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  // Fetch User × MintA ledger
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER.toBuffer(), MINT_A.toBuffer()],
    PROGRAM_ID
  );
  const info = await conn.getAccountInfo(pda);
  if (!info) { console.log("NOT FOUND"); return; }
  const buf = Buffer.from(info.data);

  console.log("=== UserLedger Account (User × MintA) ===");
  console.log(`Address: ${pda.toBase58()}`);
  console.log(`Owner: ${info.owner.toBase58()}`);
  console.log(`Lamports: ${info.lamports}`);
  console.log(`Data length: ${buf.length} bytes\n`);

  // Show the FULL 746 bytes as base64 (what Explorer would show)
  const b64 = buf.toString("base64");
  console.log("Raw data (base64):");
  console.log(b64);
  console.log();

  // Show ciphertext fields with non-zero bytes highlighted
  const fields = [
    { name: "balance_ct_lo", start: 74, end: 202 },
    { name: "balance_ct_hi", start: 202, end: 330 },
    { name: "audit_ct_lo", start: 330, end: 458 },
    { name: "audit_ct_hi", start: 458, end: 586 },
  ];

  for (const f of fields) {
    const chunk = buf.slice(f.start, f.end);
    const nonZero = chunk.filter(b => b !== 0).length;
    const hex = chunk.toString("hex");
    console.log(`${f.name} (${f.start}..${f.end}, ${nonZero}/128 non-zero):`);
    // Show in 32-byte lines
    for (let i = 0; i < 128; i += 32) {
      const line = hex.slice(i * 2, (i + 32) * 2);
      const marker = line.match(/^0+$/) ? "  (zeros)" : "  ← real ciphertext data";
      console.log(`  ${line}${marker}`);
    }
    console.log();
  }

  // Also show the settlement TX instruction data as base64
  const sig = "3bHwQ86bax2MkBAYNKena9rqtBhBeCkFBAa6uYykUG3g4ZtKKZh7qEeDHtKizyxeGrxcPNUaRiThwfDpnqomRDGz";
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  if (tx) {
    const msg = tx.transaction.message;
    const settleIx = msg.compiledInstructions[msg.compiledInstructions.length - 1];
    const data = Buffer.from(settleIx.data);
    console.log("=== Settlement Instruction Data ===");
    console.log(`Hex: ${data.toString("hex")}`);
    console.log(`Base64: ${data.toString("base64")}`);
    console.log(`Length: ${data.length} bytes`);
    console.log("\nByte breakdown:");
    console.log(`  [0..8]   discriminator: ${data.slice(0, 8).toString("hex")}`);
    console.log(`  [8..16]  nonce:         ${data.slice(8, 16).toString("hex")} = ${data.readBigUInt64LE(8)}`);
    console.log(`  [16..48] commit_hash:   ${data.slice(16, 48).toString("hex")}`);
    console.log(`  [48..56] settle_nonce:  ${data.slice(48, 56).toString("hex")} = ${data.readBigUInt64LE(48)}`);
    console.log(`  ────────────────────────────`);
    console.log(`  交易金额: 不存在 ❌`);
    console.log(`  金额隐藏在: ZK证明中（链下生成，链上验证）`);
  }
}

main().catch(console.error);
