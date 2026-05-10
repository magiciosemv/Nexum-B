import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";

async function main() {
  const conn = new Connection(RPC, "confirmed");

  const sampleIds = [
    "DesM9HHZ8T2ngUBWJP6FTnAGUp7F34UvbAfDgKANAwFy",
    "R2syJ6ZgZZJCmMFw71mcbiC5nFeey18ovE2qn3uTCzq",
  ];

  for (const id of sampleIds) {
    const info = await conn.getAccountInfo(new PublicKey(id));
    if (!info) { console.log(`${id}: NOT FOUND`); continue; }

    const buf = Buffer.from(info.data);
    console.log(`\n=== ${id} (${buf.length}B) ===`);

    // SettlementRecord layout: disc(8) + party_a(32) + party_b(32) +
    // asset_a(32) + asset_b(32) + hash(32) + verA(8) + verB(8) + scheme(1) + settled_at(8) + bump(1)
    const partyA = new PublicKey(buf.slice(8, 40)).toBase58();
    const partyB = new PublicKey(buf.slice(40, 72)).toBase58();
    const assetA = new PublicKey(buf.slice(72, 104)).toBase58();
    const assetB = new PublicKey(buf.slice(104, 136)).toBase58();
    const hash = buf.slice(136, 168).toString("hex");
    const verA = Number(buf.readBigUInt64LE(168));
    const verB = Number(buf.readBigUInt64LE(176));
    const scheme = buf[184];
    const settledAt = Number(buf.readBigInt64LE(185));
    const bump = buf[193];

    console.log(`partyA: ${partyA}`);
    console.log(`partyB: ${partyB}`);
    console.log(`assetA: ${assetA}`);
    console.log(`assetB: ${assetB}`);
    console.log(`hash: ${hash.slice(0, 32)}...`);
    console.log(`verA: ${verA}, verB: ${verB}`);
    console.log(`scheme: ${scheme === 0 ? "SchemeA" : scheme === 1 ? "SchemeB" : scheme}`);
    console.log(`settledAt: ${new Date(settledAt * 1000).toISOString()}`);
    console.log(`bump: ${bump}`);

    // Now try to fetch the ledger ciphertexts for partyA × assetA
    const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");
    const [ledgerPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ledger"), new PublicKey(partyA).toBuffer(), new PublicKey(assetA).toBuffer()],
      PROGRAM_ID
    );
    const ledgerInfo = await conn.getAccountInfo(ledgerPda);
    if (ledgerInfo) {
      const lBuf = Buffer.from(ledgerInfo.data);
      const ctLo = lBuf.slice(72, 200);
      const ctHi = lBuf.slice(200, 328);
      const nonZeroLo = ctLo.filter(b => b !== 0).length;
      const nonZeroHi = ctHi.filter(b => b !== 0).length;
      console.log(`Ledger ${ledgerPda.toBase58().slice(0,12)}...: ct_lo ${nonZeroLo}/128 non-zero, ct_hi ${nonZeroHi}/128 non-zero`);
    } else {
      console.log(`Ledger not found for partyA × assetA`);
    }
  }
}

main().catch(console.error);
