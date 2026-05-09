/**
 * Cross-language commitment hash consistency test.
 *
 * Verifies that TypeScript and Rust produce byte-for-byte identical
 * SHA-256 hashes for the same 128-byte input (v3.1 two-way swap layout).
 *
 * CRITICAL: If this test fails, the entire Scheme B protocol breaks.
 */

import { computeCommitment, verifyCommitment } from "../sdk/src/crypto/commitment";

// ── Test vector (identical to Rust test_cross_language_vector) ────────
const NONCE = 12345678901234n;
const TRANSFER_A_LO = 999999;
const TRANSFER_A_HI = 0;
const TRANSFER_B_LO = 500000;
const TRANSFER_B_HI = 0;
const EXPIRY = 1714000000;

// These pubkeys MUST match the Rust test exactly:
// So11111111111111111111111111111111111111112
// EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
// 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

const ASSET_A_MINT = hexToBytes("069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001");
const ASSET_B_MINT = hexToBytes("c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61");
const COUNTERPARTY = hexToBytes("7e8c088760bfde1dddcf32c17f209b8242ee52aaf131facd88d0ea2c6d0b06f2");

const TEST_VECTOR = {
  nonce: NONCE,
  transfer_a_lo: TRANSFER_A_LO,
  transfer_a_hi: TRANSFER_A_HI,
  transfer_b_lo: TRANSFER_B_LO,
  transfer_b_hi: TRANSFER_B_HI,
  asset_a_mint: ASSET_A_MINT,
  asset_b_mint: ASSET_B_MINT,
  counterparty: COUNTERPARTY,
  expiry_timestamp: EXPIRY,
};

// Expected hash from Rust side (MUST match exactly)
const EXPECTED_HASH_HEX = "1c25fac0dfbd7ef191efed9c32f4671eedff5f2e710757fb56c9b79ad2dbaa2f";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // ── Test 1: Cross-language consistency (THE critical test) ──────────
  try {
    const hash = await computeCommitment(TEST_VECTOR);
    const hexHash = bytesToHex(hash);
    console.log(`Cross-language test vector hash (TS):   ${hexHash}`);
    console.log(`Cross-language test vector hash (Rust): ${EXPECTED_HASH_HEX}`);

    if (hexHash === EXPECTED_HASH_HEX) {
      console.log("✅ PASS: TypeScript hash matches Rust hash byte-for-byte");
      passed++;
    } else {
      console.log("❌ FAIL: TypeScript hash DOES NOT match Rust hash!");
      console.log("  This means the protocol is BROKEN — commitment hash verification will fail on-chain.");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: Cross-language test threw: ${e}`);
    failed++;
  }

  // ── Test 2: Determinism ─────────────────────────────────────────────
  try {
    const h1 = await computeCommitment(TEST_VECTOR);
    const h2 = await computeCommitment(TEST_VECTOR);
    const match = bytesToHex(h1) === bytesToHex(h2);
    if (match) {
      console.log("✅ PASS: Determinism — same inputs produce same hash");
      passed++;
    } else {
      console.log("❌ FAIL: Same inputs produced different hashes!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: Determinism test threw: ${e}`);
    failed++;
  }

  // ── Test 3: Different transfer_a amounts → different hashes ─────────
  try {
    const h1 = await computeCommitment(TEST_VECTOR);
    const h2 = await computeCommitment({
      ...TEST_VECTOR,
      transfer_a_lo: TEST_VECTOR.transfer_a_lo + 1,
    });
    if (bytesToHex(h1) !== bytesToHex(h2)) {
      console.log("✅ PASS: Different transfer_a amounts produce different hashes");
      passed++;
    } else {
      console.log("❌ FAIL: Different transfer_a amounts produced same hash!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: transfer_a amount test threw: ${e}`);
    failed++;
  }

  // ── Test 4: Different transfer_b amounts → different hashes ─────────
  try {
    const h1 = await computeCommitment(TEST_VECTOR);
    const h2 = await computeCommitment({
      ...TEST_VECTOR,
      transfer_b_lo: TEST_VECTOR.transfer_b_lo + 1,
    });
    if (bytesToHex(h1) !== bytesToHex(h2)) {
      console.log("✅ PASS: Different transfer_b amounts produce different hashes");
      passed++;
    } else {
      console.log("❌ FAIL: Different transfer_b amounts produced same hash!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: transfer_b amount test threw: ${e}`);
    failed++;
  }

  // ── Test 5: Different counterparty → different hashes ───────────────
  try {
    const h1 = await computeCommitment(TEST_VECTOR);
    const differentCP = new Uint8Array(32);
    differentCP[0] = 0xFF;
    const h2 = await computeCommitment({
      ...TEST_VECTOR,
      counterparty: differentCP,
    });
    if (bytesToHex(h1) !== bytesToHex(h2)) {
      console.log("✅ PASS: Different counterparty produces different hash");
      passed++;
    } else {
      console.log("❌ FAIL: Different counterparty produced same hash!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: Counterparty test threw: ${e}`);
    failed++;
  }

  // ── Test 6: verifyCommitment returns true for matching hash ─────────
  try {
    const hash = await computeCommitment(TEST_VECTOR);
    const valid = await verifyCommitment(hash, TEST_VECTOR);
    if (valid) {
      console.log("✅ PASS: verifyCommitment returns true for correct params");
      passed++;
    } else {
      console.log("❌ FAIL: verifyCommitment returned false for correct params!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: verifyCommitment test threw: ${e}`);
    failed++;
  }

  // ── Test 7: verifyCommitment returns false for wrong amount ─────────
  try {
    const hash = await computeCommitment(TEST_VECTOR);
    const valid = await verifyCommitment(hash, {
      ...TEST_VECTOR,
      transfer_a_lo: 888888,
    });
    if (!valid) {
      console.log("✅ PASS: verifyCommitment returns false for wrong amount");
      passed++;
    } else {
      console.log("❌ FAIL: verifyCommitment returned true for wrong amount!");
      failed++;
    }
  } catch (e) {
    console.log(`❌ FAIL: Wrong amount verify test threw: ${e}`);
    failed++;
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log("⚠️  CRITICAL: Some tests failed. Protocol integrity at risk.");
    process.exit(1);
  } else {
    console.log("✅ All tests passed. Cross-language consistency verified.");
  }
}

runTests();
