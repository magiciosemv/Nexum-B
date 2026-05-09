/**
 * Scheme B v3.1 Commitment Hash — TypeScript Implementation
 *
 * MUST produce identical output to the Rust `compute_commitment_v3` function.
 * Input: 128 bytes → SHA-256 → 32 bytes
 *
 * Layout:
 *   nonce(8B LE) + transfer_a_lo(4B LE) + transfer_a_hi(4B LE)
 *   + transfer_b_lo(4B LE) + transfer_b_hi(4B LE)
 *   + asset_a_mint(32B) + asset_b_mint(32B) + counterparty(32B)
 *   + expiry_timestamp(8B LE)
 */

export interface CommitmentParams {
  nonce: bigint;               // u64
  transfer_a_lo: number;       // u32 — Party A → Party B amount low limb
  transfer_a_hi: number;       // u32 — Party A → Party B amount high limb
  transfer_b_lo: number;       // u32 — Party B → Party A amount low limb
  transfer_b_hi: number;       // u32 — Party B → Party A amount high limb
  asset_a_mint: Uint8Array;    // 32 bytes
  asset_b_mint: Uint8Array;    // 32 bytes
  counterparty: Uint8Array;    // 32 bytes
  expiry_timestamp: number;    // i64 (Unix seconds)
}

/**
 * Compute the Scheme B v3.1 commitment hash (two-way swap).
 * 128-byte input → SHA-256 → 32-byte output.
 *
 * Field order and byte widths MUST match the Rust implementation exactly.
 */
export async function computeCommitment(p: CommitmentParams): Promise<Uint8Array> {
  if (p.asset_a_mint.length !== 32) throw new Error("asset_a_mint must be 32 bytes");
  if (p.asset_b_mint.length !== 32) throw new Error("asset_b_mint must be 32 bytes");
  if (p.counterparty.length !== 32) throw new Error("counterparty must be 32 bytes");

  const buf = new Uint8Array(128);
  let off = 0;

  // nonce: u64 little-endian (8B)
  writeBigUInt64LE(buf, p.nonce, off);
  off += 8;

  // transfer_a_lo: u32 little-endian (4B)
  writeUInt32LE(buf, p.transfer_a_lo, off);
  off += 4;

  // transfer_a_hi: u32 little-endian (4B)
  writeUInt32LE(buf, p.transfer_a_hi, off);
  off += 4;

  // transfer_b_lo: u32 little-endian (4B)
  writeUInt32LE(buf, p.transfer_b_lo, off);
  off += 4;

  // transfer_b_hi: u32 little-endian (4B)
  writeUInt32LE(buf, p.transfer_b_hi, off);
  off += 4;

  // asset_a_mint (32B)
  buf.set(p.asset_a_mint, off);
  off += 32;

  // asset_b_mint (32B)
  buf.set(p.asset_b_mint, off);
  off += 32;

  // counterparty (32B)
  buf.set(p.counterparty, off);
  off += 32;

  // expiry_timestamp: i64 little-endian (8B, two's complement)
  writeBigInt64LE(buf, BigInt(p.expiry_timestamp), off);
  off += 8;

  if (off !== 128) throw new Error(`Buffer offset ${off}, expected 128`);

  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(hashBuf);
}

/**
 * Verify that a commitment hash matches locally computed hash.
 */
export async function verifyCommitment(
  onChainHash: Uint8Array,
  params: CommitmentParams
): Promise<boolean> {
  const localHash = await computeCommitment(params);
  if (localHash.length !== onChainHash.length) return false;
  for (let i = 0; i < localHash.length; i++) {
    if (localHash[i] !== onChainHash[i]) return false;
  }
  return true;
}

// ── Helper functions ──────────────────────────────────────────────────

function writeBigUInt64LE(buf: Uint8Array, n: bigint, off: number): void {
  if (n < 0n || n > 0xFFFFFFFFFFFFFFFFn) throw new Error(`u64 out of range: ${n}`);
  let v = n;
  for (let i = 0; i < 8; i++) {
    buf[off + i] = Number(v & 0xFFn);
    v >>= 8n;
  }
}

function writeUInt32LE(buf: Uint8Array, n: number, off: number): void {
  if (n < 0 || n > 0xFFFFFFFF) throw new Error(`u32 out of range: ${n}`);
  buf[off] = n & 0xFF;
  buf[off + 1] = (n >>> 8) & 0xFF;
  buf[off + 2] = (n >>> 16) & 0xFF;
  buf[off + 3] = (n >>> 24) & 0xFF;
}

function writeBigInt64LE(buf: Uint8Array, n: bigint, off: number): void {
  // i64: negative uses two's complement
  const unsigned = n < 0n ? n + (1n << 64n) : n;
  writeBigUInt64LE(buf, unsigned, off);
}
