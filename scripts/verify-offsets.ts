import { Connection, PublicKey } from "@solana/web3.js";

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

  console.log("Account length:", buf.length);

  // Verify fields at expected offsets
  const disc = buf.slice(0, 8).toString("hex");
  const owner = new PublicKey(buf.slice(8, 40)).toBase58();
  const mint = new PublicKey(buf.slice(40, 72)).toBase58();

  console.log(`\nbytes[0..8]   disc:  ${disc}`);
  console.log(`bytes[8..40]  owner: ${owner}`);
  console.log(`bytes[40..72] mint:  ${mint}`);
  console.log(`\nExpected owner: ${USER.toBase58()}`);
  console.log(`Expected mint:  ${MINT_A.toBase58()}`);
  console.log(`Owner match: ${owner === USER.toBase58()}`);
  console.log(`Mint match:  ${mint === MINT_A.toBase58()}`);

  // Show raw bytes 72..80 to see what's between mint and ciphertext
  console.log(`\nbytes[72..80]: ${buf.slice(72, 80).toString("hex")}`);
  console.log(`bytes[74..82]: ${buf.slice(74, 82).toString("hex")}`);

  // Try different offsets for balance_ct_lo
  console.log("\n=== Testing different balance_ct_lo offsets ===");
  for (let off = 72; off <= 76; off++) {
    const chunk = buf.slice(off, off + 128);
    const first16 = chunk.slice(0, 16).toString("hex");
    const last16 = chunk.slice(112, 128).toString("hex");
    console.log(`offset ${off}: first16=${first16} last16=${last16}`);
  }

  // Show the exact bytes around where ProofData has data
  // ProofData new_ct_a_lo[32..64] starts with 0769...
  // In UserLedger, where is 0769?
  console.log("\n=== Searching for 0769 pattern in UserLedger ===");
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x07 && buf[i+1] === 0x69) {
      console.log(`Found 0769 at offset ${i}`);
      console.log(`  context: ${buf.slice(Math.max(0, i-4), i+20).toString("hex")}`);
    }
  }

  // Show ProofData for comparison
  const nonce = 1778398239072n;
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce, 0);
  const [pdPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proofs"), nonceBuf], PROGRAM_ID
  );
  const pdInfo = await conn.getAccountInfo(pdPda);
  if (pdInfo) {
    const pd = Buffer.from(pdInfo.data);
    // ProofData new_ct_a_lo at offset 264
    console.log("\n=== ProofData new_ct_a_lo ===");
    console.log(`offset 264: ${pd.slice(264, 280).toString("hex")}`);
    console.log(`Full: ${pd.slice(264, 392).toString("hex")}`);
  }
}

main().catch(console.error);
