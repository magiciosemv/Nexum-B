import { Connection, PublicKey } from "@solana/web3.js";
import { deserializeCiphertext } from "../sdk/src/index";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  // Derive ProofData PDA from the settlement TX nonce
  const nonce = 1778398239072n;
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce, 0);
  const [proofDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proofs"), nonceBuf],
    PROGRAM_ID
  );
  console.log("ProofData PDA:", proofDataPda.toBase58());

  const info = await conn.getAccountInfo(proofDataPda);
  if (!info) { console.log("NOT FOUND"); return; }

  const buf = Buffer.from(info.data);
  console.log("Size:", buf.length, "bytes");

  // ProofData layout:
  // [0..8] discriminator
  // [8..264] proof_a (256B)
  // [264..392] new_ct_a_lo (128B)
  // [392..520] new_ct_a_hi (128B)
  // [520..648] audit_ct_a_lo (128B)
  // [648..776] audit_ct_a_hi (128B)
  // [776..1032] proof_b (256B)
  // [1032..1160] new_ct_b_lo (128B)
  // [1160..1288] new_ct_b_hi (128B)
  // [1288..1416] audit_ct_b_lo (128B)
  // [1416..1544] audit_ct_b_hi (128B)
  // [1544..1552] nonce (u64)
  // [1552] bump

  const fields = [
    { name: "new_ct_a_lo", start: 264, end: 392 },
    { name: "new_ct_a_hi", start: 392, end: 520 },
    { name: "new_ct_b_lo", start: 1032, end: 1160 },
    { name: "new_ct_b_hi", start: 1160, end: 1288 },
  ];

  for (const f of fields) {
    const chunk = buf.slice(f.start, f.end);
    const nonZero = chunk.filter(b => b !== 0).length;
    console.log(`\n${f.name} (${nonZero}/128 non-zero):`);
    console.log(`  hex: ${chunk.toString("hex").slice(0, 64)}...`);

    if (nonZero > 0) {
      try {
        const ct = deserializeCiphertext(new Uint8Array(chunk));
        console.log(`  ✓ deserialize OK: c1=[${ct.c1[0]}, ${ct.c1[1]}], c2=[${ct.c2[0]}, ${ct.c2[1]}]`);
      } catch (e: any) {
        console.log(`  ✗ deserialize FAILED: ${e.message}`);
        // Try showing the packed BigInt values
        const c1Packed = chunk.slice(0, 64).reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
        const c2Packed = chunk.slice(64, 128).reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
        console.log(`  c1 packed (first 16 hex): ${c1Packed.toString(16).slice(0, 16)}...`);
        console.log(`  c2 packed (first 16 hex): ${c2Packed.toString(16).slice(0, 16)}...`);
      }
    }
  }

  // Also check UserLedger ciphertexts at the same time
  console.log("\n=== UserLedger comparison ===");
  const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
  const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
  const [ledgerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER.toBuffer(), MINT_A.toBuffer()],
    PROGRAM_ID
  );
  const ledgerInfo = await conn.getAccountInfo(ledgerPda);
  if (ledgerInfo) {
    const ledger = Buffer.from(ledgerInfo.data);
    const ctLo = ledger.slice(74, 202);
    console.log("UserLedger ct_lo hex:", ctLo.toString("hex").slice(0, 64) + "...");

    // Compare with ProofData ct_a_lo
    const pdCtLo = buf.slice(264, 392);
    console.log("ProofData ct_a_lo hex:", pdCtLo.toString("hex").slice(0, 64) + "...");
    console.log("Match:", ctLo.equals(pdCtLo) ? "✓ IDENTICAL" : "✗ DIFFERENT");
  }
}

main().catch(console.error);
