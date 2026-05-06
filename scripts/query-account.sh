#!/bin/bash
# Query on-chain account data via RPC
# Usage: bash scripts/query-account.sh <address>
#
# Examples:
#   bash scripts/query-account.sh 5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK  (Ledger A)
#   bash scripts/query-account.sh CjAUG1comMvGZj5rDjGaEVSuR2Q9SyRyrhWggmNkdtbD  (Ledger B)
#   bash scripts/query-account.sh DxqwvoyHAzzkbbpFPekfY78vgfBe7nimKMZpNGzms8jC  (ProtocolConfig)

set -e
cd "$(dirname "$0")/.."

ADDR="${1:?Usage: bash scripts/query-account.sh <address>}"
RPC="https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5"

/home/magic/.nvm/versions/node/v20.20.0/bin/node -e '
const { Connection, PublicKey } = require("@solana/web3.js");
const conn = new Connection("'"$RPC"'", "confirmed");
const addr = "'"$ADDR"'";

(async () => {
  console.log("Querying:", addr);
  console.log("RPC:", "'"$RPC"'");
  console.log("");

  const info = await conn.getAccountInfo(new PublicKey(addr));
  if (!info) { console.log("Account not found."); return; }

  console.log("Owner:", info.owner.toBase58());
  console.log("Lamports:", info.lamports);
  console.log("Data length:", info.data.length, "bytes");
  console.log("Executable:", info.executable);
  console.log("Rent epoch:", info.rentEpoch);
  console.log("");

  // Try to detect account type by owner + data length
  const PROGRAM = "BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P";
  if (info.owner.toBase58() === PROGRAM) {
    const statusNames = ["Active", "PendingInitiator", "BothPending", "PendingCounterparty", "Emergency"];

    if (info.data.length === 746 || info.data.length === 738) {
      console.log("=== UserLedger ===");
      console.log("Status (offset 592):", statusNames[info.data[592]] || "Unknown(" + info.data[592] + ")");
      console.log("Balance CT Lo (offset 98-162, 64B):", Buffer.from(info.data.slice(98, 162)).toString("hex"));
      console.log("Balance CT Hi (offset 162-226, 64B):", Buffer.from(info.data.slice(162, 226)).toString("hex"));
      console.log("Pending Nonce (offset 730-738):", info.data.readBigUInt64LE(730).toString());
    } else if (info.data.length >= 200 && info.data.length <= 210) {
      console.log("=== CommitSlot ===");
      console.log("Commitment Hash (offset 8-40, 32B):", Buffer.from(info.data.slice(8, 40)).toString("hex"));
      console.log("Status (offset 0):", info.data[0] === 0 ? "Open" : "Closed");
    } else if (info.data.length === 67) {
      console.log("=== ProtocolConfig ===");
      console.log("min_init_window:", Number(info.data.readBigUInt64LE(0)), "s");
      console.log("max_init_window:", Number(info.data.readBigUInt64LE(8)), "s");
      console.log("execute_window:", Number(info.data.readBigUInt64LE(16)), "s");
      console.log("clock_tolerance:", Number(info.data.readBigUInt64LE(24)), "s");
      console.log("max_version_slots:", Number(info.data.readBigUInt64LE(32)));
    } else if (info.data.length >= 1530 && info.data.length <= 1540) {
      console.log("=== ProofData ===");
      console.log("Data (first 64B):", Buffer.from(info.data.slice(0, 64)).toString("hex"));
    } else if (info.data.length >= 148 && info.data.length <= 162) {
      console.log("=== SettlementRecord ===");
      const schemeNames = ["SchemeA", "SchemeB"];
      console.log("Party A (offset 8):", new PublicKey(info.data.slice(8, 40)).toBase58());
      console.log("Party B (offset 40):", new PublicKey(info.data.slice(40, 72)).toBase58());
      console.log("Asset A Mint (offset 72):", new PublicKey(info.data.slice(72, 104)).toBase58());
      console.log("Asset B Mint (offset 104):", new PublicKey(info.data.slice(104, 136)).toBase58());
      console.log("Commitment Hash (offset 136-168):", Buffer.from(info.data.slice(136, 168)).toString("hex"));
      console.log("Version A (offset 168):", info.data.readBigUInt64LE(168).toString());
      console.log("Version B (offset 176):", info.data.readBigUInt64LE(176).toString());
      console.log("Scheme (offset 184):", schemeNames[info.data[184]] || "Unknown(" + info.data[184] + ")");
      console.log("Settled At (offset 185):", Number(info.data.readBigInt64LE(185)));
      console.log("Bump (offset 193):", info.data[193]);
    } else {
      console.log("=== Unknown nexum_pool account (" + info.data.length + "B) ===");
    }
  } else {
    console.log("=== Non-nexum_pool account ===");
  }

  console.log("");
  console.log("Full Data (hex):");
  const hex = Buffer.from(info.data).toString("hex");
  for (let i = 0; i < hex.length; i += 64) {
    const offset = (i / 2).toString().padStart(4, "0");
    console.log("  " + offset + ": " + hex.slice(i, i + 64));
  }
})();
'
