/**
 * regulator_key.ts — Deterministic ElGamal Key Derivation for Regulators
 *
 * Derives a Baby Jubjub ElGamal keypair from a wallet signature.
 * The same wallet always produces the same keypair (deterministic).
 *
 * Public key format: [x (32 bytes LE) | y (32 bytes LE)] = 64 bytes
 * Matches ProtocolConfig.regulator_pubkey: [u8; 64] on-chain.
 */

import { sha256 } from "@noble/hashes/sha256";
import { mulPointEscalar, Base8, subOrder } from "@zk-kit/baby-jubjub";

/**
 * Derive an ElGamal keypair deterministically from a wallet signature.
 *
 * Flow:
 * 1. Ask wallet to sign a fixed message: "Nexum Regulator Key Derivation"
 * 2. SHA-256 hash the signature bytes -> 32 bytes
 * 3. Reduce mod subOrder -> private key scalar (bigint)
 * 4. Compute public key = privateKey * Base8 (point on Baby Jubjub)
 * 5. Pack public key to 64 bytes (32 bytes x-coord LE, 32 bytes y-coord LE)
 *
 * @param signMessage - Wallet's signMessage function (from useWallet or similar)
 * @returns { privateKey: bigint, publicKey: Uint8Array(64) }
 */
export async function deriveRegulatorKey(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<{ privateKey: bigint; publicKey: Uint8Array }> {
  const message = new TextEncoder().encode("Nexum Regulator Key Derivation");
  const signature = await signMessage(message);

  // SHA-256 hash the signature -> 32 bytes
  const hash = sha256(signature);

  // Reduce mod subOrder to get a valid scalar
  const hashHex = Buffer.from(hash).toString("hex");
  const privateKey = BigInt("0x" + hashHex) % subOrder;

  // Public key = privateKey * Base8
  const publicKeyPoint = mulPointEscalar(Base8, privateKey);

  // Pack as [x (32 bytes LE) | y (32 bytes LE)] = 64 bytes
  const publicKey = new Uint8Array(64);
  bigintToLeBytes(publicKeyPoint[0], publicKey, 0);
  bigintToLeBytes(publicKeyPoint[1], publicKey, 32);

  return { privateKey, publicKey };
}

/**
 * Pack a public key (64 bytes) into a Baby Jubjub Point for encryption.
 * Inverse of the packing in deriveRegulatorKey.
 *
 * @param pubkey - 64-byte Uint8Array [x (32 LE) | y (32 LE)]
 * @returns [x: bigint, y: bigint] Baby Jubjub point
 */
export function unpackRegulatorPubkey(pubkey: Uint8Array): [bigint, bigint] {
  if (pubkey.length !== 64) {
    throw new Error(`Expected 64 bytes, got ${pubkey.length}`);
  }
  const x = leBytesToBigint(pubkey, 0);
  const y = leBytesToBigint(pubkey, 32);
  return [x, y];
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Write a bigint as 32-byte little-endian into a Uint8Array at offset. */
function bigintToLeBytes(val: bigint, buf: Uint8Array, offset: number): void {
  for (let i = 0; i < 32; i++) {
    buf[offset + i] = Number((val >> BigInt(i * 8)) & BigInt(0xff));
  }
}

/** Read 32 bytes little-endian from a Uint8Array at offset as a bigint. */
function leBytesToBigint(buf: Uint8Array, offset: number): bigint {
  let val = 0n;
  for (let i = 0; i < 32; i++) {
    val |= BigInt(buf[offset + i]) << BigInt(i * 8);
  }
  return val;
}
