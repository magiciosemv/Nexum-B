import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

const USER_WALLET = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), USER_WALLET.toBuffer(), MINT_A.toBuffer()],
    PROGRAM_ID
  );
  console.log(`Ledger: ${pda.toBase58()}`);
  const info = await conn.getAccountInfo(pda);
  if (!info) return;
  const buf = Buffer.from(info.data);
  console.log(`Length: ${buf.length} bytes\n`);

  // Full hex dump
  for (let i = 0; i < buf.length; i += 16) {
    const hex = buf.slice(i, Math.min(i + 16, buf.length)).toString("hex").match(/.{2}/g)!.join(" ");
    console.log(`${i.toString().padStart(4, "0")}: ${hex}`);
  }

  // Parse with known offsets
  console.log("\n=== Parsed fields ===");
  console.log(`Owner:  ${new PublicKey(buf.slice(8, 40)).toBase58()}`);
  console.log(`Mint:   ${new PublicKey(buf.slice(40, 72)).toBase58()}`);

  // balance_ct_lo: 74..202
  const ctLo = buf.slice(74, 202);
  console.log(`balance_ct_lo (128B): ${ctLo.slice(0, 16).toString("hex")}... (all-zero: ${ctLo.every(b => b === 0)})`);

  // balance_ct_hi: 202..330
  const ctHi = buf.slice(202, 330);
  console.log(`balance_ct_hi (128B): ${ctHi.slice(0, 16).toString("hex")}... (all-zero: ${ctHi.every(b => b === 0)})`);

  // audit_ct_lo: 330..458
  const auditLo = buf.slice(330, 458);
  console.log(`audit_ct_lo (128B):   ${auditLo.slice(0, 16).toString("hex")}... (all-zero: ${auditLo.every(b => b === 0)})`);

  // audit_ct_hi: 458..586
  const auditHi = buf.slice(458, 586);
  console.log(`audit_ct_hi (128B):   ${auditHi.slice(0, 16).toString("hex")}... (all-zero: ${auditHi.every(b => b === 0)})`);

  // version: 586..594
  const version = buf.readBigUInt64LE(586);
  console.log(`version (u64 LE @586): ${version}`);

  // status: 594
  const statusNames = ["Active", "PendingInitiator", "BothPending", "PendingCounterparty", "Emergency"];
  const status = buf[594];
  console.log(`status (u8 @594): ${status} = ${statusNames[status] || "unknown"}`);

  // last_settlement_id: 595..627
  console.log(`last_settlement_id (32B @595): ${buf.slice(595, 627).toString("hex")}`);

  // bump: 627
  console.log(`bump (u8 @627): ${buf[627]}`);

  // pending fields
  console.log(`pending_commitment (32B @628): ${buf.slice(628, 660).toString("hex")}`);
  console.log(`pending_expiry (i64 @660): ${buf.readBigInt64LE(660)}`);
  console.log(`pending_counterparty @668: ${new PublicKey(buf.slice(668, 700)).toBase58()}`);
  console.log(`pending_asset_b_mint @700: ${new PublicKey(buf.slice(700, 732)).toBase58()}`);
  console.log(`pending_nonce (u64 @732): ${buf.readBigUInt64LE(732)}`);
}

main().catch(console.error);
