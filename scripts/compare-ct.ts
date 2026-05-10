import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  // ProofData
  const nonce = 1778398239072n;
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce, 0);
  const [proofDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proofs"), nonceBuf], PROGRAM_ID
  );

  // UserLedger
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID
  );

  const [pdInfo, lInfo] = await Promise.all([
    conn.getAccountInfo(proofDataPda),
    conn.getAccountInfo(ledgerPda),
  ]);

  if (!pdInfo || !lInfo) { console.log("Missing account"); return; }

  const pd = Buffer.from(pdInfo.data);
  const l = Buffer.from(lInfo.data);

  // Compare balance_ct_lo: ProofData offset 264..392 vs UserLedger offset 74..202
  const pdCtLo = pd.slice(264, 392);
  const lCtLo = l.slice(74, 202);

  console.log("=== ProofData new_ct_a_lo (full 128B) ===");
  for (let i = 0; i < 128; i += 32) {
    console.log(`  [${i}..${i+32}]: ${pdCtLo.slice(i, i+32).toString("hex")}`);
  }

  console.log("\n=== UserLedger balance_ct_lo (full 128B) ===");
  for (let i = 0; i < 128; i += 32) {
    console.log(`  [${i}..${i+32}]: ${lCtLo.slice(i, i+32).toString("hex")}`);
  }

  // Byte-by-byte diff
  let firstDiff = -1;
  for (let i = 0; i < 128; i++) {
    if (pdCtLo[i] !== lCtLo[i]) {
      firstDiff = i;
      break;
    }
  }
  console.log(`\nFirst difference at byte ${firstDiff}`);
  if (firstDiff >= 0) {
    console.log(`  ProofData[${firstDiff}] = 0x${pdCtLo[firstDiff].toString(16).padStart(2, '0')}`);
    console.log(`  Ledger[${firstDiff}]   = 0x${lCtLo[firstDiff].toString(16).padStart(2, '0')}`);
  }

  // Check version and status
  const version = l.readBigUInt64LE(586);
  const status = l[594];
  console.log(`\nUserLedger version: ${version}`);
  console.log(`UserLedger status byte: ${status} (0x${status.toString(16)})`);

  // Check last_settlement_id
  const settlementId = l.slice(595, 627).toString("hex");
  console.log(`last_settlement_id: ${settlementId}`);

  // Check if there are any non-zero bytes in the "expected" range (after version)
  const postVersion = l.slice(595, 738);
  const nonZeroPost = postVersion.filter(b => b !== 0).length;
  console.log(`Non-zero bytes after version (595..738): ${nonZeroPost}`);

  // Check ALL non-zero regions in the ledger
  console.log("\n=== Non-zero regions in UserLedger ===");
  for (let i = 0; i < l.length; i++) {
    if (l[i] !== 0) {
      const start = i;
      while (i < l.length && l[i] !== 0) i++;
      console.log(`  [${start}..${i}]: ${l.slice(start, Math.min(i, start + 16)).toString("hex")}${i - start > 16 ? "..." : ""}`);
    }
  }
}

main().catch(console.error);
