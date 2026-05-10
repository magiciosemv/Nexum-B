import { Connection, PublicKey } from "@solana/web3.js";
import { deserializeCiphertext, elgamalDecryptU32, findLedgerPDA } from "../sdk/src/index";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const CPTY = new PublicKey("A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
const MINT_B = new PublicKey("krzeZAdbCYEaAYPxKznJ4VVcqqjH8tow67CwmWU9PQf");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  console.log("=== 1. SDK exports verified ===");
  console.log("deserializeCiphertext:", typeof deserializeCiphertext, "✓");
  console.log("elgamalDecryptU32:", typeof elgamalDecryptU32, "✓");
  console.log("findLedgerPDA:", typeof findLedgerPDA, "✓");

  console.log("\n=== 2. findLedgerPDA ===");
  const [ledgerA] = findLedgerPDA(USER, MINT_A, PROGRAM_ID);
  const [ledgerB] = findLedgerPDA(CPTY, MINT_B, PROGRAM_ID);
  console.log("User×MintA:", ledgerA.toBase58());
  console.log("Cpty×MintB:", ledgerB.toBase58());

  console.log("\n=== 3. Fetch ciphertexts ===");
  const infoA = await conn.getAccountInfo(ledgerA);
  const infoB = await conn.getAccountInfo(ledgerB);
  if (!infoA) { console.log("User×MintA: NOT FOUND"); return; }
  if (!infoB) { console.log("Cpty×MintB: NOT FOUND"); return; }

  const bufA = Buffer.from(infoA.data);
  const bufB = Buffer.from(infoB.data);
  const ctLoA = new Uint8Array(bufA.slice(74, 202));
  const ctHiA = new Uint8Array(bufA.slice(202, 330));
  const ctLoB = new Uint8Array(bufB.slice(74, 202));
  const ctHiB = new Uint8Array(bufB.slice(202, 330));

  console.log("User×MintA ct_lo:", ctLoA.filter(b => b !== 0).length, "non-zero bytes");
  console.log("User×MintA ct_hi:", ctHiA.filter(b => b !== 0).length, "non-zero bytes");
  console.log("Cpty×MintB ct_lo:", ctLoB.filter(b => b !== 0).length, "non-zero bytes");
  console.log("Cpty×MintB ct_hi:", ctHiB.filter(b => b !== 0).length, "non-zero bytes");

  console.log("\n=== 4. ElGamal deserialize test ===");
  try {
    const ct = deserializeCiphertext(ctLoA);
    console.log("deserialize OK:", JSON.stringify(ct).slice(0, 80) + "...");
  } catch (e: any) {
    console.log("deserialize error:", e.message);
  }

  console.log("\n=== 5. SettlementRecord on-chain ===");
  const commitSlot = new PublicKey("9YVR4Km7bTN8bJaidEjxRNGckjXZm6xQ53nJwXfM7hV4");
  for (let nonce = 0; nonce < 3; nonce++) {
    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeUInt32LE(nonce, 0);
    const [srPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("settlement"), commitSlot.toBuffer(), nonceBuf],
      PROGRAM_ID
    );
    const srInfo = await conn.getAccountInfo(srPda);
    if (srInfo) {
      const data = Buffer.from(srInfo.data);
      const partyA = new PublicKey(data.slice(8, 40)).toBase58();
      const partyB = new PublicKey(data.slice(40, 72)).toBase58();
      const hash = data.slice(136, 168).toString("hex");
      const settledAt = Number(data.readBigInt64LE(177));
      console.log(`nonce=${nonce}: EXISTS`);
      console.log(`  partyA: ${partyA}`);
      console.log(`  partyB: ${partyB}`);
      console.log(`  hash: ${hash}`);
      console.log(`  settledAt: ${new Date(settledAt * 1000).toISOString()}`);
    } else {
      console.log(`nonce=${nonce}: not found`);
    }
  }

  console.log("\n=== 6. Sample SettlementRecords (regulator page) ===");
  for (const id of ["DesM9HHZ8T2ngUBWJP6FTnAGUp7F34UvbAfDgKANAwFy", "R2syJ6ZgZZJCmMFw71mcbiC5nFeey18ovE2qn3uTCzq"]) {
    const info = await conn.getAccountInfo(new PublicKey(id));
    console.log(`${id.slice(0,16)}...: ${info ? `EXISTS (${info.data.length}B)` : "NOT FOUND"}`);
  }
}

main().catch(console.error);
