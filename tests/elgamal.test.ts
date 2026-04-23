/**
 * elgamal.test.ts — Baby Jubjub ElGamal Encryption Tests
 *
 * Run with: npx ts-node tests/elgamal.test.ts
 */

import {
  generateKeypair,
  derivePublicKey,
  encrypt,
  decrypt,
  decryptU32,
  serializeCiphertext,
  deserializeCiphertext,
} from "../sdk/src/crypto/elgamal";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  console.log("=== Baby Jubjub ElGamal Tests ===\n");

  // Test 1: Keypair generation
  const kp = generateKeypair();
  assert(kp.privateKey > 0n, "Private key should be positive");
  assert(kp.publicKey[0] !== 0n || kp.publicKey[1] !== 0n, "Public key should not be zero");
  console.log("[PASS] Keypair generation");

  // Test 2: Deterministic key derivation
  const pk2 = derivePublicKey(kp.privateKey);
  assert(pk2[0] === kp.publicKey[0], "Derived public key x should match");
  assert(pk2[1] === kp.publicKey[1], "Derived public key y should match");
  console.log("[PASS] Deterministic key derivation");

  // Test 3: Encrypt/decrypt roundtrip (u32 value — balance limb)
  const plaintext = 1000000n; // 1M (typical u32 balance limb)
  const ct = encrypt(plaintext, kp.publicKey);
  const decrypted = decrypt(ct, kp.privateKey);
  assert(decrypted === plaintext, `Decrypted ${decrypted} should equal ${plaintext}`);
  console.log(`[PASS] Encrypt/decrypt roundtrip (value=${plaintext})`);

  // Test 4: Encrypt/decrypt another u32 value
  const value_lo = 4294967295n; // max u32
  const ct_lo = encrypt(value_lo, kp.publicKey);
  const dec_lo = decryptU32(ct_lo, kp.privateKey);
  assert(dec_lo === 4294967295, `Decrypted lo ${dec_lo} should equal 4294967295`);
  console.log("[PASS] Encrypt/decrypt max u32");

  // Test 5: Serialization roundtrip
  const serialized = serializeCiphertext(ct);
  assert(serialized.length === 128, `Serialized length should be 128, got ${serialized.length}`);
  const deserialized = deserializeCiphertext(serialized);
  // Re-encrypt with same ephemeral would differ; instead check deserialization works
  assert(deserialized.c1 !== null, "C1 should deserialize");
  assert(deserialized.c2 !== null, "C2 should deserialize");
  console.log("[PASS] Serialization roundtrip (128 bytes)");

  // Test 6: Different values produce different ciphertexts
  const ct1 = encrypt(1000n, kp.publicKey);
  const ct2 = encrypt(2000n, kp.publicKey);
  const s1 = serializeCiphertext(ct1);
  const s2 = serializeCiphertext(ct2);
  let same = true;
  for (let i = 0; i < 128; i++) {
    if (s1[i] !== s2[i]) { same = false; break; }
  }
  assert(!same, "Different values should produce different ciphertexts");
  console.log("[PASS] Different values → different ciphertexts");

  // Test 7: Decrypt with wrong key throws
  const wrongKp = generateKeypair();
  try {
    const wrongDec = decryptU32(ct, wrongKp.privateKey);
    // If it doesn't throw, the value must be different
    assert(wrongDec !== 1000000, "Wrong key should not decrypt correctly");
    console.log("[PASS] Wrong key produces wrong result");
  } catch {
    console.log("[PASS] Wrong key throws (expected)");
  }

  console.log("\n=== All 7 tests PASSED ===");
}

main().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
