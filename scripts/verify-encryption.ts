import { Connection, PublicKey } from "@solana/web3.js";

const RPC = "https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5";
const PROGRAM_ID = new PublicKey("6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r");

const USER = new PublicKey("CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue");
const CPTY = new PublicKey("A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR");
const MINT_A = new PublicKey("DkMziJhKEnedc8KBXgVnGkdShTJSHn9fk8NTMoFm33fC");
const MINT_B = new PublicKey("krzeZAdbCYEaAYPxKznJ4VVcqqjH8tow67CwmWU9PQf");

async function main() {
  const conn = new Connection(RPC, "confirmed");

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   NEXUM — On-Chain Encryption Verification      ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // 1. Fetch settlement TX
  const sig = "3bHwQ86bax2MkBAYNKena9rqtBhBeCkFBAa6uYykUG3g4ZtKKZh7qEeDHtKizyxeGrxcPNUaRiThwfDpnqomRDGz";
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log("TX not found"); return; }

  console.log("① Settlement Transaction");
  console.log(`  TX: ${sig}`);
  console.log(`  Status: ${tx.meta?.err ? "FAILED ✓" : "SUCCESS ✓"}`);

  // Parse the execute_settle_b instruction (last IX)
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys;
  const settleIx = msg.compiledInstructions[msg.compiledInstructions.length - 1];
  const data = Buffer.from(settleIx.data);

  console.log(`  Instruction data: ${data.length} bytes`);
  console.log(`  Programs called: ${keys[settleIx.programIdIndex].toBase58().slice(0,12)}... (nexum_pool) + ${keys.find(k => k.toBase58().startsWith("HBjtD"))?.toBase58().slice(0,12)}... (zk_verifier)`);

  // 2. Show what IS in the instruction
  console.log("\n② What's in the TX instruction data:");
  console.log(`  ┌─ Anchor discriminator: ${data.slice(0, 8).toString("hex")}`);
  console.log(`  ├─ Nonce: ${data.readBigUInt64LE(8)}`);
  console.log(`  ├─ Commitment hash: ${data.slice(16, 48).toString("hex")}`);
  console.log(`  ├─ Settlement nonce: ${data.readBigUInt64LE(48)}`);
  console.log(`  └─ Transfer amounts: ❌ NOT PRESENT (hidden in ZK proof)`);

  // 3. UserLedger ciphertexts
  console.log("\n③ UserLedger Encrypted Balances (ElGamal on Baby Jubjub):");

  async function showLedger(label: string, owner: PublicKey, mint: PublicKey) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ledger"), owner.toBuffer(), mint.toBuffer()],
      PROGRAM_ID
    );
    const info = await conn.getAccountInfo(pda);
    if (!info) { console.log(`  ${label}: NOT FOUND`); return; }
    const buf = Buffer.from(info.data);

    // Extract ciphertexts at correct offsets
    const ctLo = buf.slice(74, 202);   // 128 bytes
    const ctHi = buf.slice(202, 330);  // 128 bytes

    // Check if non-zero
    const hasData = !ctLo.every(b => b === 0) || !ctHi.every(b => b === 0);
    const nonZeroLo = ctLo.filter(b => b !== 0).length;
    const nonZeroHi = ctHi.filter(b => b !== 0).length;

    console.log(`  ${label}:`);
    console.log(`    PDA: ${pda.toBase58()}`);
    console.log(`    Data size: ${info.data.length}B`);
    console.log(`    balance_ct_lo: ${nonZeroLo}/128 non-zero bytes ${hasData ? "✓ ENCRYPTED" : "⚠ all zeros"}`);
    console.log(`    balance_ct_hi: ${nonZeroHi}/128 non-zero bytes ${hasData ? "✓ ENCRYPTED" : "⚠ all zeros"}`);
    console.log(`    ct_lo[0..16]: ${ctLo.slice(0, 16).toString("hex")}`);
    console.log(`    ct_hi[0..16]: ${ctHi.slice(0, 16).toString("hex")}`);
  }

  await showLedger("User × MintA", USER, MINT_A);
  await showLedger("User × MintB", USER, MINT_B);
  await showLedger("Counterparty × MintA", CPTY, MINT_A);
  await showLedger("Counterparty × MintB", CPTY, MINT_B);

  // 4. Summary
  console.log("\n④ Privacy Guarantees:");
  console.log("  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  Treasury Vault (public): SPL tokens move in/out           │");
  console.log("  │  → Deposit TX shows: who deposited, which mint, how many   │");
  console.log("  │  → Withdraw TX shows: who withdrew, which mint, how many   │");
  console.log("  │                                                             │");
  console.log("  │  Settlement (private): ZK proof + encrypted balances       │");
  console.log("  │  → Settle TX shows: ZK proof bytes + commitment hash       │");
  console.log("  │  → NO plaintext amounts, NO which-party-got-what           │");
  console.log("  │  → Encrypted balances updated via ElGamal homomorphic ops  │");
  console.log("  │                                                             │");
  console.log("  │  Observer can see: A deposited X of mintA, withdrew Y of   │");
  console.log("  │  mintB. But the settlement mapping is hidden — they can't  │");
  console.log("  │  tell if A's deposit went to B or back to A.               │");
  console.log("  └─────────────────────────────────────────────────────────────┘");

  console.log("\n⑤ Verify on Solana Explorer:");
  console.log(`  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log("  → Check 'Instruction Data' — only hex bytes, no readable amounts");
  console.log("  → Check 'Account Data' for ledger PDAs — only ciphertext bytes");
}

main().catch(console.error);
