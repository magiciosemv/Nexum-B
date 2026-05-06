/**
 * Debug: compare circomlib Sha256 output format with standard SHA-256.
 * Generates a test input with KNOWN hash, then tries both bit orderings
 * to see which one produces the correct commitment_hash_lo/hi.
 */
import * as crypto from "crypto";
import * as fs from "fs";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function u64ToLEBits(val: bigint | number, bits: number): number[] {
  const v = BigInt(val);
  return Array.from({ length: bits }, (_, i) => Number((v >> BigInt(i)) & 1n));
}

const NONCE = 12345678901234n;
const TRANSFER_LO = 999999;
const TRANSFER_HI = 0;
const EXPIRY = 1714000000;
const ASSET_A_MINT = hexToBytes("069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001");
const ASSET_B_MINT = hexToBytes("c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61");
const COUNTERPARTY = hexToBytes("7e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f2");
const EXPECTED_HASH = "150563d21f589454d29ebaf8f13660b86477449674a4e0df4495e4f00d73e2db";

// Build 120-byte preimage
const preimage = Buffer.alloc(120);
preimage.writeBigUInt64LE(NONCE, 0);
preimage.writeUInt32LE(TRANSFER_LO, 8);
preimage.writeUInt32LE(TRANSFER_HI, 12);
preimage.set(ASSET_A_MINT, 16);
preimage.set(ASSET_B_MINT, 48);
preimage.set(COUNTERPARTY, 80);
preimage.writeInt32LE(EXPIRY & 0xFFFFFFFF, 112);
preimage.writeInt32LE(Math.floor(EXPIRY / 0x100000000), 116);

const hash = crypto.createHash("sha256").update(preimage).digest();
console.log("Standard SHA-256:", hash.toString("hex"));
console.log("Expected:        ", EXPECTED_HASH);

// Convert hash to two 128-bit field elements (standard big-endian)
const hashHiBigInt = BigInt("0x" + hash.subarray(0, 16).toString("hex"));
const hashLoBigInt = BigInt("0x" + hash.subarray(16, 32).toString("hex"));

// Convert hash to 256 bits in TWO possible orderings for circomlib
// Option A: circomlib output has reversed-per-word (we reverse back → standard)
// Option B: circomlib output is already standard (no reversal needed)

// Simulate what the circuit would compute for each option
// circomlib Sha256compression output: sha.out[w*32+k] = bit k of Hw (LSB-first)
// If we DON'T reverse (Option B): hash_out[k] = sha.out[k] = LSB-first per word
// If we DO reverse (Option A): hash_standard[w*32+k] = sha.out[w*32+31-k] = MSB-first per word

// For Option B (no reversal): the output is LSB-first per 32-bit word
// To convert to a number: we'd need to handle this differently

// Let's just check: what would hash_lo and hash_hi be under each interpretation?

// Standard hash bytes (MSB first):
console.log("\n=== Standard hash bytes ===");
for (let i = 0; i < 32; i++) {
  process.stdout.write(hash[i].toString(16).padStart(2, "0"));
  if (i === 15) process.stdout.write(" ");
}
console.log();

// If circomlib output is LSB-first per word, then:
// sha.out = [H0_bit0, H0_bit1, ..., H0_bit31, H1_bit0, ..., H7_bit31]
// Where H0_bit0 = LSB of first hash word
// Standard hash word 0 = first 4 bytes = hash[0..3] = 0x150563d2
// H0_bit0 (LSB) = bit 0 of 0x150563d2 = 0
// H0_bit31 (MSB) = bit 31 of 0x150563d2 = 0

// When we reverse per word: hash_standard[w*32+k] = sha.out[w*32+31-k]
// hash_standard[0] = sha.out[31] = H0_bit31 = MSB of H0 = bit 7 of hash[0]
// hash_standard is in MSB-first order = standard

// When we DON'T reverse: hash_out[w*32+k] = sha.out[w*32+k]
// hash_out[0] = sha.out[0] = H0_bit0 = LSB of H0
// hash_out is in LSB-first-per-word order

// For Bits2Num, input is LSB-first.
// If we DON'T reverse, and feed directly to Bits2Num for each 128-bit half:

// Lower 128 bits (bytes 16-31):
// If no reversal, bits are: H4_bit0, H4_bit1, ..., H4_bit31, H5_bit0, ..., H7_bit31
// This is already LSB-first! (bit 0 of H4 = LSB of the lower half's most significant word)
// Wait, that's not right. H4 is word 4, which corresponds to bytes 16-19.
// H4 as big-endian = 0x(hash[16])(hash[17])(hash[18])(hash[19])

// For Bits2Num to give the correct value, the input should be:
// bit 0 = LSB of the 128-bit number
// In standard representation, the 128-bit number for lower half is:
// value = H4*2^96 + H5*2^64 + H6*2^32 + H7
// LSB = bit 0 of H7

// circomlib order (no reversal): sha.out[128..255]
// sha.out[128] = H4_bit0 (LSB of H4)
// sha.out[159] = H4_bit31 (MSB of H4)
// sha.out[160] = H5_bit0 (LSB of H5)
// ...
// sha.out[255] = H7_bit31 (MSB of H7)

// For Bits2Num (LSB first), we need:
// in[0] = bit 0 of value = bit 0 of H7 = sha.out[224+0] = sha.out[224]
// in[127] = bit 127 of value = bit 31 of H4 = sha.out[128+31] = sha.out[159]

// So: in[i] = sha.out[255-i] for the lower half (reversing the ENTIRE 128-bit block)
// Or equivalently: b2n_lo.in[i] = sha.out[255-i]

// Hmm wait, that's interesting. If the circomlib output is LSB-first per word,
// and I reverse the entire 128-bit block for Bits2Num...

// Let me compute what value that gives:
// b2n_lo.in[0] = sha.out[255] = H7_bit31 (MSB of H7)
// b2n_lo.in[31] = sha.out[224] = H7_bit0 (LSB of H7)
// b2n_lo.in[32] = sha.out[223] = H6_bit31 (MSB of H6)
// b2n_lo.in[127] = sha.out[128] = H4_bit0 (LSB of H4)

// Bits2Num interprets in[0] as bit 0 (LSB) and in[127] as bit 127 (MSB)
// So: bit 0 = H7_bit31 (MSB of H7)
//     bit 31 = H7_bit0 (LSB of H7)
//     bit 32 = H6_bit31 (MSB of H6)
//     bit 127 = H4_bit0 (LSB of H4)

// This gives: value = reversed_words * powers, which is NOT the standard value.
// The standard value has H4 as the most significant word.

// OK, I think the issue might be more nuanced. Let me try a completely different approach.
// Instead of trying to figure out the bit ordering, let me just try BOTH options
// and output both as field elements, so I can see which matches.

console.log("\n=== Computed hash_lo/hi under different assumptions ===");
console.log("Standard (hashHi/Lo from bytes):", hashHiBigInt.toString(), "/", hashLoBigInt.toString());

// For debugging: create TWO versions of the input file with different hash values
// Version 1: as-is (with bit reversal)
// Version 2: without bit reversal (hash from raw circomlib output)

// Actually, the fastest way to debug is to make the circuit OUTPUT the hash
// instead of comparing. Let me create a debug circuit.

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
};

// Try multiple hash_lo/hi values
// Option 1: Standard big-endian split
const input_standard = { ...circuitInput, commitment_hash_lo: hashLoBigInt.toString(), commitment_hash_hi: hashHiBigInt.toString() };

// Option 2: Reversed (swap lo/hi)
const input_swapped = { ...circuitInput, commitment_hash_lo: hashHiBigInt.toString(), commitment_hash_hi: hashLoBigInt.toString() };

// Option 3: If circomlib output doesn't need per-word reversal
// The raw output is LSB-first per word. Feeding directly to Bits2Num...
// Let me compute what Bits2Num would give if we feed sha.out[128..255] reversed
// b2n_lo.in[i] = sha.out[255-i]
// This is equivalent to reversing the entire 128-bit sequence

// For the lower 128 bits in standard order:
// hash_standard[128..255] = H4_MSB..H4_LSB, H5_MSB..H5_LSB, ..., H7_MSB..H7_LSB
// Standard value = H4*2^96 + H5*2^64 + H6*2^32 + H7

// In circomlib format (LSB first per word):
// sha.out[128..255] = H4_LSB..H4_MSB, H5_LSB..H5_MSB, ..., H7_LSB..H7_MSB

// If we reverse the ENTIRE 128 bits: sha.out[255..128] = H7_MSB..H7_LSB, H6_MSB..H6_LSB, ..., H4_MSB..H4_LSB
// Feeding to Bits2Num (LSB first): in[0]=H7_MSB, in[31]=H7_LSB, in[32]=H6_MSB, ..., in[127]=H4_LSB
// This gives: value = H7_reversed*2^96 + H6_reversed*2^64 + H5_reversed*2^32 + H4_reversed
// Where Hw_reversed means the bit-reversed 32-bit word.
// This is NOT the standard value!

// For Bits2Num to give the standard value, we need:
// in[0] = LSB of the 128-bit number = bit 0 of H7
// in[127] = MSB = bit 31 of H4

// If circomlib output is LSB-first per word:
// bit 0 of H7 = sha.out[7*32+0] = sha.out[224]
// bit 31 of H4 = sha.out[4*32+31] = sha.out[159]

// So we need: in[i] = sha.out[224 + i] for i in [0..31] (H7 bits, LSB first)
//           = sha.out[192 + (i-32)] for i in [32..63] (H6 bits, LSB first)
//           = sha.out[160 + (i-64)] for i in [64..95] (H5 bits, LSB first)
//           = sha.out[128 + (i-96)] for i in [96..127] (H4 bits, LSB first)

// This is: in[i] = sha.out[128 + (3 - floor(i/32))*32 + (i%32)]
// = sha.out[128 + (96 - floor(i/32)*32) + (i%32)]
// = sha.out[224 - floor(i/32)*32 + (i%32)]

// This is word-reversed but NOT bit-reversed within words!

// So if the circomlib output is LSB-first per word, to get the standard value:
// We need to: reverse the word order (but NOT reverse bits within words)
// Then feed directly to Bits2Num

// The standard value = H4*2^96 + H5*2^64 + H6*2^32 + H7
// Bits2Num expects LSB first: in[0]=bit0(H7), in[31]=bit31(H7), in[32]=bit0(H6), etc.
// circomlib: sha.out[128..255] = H4_lsb..H4_msb, H5_lsb..H5_msb, H6_lsb..H6_msb, H7_lsb..H7_msb
// We need: H7_lsb..H7_msb, H6_lsb..H6_msb, H5_lsb..H5_msb, H4_lsb..H4_msb
// So we reverse the word order (groups of 32 bits)

// Let me compute the value for "no per-word reversal, but word-order reversal"
// Actually, this is getting too complicated. Let me just try both options empirically.

// For "no reversal" (Option B):
// sha.out[128..255] in LSB-first per word
// Feed to Bits2Num with word-order reversal
// Value = sum over w=0..3 of reverseBits(H_{7-w}) * 2^(w*32)

function reverseBits32(val: number): number {
  let result = 0;
  for (let i = 0; i < 32; i++) {
    result = (result << 1) | ((val >> i) & 1);
  }
  return result >>> 0; // unsigned
}

// Extract H4..H7 as 32-bit words from the standard hash
const H = Array.from({ length: 8 }, (_, i) => hash.readUInt32BE(i * 4));

console.log("\nHash words (big-endian u32):");
for (let i = 0; i < 8; i++) console.log(`  H${i} = 0x${H[i].toString(16).padStart(8, '0')} (${H[i]})`);

// Option B (no per-word reversal): each Hw has its bits reversed in circomlib output
// Bits2Num with word-order reversal gives:
// value_lo = reverseBits(H7)*2^0 + reverseBits(H6)*2^32 + reverseBits(H5)*2^64 + reverseBits(H4)*2^96
const Hr = H.map(reverseBits32);
const value_lo_B = BigInt(Hr[7]) + (BigInt(Hr[6]) << 32n) + (BigInt(Hr[5]) << 64n) + (BigInt(Hr[4]) << 96n);
const value_hi_B = BigInt(Hr[3]) + (BigInt(Hr[2]) << 32n) + (BigInt(Hr[1]) << 64n) + (BigInt(Hr[0]) << 96n);

console.log("\nOption B (no per-word reversal, word-order reversal for Bits2Num):");
console.log("  hash_lo =", value_lo_B.toString());
console.log("  hash_hi =", value_hi_B.toString());

// Also try: no reversal at all, direct mapping
// sha.out[128..255] → Bits2Num directly (reversing entire 128 bits)
// in[i] = sha.out[255-i]
// value = sum over i=0..127 of sha.out[255-i] * 2^i

// sha.out[128+j] = bit (j%32) of H_{4+floor(j/32)} (LSB first)
// sha.out[255-i] = sha.out[128+(127-i)] = bit ((127-i)%32) of H_{4+floor((127-i)/32)}

// This is getting really complex. Let me just output the standard values and both options.
console.log("\n=== Summary of all options ===");
console.log("Standard (current circuit, with per-word reversal):");
console.log("  hash_lo =", hashLoBigInt.toString());
console.log("  hash_hi =", hashHiBigInt.toString());
console.log("\nSwapped (lo/hi reversed):");
console.log("  hash_lo =", hashHiBigInt.toString());
console.log("  hash_hi =", hashLoBigInt.toString());
console.log("\nOption B (no reversal, word-reversed for Bits2Num):");
console.log("  hash_lo =", value_lo_B.toString());
console.log("  hash_hi =", value_hi_B.toString());

// Write all three as test inputs
const opts = [
  { name: "standard", lo: hashLoBigInt, hi: hashHiBigInt },
  { name: "swapped", lo: hashHiBigInt, hi: hashLoBigInt },
  { name: "option_b", lo: value_lo_B, hi: value_hi_B },
];
for (const opt of opts) {
  const input = { ...circuitInput, commitment_hash_lo: opt.lo.toString(), commitment_hash_hi: opt.hi.toString() };
  const path = `circuits/build_private/test_input_${opt.name}.json`;
  fs.writeFileSync(path, JSON.stringify(input, null, 2));
  console.log(`\nWrote ${path}`);
}
