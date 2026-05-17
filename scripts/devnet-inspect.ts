/**
 * devnet-inspect.ts — 检查链上数据脚本
 *
 * 检查 SettlementRecord、UserLedger、SPL token 余额。
 * 用法：
 *   ANCHOR_PROVIDER_URL=https://devnet.helius-rpc.com/?api-key=... \
 *   npx ts-node scripts/devnet-inspect.ts [settlement_record地址]
 *
 * 不传地址则扫描所有 SettlementRecord。
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";

const RPC = process.env.ANCHOR_PROVIDER_URL || "https://devnet.helius-rpc.com";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

const DISC_MAP = {
  "b95465800806a053": "UserLedger",
  "ac9f434a605525cd": "SettlementRecord",
  "8f1ec79c2e50c1c3": "CommitSlot",
  "ae6d79dcc1509479": "ProofData",
  "cf5bfa1c98b3d7d1": "ProtocolConfig",
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function parseSettlementRecord(buf: Buffer) {
  return {
    partyA: new PublicKey(buf.slice(8, 40)).toBase58(),
    partyB: new PublicKey(buf.slice(40, 72)).toBase58(),
    assetAMint: new PublicKey(buf.slice(72, 104)).toBase58(),
    assetBMint: new PublicKey(buf.slice(104, 136)).toBase58(),
    commitmentHash: bytesToHex(buf.slice(136, 168)),
    versionA: Number(buf.readBigUInt64LE(168)),
    versionB: Number(buf.readBigUInt64LE(176)),
    scheme: buf[184],
    settledAt: buf.readUInt32LE(185),
    bump: buf[193],
  };
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const addr = process.argv[2];

  if (addr) {
    // Inspect specific account
    const pk = new PublicKey(addr);
    const info = await conn.getAccountInfo(pk);
    if (!info) { console.log("Account not found:", addr); return; }

    const disc = info.data.slice(0, 8).toString("hex");
    const type = (DISC_MAP as any)[disc] || "Unknown";
    console.log("=== " + addr + " ===");
    console.log("Type:", type, "Size:", info.data.length, "bytes");

    if (type === "SettlementRecord") {
      const rec = parseSettlementRecord(Buffer.from(info.data));
      console.log("\n--- SettlementRecord Fields ---");
      console.log("Party A:      ", rec.partyA);
      console.log("Party B:      ", rec.partyB);
      console.log("Asset A Mint: ", rec.assetAMint);
      console.log("Asset B Mint: ", rec.assetBMint);
      console.log("Commit Hash:  ", rec.commitmentHash);
      console.log("Version A:    ", rec.versionA);
      console.log("Version B:    ", rec.versionB);
      console.log("Scheme:       ", rec.scheme === 0 ? "SchemeA" : "SchemeB");
      console.log("Settled At:   ", rec.settledAt, "=", new Date(rec.settledAt * 1000).toISOString());
      console.log("Bump:         ", rec.bump);

      // Also check SPL token balances
      console.log("\n--- SPL Token Balances ---");
      const partyA = new PublicKey(rec.partyA);
      const partyB = new PublicKey(rec.partyB);
      const mintA = new PublicKey(rec.assetAMint);
      const mintB = new PublicKey(rec.assetBMint);

      for (const [owner, label] of [[partyA, "Party A"], [partyB, "Party B"]]) {
        for (const [mint, mintLabel] of [[mintA, "mintA"], [mintB, "mintB"]]) {
          try {
            const ata = getAssociatedTokenAddressSync(mint, owner);
            const acc = await getAccount(conn, ata);
            console.log(`  ${label} ${mintLabel}: ${acc.amount.toString()}`);
          } catch {
            console.log(`  ${label} ${mintLabel}: (no ATA)`);
          }
        }
      }
    }
    return;
  }

  // Scan all accounts
  console.log("Scanning all program accounts...\n");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID);
  const groups: Record<string, { pubkey: string; size: number }[]> = {};

  for (const { pubkey, account } of accounts) {
    const disc = account.data.slice(0, 8).toString("hex");
    const type = (DISC_MAP as any)[disc] || "Unknown (" + disc + ")";
    if (!groups[type]) groups[type] = [];
    groups[type].push({ pubkey: pubkey.toBase58(), size: account.data.length });
  }

  for (const [type, accts] of Object.entries(groups)) {
    console.log(type + " (" + accts.length + "):");
    for (const a of accts) {
      console.log("  " + a.pubkey + " (" + a.size + "B)");
    }
  }

  // Parse SettlementRecords
  const srDisc = "ac9f434a605525cd";
  const srAccounts = accounts.filter(a => a.account.data.slice(0, 8).toString("hex") === srDisc);
  if (srAccounts.length > 0) {
    console.log("\n=== SettlementRecords ===");
    for (const { pubkey, account } of srAccounts) {
      const rec = parseSettlementRecord(Buffer.from(account.data));
      console.log("\n" + pubkey.toBase58());
      console.log("  Party A:", rec.partyA);
      console.log("  Party B:", rec.partyB);
      console.log("  Scheme:", rec.scheme === 0 ? "SchemeA" : "SchemeB");
      console.log("  Settled:", new Date(rec.settledAt * 1000).toISOString());
      console.log("  Version:", rec.versionA, "/", rec.versionB);
    }
  }
}

main().catch(console.error);
