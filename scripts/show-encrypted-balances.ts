/**
 * show-encrypted-balances.ts — 查询链上加密余额
 *
 * 用法：
 *   npx ts-node scripts/show-encrypted-balances.ts [settlement_record地址]
 *
 * 不传地址则使用默认测试数据。
 */

import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

// PDA helpers
function findLedgerPDA(owner: PublicKey, mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function formatHexFull(hex: string): string {
  // 每 32 个字符（16 字节）换行
  const lines: string[] = [];
  for (let i = 0; i < hex.length; i += 32) {
    lines.push(hex.slice(i, i + 32));
  }
  return lines.join("\n                ");
}

// 解析 SettlementRecord（202B 部署布局）
function parseSettlementRecord(buf: Buffer) {
  return {
    partyA: new PublicKey(buf.slice(8, 40)),
    partyB: new PublicKey(buf.slice(40, 72)),
    assetAMint: new PublicKey(buf.slice(72, 104)),
    assetBMint: new PublicKey(buf.slice(104, 136)),
    commitmentHash: buf.slice(136, 168),
    versionA: Number(buf.readBigUInt64LE(168)),
    versionB: Number(buf.readBigUInt64LE(176)),
    scheme: buf[184],
    settledAt: Number(buf.readBigUInt64LE(185)),
    bump: buf[193],
  };
}

// 解析 UserLedger（738B）
function parseUserLedger(buf: Buffer) {
  return {
    owner: new PublicKey(buf.slice(8, 40)),
    mint: new PublicKey(buf.slice(40, 72)),
    balanceCtLo: buf.slice(72, 200),      // 128 bytes
    balanceCtHi: buf.slice(200, 328),     // 128 bytes
    auditCtLo: buf.slice(328, 456),       // 128 bytes
    auditCtHi: buf.slice(456, 584),       // 128 bytes
    version: Number(buf.readBigUInt64LE(584)),
    status: buf[592],
    lastSettlementId: buf.slice(593, 625),
    bump: buf[625],
  };
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const settlementAddr = process.argv[2];
  if (!settlementAddr) {
    console.error("Usage: npx ts-node scripts/show-encrypted-balances.ts <SETTLEMENT_RECORD_ADDRESS>");
    process.exit(1);
  }

  console.log("=== NEXUM 链上加密余额查询 ===\n");

  // 1. 获取 SettlementRecord
  const srPk = new PublicKey(settlementAddr);
  const srInfo = await conn.getAccountInfo(srPk);
  if (!srInfo) {
    console.error("SettlementRecord not found:", settlementAddr);
    process.exit(1);
  }

  const sr = parseSettlementRecord(Buffer.from(srInfo.data));
  console.log("─ SettlementRecord ─");
  console.log("  Address:    ", settlementAddr);
  console.log("  Party A:    ", sr.partyA.toBase58());
  console.log("  Party B:    ", sr.partyB.toBase58());
  console.log("  Mint A:     ", sr.assetAMint.toBase58());
  console.log("  Mint B:     ", sr.assetBMint.toBase58());
  console.log("  Commitment: ", bytesToHex(sr.commitmentHash));
  console.log("  Version A:  ", sr.versionA);
  console.log("  Version B:  ", sr.versionB);
  console.log("  Settled At: ", new Date(sr.settledAt * 1000).toISOString());

  // 2. 获取四个 UserLedger（PartyA×MintA, PartyA×MintB, PartyB×MintA, PartyB×MintB）
  const ledgers = [
    { label: "Party A · Mint A", owner: sr.partyA, mint: sr.assetAMint },
    { label: "Party A · Mint B", owner: sr.partyA, mint: sr.assetBMint },
    { label: "Party B · Mint A", owner: sr.partyB, mint: sr.assetAMint },
    { label: "Party B · Mint B", owner: sr.partyB, mint: sr.assetBMint },
  ];

  console.log("\n─ UserLedger 加密余额 ─\n");

  for (const { label, owner, mint } of ledgers) {
    const ledgerPda = findLedgerPDA(owner, mint);
    const info = await conn.getAccountInfo(ledgerPda);

    if (!info) {
      console.log(`  ${label}: (ledger not found)`);
      console.log(`    PDA: ${ledgerPda.toBase58()}\n`);
      continue;
    }

    const ledger = parseUserLedger(Buffer.from(info.data));
    console.log(`  ${label}`);
    console.log(`    PDA:            ${ledgerPda.toBase58()}`);
    console.log(`    Version:        ${ledger.version}`);
    console.log(`    Status:         ${["Active", "PendingInitiator", "BothPending", "PendingCounterparty", "Emergency"][ledger.status] || ledger.status}`);

    // 加密余额（128字节密文）
    const loNonZero = Array.from(ledger.balanceCtLo).filter(b => b !== 0).length;
    const hiNonZero = Array.from(ledger.balanceCtHi).filter(b => b !== 0).length;
    console.log(`    balance_ct_lo:  ${loNonZero}/128 bytes non-zero`);
    console.log(`      hex: ${formatHexFull(bytesToHex(ledger.balanceCtLo))}`);
    console.log(`    balance_ct_hi:  ${hiNonZero}/128 bytes non-zero`);
    console.log(`      hex: ${formatHexFull(bytesToHex(ledger.balanceCtHi))}`);

    // 审计密文
    const auditLoNonZero = Array.from(ledger.auditCtLo).filter(b => b !== 0).length;
    const auditHiNonZero = Array.from(ledger.auditCtHi).filter(b => b !== 0).length;
    console.log(`    audit_ct_lo:    ${auditLoNonZero}/128 bytes non-zero`);
    console.log(`      hex: ${formatHexFull(bytesToHex(ledger.auditCtLo))}`);
    console.log(`    audit_ct_hi:    ${auditHiNonZero}/128 bytes non-zero`);
    console.log(`      hex: ${formatHexFull(bytesToHex(ledger.auditCtHi))}`);
    console.log(`    last_settle_id: ${bytesToHex(ledger.lastSettlementId)}`);
    console.log();
  }

  // 3. CommitSlot（可能已关闭）
  console.log("─ CommitSlot ─");
  const csAddr = "A4vvRuUEuGVF5Uqc8SXXXiF5n1B3Zgx5kVRhC8fp7X5N";
  const csInfo = await conn.getAccountInfo(new PublicKey(csAddr));
  if (csInfo) {
    const hash = csInfo.data.slice(40, 72);
    console.log(`  Address: ${csAddr}`);
    console.log(`  Hash:    ${bytesToHex(hash)}`);
    console.log(`  Status:  ${csInfo.data[196]} (2=Settled, 3=Cancelled)`);
  } else {
    console.log(`  ${csAddr}: closed (rent refunded)`);
  }

}

main().catch(console.error);
