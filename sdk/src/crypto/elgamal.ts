/**
 * elgamal.ts — Baby Jubjub ElGamal Encryption for Nexum Protocol
 *
 * Provides:
 * - Key generation (private key → public key)
 * - Encryption (plaintext + public key → 128-byte ciphertext)
 * - Decryption (ciphertext + private key → plaintext)
 *
 * Ciphertext format: [C (64 bytes) + D (64 bytes)] = 128 bytes
 * Matches UserLedger.balance_ct_lo/hi and ProofData fields exactly.
 *
 * Uses Twisted ElGamal on Baby Jubjub (BN254 embedded curve).
 */

import {
  addPoint,
  mulPointEscalar,
  Base8,
  inCurve,
  packPoint,
  unpackPoint,
  Fr,
} from "@zk-kit/baby-jubjub";

// ── Types ─────────────────────────────────────────────────────────────

export interface ElGamalKeypair {
  privateKey: bigint;  // Field element (253 bits)
  publicKey: Point;    // Baby Jubjub point
}

export type Point = [bigint, bigint]; // [x, y] on Baby Jubjub

export interface ElGamalCiphertext {
  c1: Point;  // Ephemeral public key: r * G
  c2: Point;  // Encrypted message: r * P + encode(m)
}

// ── Key Generation ────────────────────────────────────────────────────

/**
 * Generate a new Baby Jubjub ElGamal keypair.
 * Private key is a random field element, public key = privateKey * Base8.
 */
export function generateKeypair(privateKey?: bigint): ElGamalKeypair {
  const sk = privateKey ?? randomFieldElement();
  const pk = mulPointEscalar(Base8, sk);
  return { privateKey: sk, publicKey: pk };
}

/**
 * Derive public key from private key.
 */
export function derivePublicKey(privateKey: bigint): Point {
  return mulPointEscalar(Base8, privateKey);
}

// ── Encryption ────────────────────────────────────────────────────────

/**
 * Encrypt a u64 value using Twisted ElGamal.
 *
 * The value is encoded as a Baby Jubjub point using a deterministic
 * encoding: value * Base8 (scalar multiplication of the generator).
 *
 * Ciphertext = (C1, C2) where:
 *   C1 = r * G       (ephemeral)
 *   C2 = r * P + m*G (encrypted message)
 *
 * @param value - The u64 value to encrypt
 * @param publicKey - Recipient's public key
 * @returns ElGamal ciphertext (2 points = 128 bytes serialized)
 */
export function encrypt(value: bigint, publicKey: Point): ElGamalCiphertext {
  // Random ephemeral key
  const r = randomFieldElement();

  // C1 = r * G
  const c1 = mulPointEscalar(Base8, r);

  // Encode message as point: m * G
  const messagePoint = mulPointEscalar(Base8, value);

  // r * P
  const sharedSecret = mulPointEscalar(publicKey, r);

  // C2 = r * P + m * G
  const c2 = addPoint(sharedSecret, messagePoint);

  return { c1, c2 };
}

// ── Decryption ────────────────────────────────────────────────────────

/**
 * Decrypt a Twisted ElGamal ciphertext for small values (u32 limbs).
 *
 * Recovery: compute C2 - sk * C1 = (r*P + m*G) - sk*(r*G) = m*G
 * Then search for m in [0, 2^32).
 *
 * Uses Baby-step Giant-step for faster discrete log on Baby Jubjub.
 *
 * @param ciphertext - The ElGamal ciphertext
 * @param privateKey - Recipient's private key
 * @returns The decrypted value
 */
export function decrypt(
  ciphertext: ElGamalCiphertext,
  privateKey: bigint,
  _maxValue?: bigint  // Ignored, always searches u32 range
): bigint {
  return BigInt(decryptU32(ciphertext, privateKey));
}

/**
 * Fast decryption for u32 values (lo/hi limbs) using Baby-step Giant-step.
 * Searches only 0 to 2^32 - 1. O(sqrt(n)) time instead of O(n).
 *
 * Optimized: baby steps use incremental addPoint instead of mulPointEscalar,
 * and the table is cached across calls (computed once, reused forever).
 */
export function decryptU32(ciphertext: ElGamalCiphertext, privateKey: bigint): number {
  // Recover message point: C2 - sk*C1 = m*G
  const sharedSecret = mulPointEscalar(ciphertext.c1, privateKey);
  const negSecret: Point = [Fr.neg(sharedSecret[0]), sharedSecret[1]];
  const messagePoint = addPoint(ciphertext.c2, negSecret);

  const step = 65536n;
  const babySteps = getBabyStepsTable();

  // Giant step: check messagePoint - i * step * G
  const stepPoint = mulPointEscalar(Base8, step);
  let accumulator: Point = [messagePoint[0], messagePoint[1]];

  for (let i = 0n; i < 65536n; i++) {
    const key = `${accumulator[0]},${accumulator[1]}`;
    const j = babySteps.get(key);
    if (j !== undefined) {
      const m = i * step + j;
      if (m < 0x100000000n) {
        return Number(m);
      }
    }
    // accumulator = accumulator - stepPoint
    const negStep: Point = [Fr.neg(stepPoint[0]), stepPoint[1]];
    accumulator = addPoint(accumulator, negStep);
  }

  throw new Error("Decryption failed: u32 value not found");
}

// ── Cached BSGS baby steps table ──────────────────────────────────────
// Computed once on first decryptU32 call, then reused for all subsequent calls.
// Uses incremental addPoint instead of mulPointEscalar for each entry.

let _babyStepsCache: Map<string, bigint> | null = null;

function getBabyStepsTable(): Map<string, bigint> {
  if (_babyStepsCache) return _babyStepsCache;

  const step = 65536n;
  const table = new Map<string, bigint>();

  // j=0: identity point [0, 1]
  table.set(`0,1`, 0n);

  // j=1 to step-1: incremental addition — (j+1)*G = j*G + G
  let current: Point = mulPointEscalar(Base8, 1n); // 1*G
  for (let j = 1n; j < step; j++) {
    const key = `${current[0]},${current[1]}`;
    if (!table.has(key)) {
      table.set(key, j);
    }
    current = addPoint(current, Base8);
  }

  _babyStepsCache = table;
  return table;
}

/**
 * Clear the cached baby steps table (for testing or memory cleanup).
 */
export function clearBabyStepsCache(): void {
  _babyStepsCache = null;
}

// ── Serialization ─────────────────────────────────────────────────────

/**
 * Serialize ElGamal ciphertext to 128 bytes.
 * Format: [packPoint(C1) (64 bytes)] + [packPoint(C2) (64 bytes)]
 * Each point is packed as: y(32 BE) with x-sign bit in y's last byte.
 */
export function serializeCiphertext(ct: ElGamalCiphertext): Uint8Array {
  const buf = new Uint8Array(128);

  // Pack C1
  const c1Packed = packPoint(ct.c1);
  const c1Bytes = bigintToBeBytes(c1Packed, 64);
  buf.set(c1Bytes, 0);

  // Pack C2
  const c2Packed = packPoint(ct.c2);
  const c2Bytes = bigintToBeBytes(c2Packed, 64);
  buf.set(c2Bytes, 64);

  return buf;
}

/**
 * Deserialize 128 bytes to ElGamal ciphertext.
 */
export function deserializeCiphertext(bytes: Uint8Array): ElGamalCiphertext {
  if (bytes.length !== 128) {
    throw new Error(`Expected 128 bytes, got ${bytes.length}`);
  }

  const c1Packed = beBytesToBigint(bytes.slice(0, 64));
  const c1 = unpackPoint(c1Packed);
  if (c1 === null) throw new Error("Failed to unpack C1");

  const c2Packed = beBytesToBigint(bytes.slice(64, 128));
  const c2 = unpackPoint(c2Packed);
  if (c2 === null) throw new Error("Failed to unpack C2");

  return { c1, c2 };
}

// ── Helpers ───────────────────────────────────────────────────────────

function randomFieldElement(): bigint {
  // Generate a random field element < subOrder
  // In production, use crypto.getRandomValues
  const buf = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // Fallback for Node.js
    require("crypto").randomFillSync(buf);
  }
  let val = 0n;
  for (let i = 0; i < 32; i++) {
    val = (val << 8n) | BigInt(buf[i]);
  }
  // Reduce modulo subOrder (Baby Jubjub order / 8 for cofactor)
  // For simplicity, just mask to 253 bits
  return val & ((1n << 253n) - 1n);
}

function bigintToBeBytes(val: bigint, len: number): Uint8Array {
  const buf = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    buf[i] = Number(val & 0xFFn);
    val >>= 8n;
  }
  return buf;
}

function beBytesToBigint(buf: Uint8Array): bigint {
  let val = 0n;
  for (let i = 0; i < buf.length; i++) {
    val = (val << 8n) | BigInt(buf[i]);
  }
  return val;
}
