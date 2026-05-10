import { Connection, PublicKey } from "@solana/web3.js";
import { deserializeCiphertext } from "../sdk/src/index";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID
  );
  const info = await conn.getAccountInfo(pda);
  if (!info) return;
  const buf = Buffer.from(info.data);

  console.log("=== Testing offsets with -2 shift ===\n");

  // Standard offsets: balance_ct_lo=74, balance_ct_hi=202
  // With -2 shift: balance_ct_lo=72, balance_ct_hi=200
  // But -2 means we ADD 2 to the start, so: 76, 204

  // Actually, the data in UserLedger is shifted +2 compared to ProofData.
  // ProofData has data at offset 32 within the 128B window.
  // UserLedger has the SAME data at offset 0 within the 128B window.
  // This means UserLedger ciphertexts start 2 bytes EARLIER.
  // So if standard offset is 74, the actual offset might be 72.

  // Let me test: read 128 bytes starting at offset 72
  const ctLo72 = buf.slice(72, 200);
  console.log("At offset 72 (128B):");
  console.log(`  first 32B: ${ctLo72.slice(0, 32).toString("hex")}`);
  console.log(`  [32..64]:  ${ctLo72.slice(32, 64).toString("hex")}`);

  // Check if this matches ProofData format
  // ProofData: [00..00, 0769..c68b, 00..00, 8859..9c20]
  // UserLedger at 72: should be [00..00, 0769..c68b, 00..00, 8859..9c20]
  // But UserLedger at 74: [00..0769, 6fff..0000, 00..8859, 7f04..0000]

  // So at offset 72, the first 32B should be all zeros (matching ProofData)
  const isZeros = ctLo72.slice(0, 32).every(b => b === 0);
  console.log(`  first 32B all zeros: ${isZeros}`);

  // Try deserializing at offset 72
  try {
    const ct = deserializeCiphertext(new Uint8Array(ctLo72));
    console.log(`  ✓ DESERIALIZE OK at offset 72!`);
    console.log(`  c1=[${ct.c1[0].toString().slice(0,20)}..., ${ct.c1[1].toString().slice(0,20)}...]`);
  } catch (e: any) {
    console.log(`  ✗ Failed at 72: ${e.message}`);
  }

  // Try offset 76 (standard 74 + 2)
  const ctLo76 = buf.slice(76, 204);
  try {
    const ct = deserializeCiphertext(new Uint8Array(ctLo76));
    console.log(`  ✓ DESERIALIZE OK at offset 76!`);
  } catch (e: any) {
    console.log(`  ✗ Failed at 76: ${e.message}`);
  }

  // Try all offsets 70..80
  console.log("\n=== Scanning offsets 70..80 ===");
  for (let off = 70; off <= 80; off++) {
    const chunk = buf.slice(off, off + 128);
    try {
      deserializeCiphertext(new Uint8Array(chunk));
      console.log(`  offset ${off}: ✓ VALID`);
    } catch {
      // silent
    }
  }

  // Also check the version field at different offsets
  console.log("\n=== Scanning version field ===");
  for (let off = 584; off <= 598; off++) {
    const val = buf.readBigUInt64LE(off);
    const status = buf[off + 8];
    if (val < 100n && status <= 4) {
      console.log(`  offset ${off}: version=${val}, status=${status} ← LIKELY CORRECT`);
    }
  }
}

main().catch(console.error);
