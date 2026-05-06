/**
 * Verify balance_transition_private.circom produces correct SHA-256 commitment hash.
 *
 * Uses the same test vector as commitment_consistency.test.ts:
 *   Expected: 150563d21f589454d29ebaf8f13660b86477449674a4e0df4495e4f00d73e2db
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ── Helpers ──────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function u64ToLEBits(val: bigint | number, bits: number): number[] {
  const v = BigInt(val);
  const result: number[] = [];
  for (let i = 0; i < bits; i++) {
    result.push(Number((v >> BigInt(i)) & 1n));
  }
  return result;
}

function u32ToLEBytes(val: number): number[] {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val);
  return Array.from(buf);
}

function u64ToLEBytes(val: bigint | number): number[] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val));
  return Array.from(buf);
}

// ── Test vector (same as commitment_consistency.test.ts) ──────────
const NONCE = 12345678901234n;
const TRANSFER_LO = 999999;
const TRANSFER_HI = 0;
const EXPIRY = 1714000000;
const ASSET_A_MINT = hexToBytes("069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001");
const ASSET_B_MINT = hexToBytes("c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61");
const COUNTERPARTY = hexToBytes("7e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f2");

const EXPECTED_HASH_HEX = "150563d21f589454d29ebaf8f13660b86477449674a4e0df4495e4f00d73e2db";

// ── Build 120-byte preimage (same as computeCommitment) ──────────
const preimage = Buffer.alloc(120);
preimage.writeBigUInt64LE(NONCE, 0);          // nonce (8B)
preimage.writeUInt32LE(TRANSFER_LO, 8);       // transfer_lo (4B)
preimage.writeUInt32LE(TRANSFER_HI, 12);      // transfer_hi (4B)
preimage.set(ASSET_A_MINT, 16);               // asset_a_mint (32B)
preimage.set(ASSET_B_MINT, 48);               // asset_b_mint (32B)
preimage.set(COUNTERPARTY, 80);               // counterparty (32B)
preimage.writeInt32LE(EXPIRY & 0xFFFFFFFF, 112);  // expiry_lo (4B)
preimage.writeInt32LE(Math.floor(EXPIRY / 0x100000000), 116); // expiry_hi (4B)

const hash = crypto.createHash("sha256").update(preimage).digest();
const hashHex = hash.toString("hex");
console.log("SHA-256 hash from Node.js:", hashHex);
console.log("Expected hash:          ", EXPECTED_HASH_HEX);
console.log("Match:", hashHex === EXPECTED_HASH_HEX ? "✅ YES" : "❌ NO");

// ── Split 256-bit hash into two 128-bit field elements ──────────
// hash_hi = bytes 0..15 (upper 128 bits, big-endian)
// hash_lo = bytes 16..31 (lower 128 bits, big-endian)
const hashHiBigInt = BigInt("0x" + hash.subarray(0, 16).toString("hex"));
const hashLoBigInt = BigInt("0x" + hash.subarray(16, 32).toString("hex"));
console.log("commitment_hash_hi:", hashHiBigInt.toString());
console.log("commitment_hash_lo:", hashLoBigInt.toString());

// ── Build circuit input ──────────────────────────────────────────
const oldBalanceLo = 2000000;
const oldBalanceHi = 0;
const newBalanceLo = 1000001;
const newBalanceHi = 0;

const circuitInput = {
  old_balance_lo: oldBalanceLo,
  old_balance_hi: oldBalanceHi,
  transfer_lo: TRANSFER_LO,
  transfer_hi: TRANSFER_HI,
  new_balance_lo: newBalanceLo,
  new_balance_hi: newBalanceHi,
  nonce_bits: u64ToLEBits(NONCE, 64),
  asset_a_mint_bytes: Array.from(ASSET_A_MINT),
  asset_b_mint_bytes: Array.from(ASSET_B_MINT),
  counterparty_bytes: Array.from(COUNTERPARTY),
  expiry_bits: u64ToLEBits(EXPIRY, 64),
  commitment_hash_lo: hashLoBigInt.toString(),
  commitment_hash_hi: hashHiBigInt.toString(),
};

// Write input file
const INPUT_PATH = path.join(__dirname, "../circuits/build_private/test_input.json");
fs.writeFileSync(INPUT_PATH, JSON.stringify(circuitInput, null, 2));
console.log("\nCircuit input written to:", INPUT_PATH);
console.log("Balances: old=", oldBalanceLo, " new=", newBalanceLo, " transfer=", TRANSFER_LO);
console.log("Balance constraint: old === new + transfer?", oldBalanceLo === newBalanceLo + TRANSFER_LO);
