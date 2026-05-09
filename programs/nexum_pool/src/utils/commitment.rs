use anchor_lang::prelude::Pubkey;
use solana_sha256_hasher::hash as sha256_hash;

/// Compute the Scheme B v3.1 commitment hash (two-way swap).
///
/// Input: exactly 128 bytes with this layout:
///   nonce(8B LE) + transfer_a_lo(4B LE) + transfer_a_hi(4B LE)
///   + transfer_b_lo(4B LE) + transfer_b_hi(4B LE)
///   + asset_a_mint(32B) + asset_b_mint(32B) + counterparty(32B)
///   + expiry_timestamp(8B LE, two's complement)
///
/// Output: 32-byte SHA-256 hash
///
/// **CRITICAL**: Field order and byte widths MUST match the TypeScript SDK
/// `computeCommitment()` exactly. Any divergence = `CommitmentMismatch` on-chain.
pub fn compute_commitment_v3(
    nonce: u64,
    transfer_a_lo: u32,
    transfer_a_hi: u32,
    transfer_b_lo: u32,
    transfer_b_hi: u32,
    asset_a_mint: &Pubkey,
    asset_b_mint: &Pubkey,
    counterparty: &Pubkey,
    expiry: i64,
) -> [u8; 32] {
    // Build the exact 128-byte buffer matching the TypeScript layout.
    let mut buf = [0u8; 128];
    let mut off: usize = 0;

    buf[off..off + 8].copy_from_slice(&nonce.to_le_bytes());
    off += 8;
    buf[off..off + 4].copy_from_slice(&transfer_a_lo.to_le_bytes());
    off += 4;
    buf[off..off + 4].copy_from_slice(&transfer_a_hi.to_le_bytes());
    off += 4;
    buf[off..off + 4].copy_from_slice(&transfer_b_lo.to_le_bytes());
    off += 4;
    buf[off..off + 4].copy_from_slice(&transfer_b_hi.to_le_bytes());
    off += 4;
    buf[off..off + 32].copy_from_slice(asset_a_mint.as_ref());
    off += 32;
    buf[off..off + 32].copy_from_slice(asset_b_mint.as_ref());
    off += 32;
    buf[off..off + 32].copy_from_slice(counterparty.as_ref());
    off += 32;
    buf[off..off + 8].copy_from_slice(&expiry.to_le_bytes());
    off += 8;

    debug_assert_eq!(off, 128, "commitment buffer must be exactly 128 bytes");

    sha256_hash(&buf).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    // ── Test 1: Determinism ───────────────────────────────────────────
    #[test]
    fn test_commitment_deterministic() {
        let nonce = 12345678901234u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let counterparty = Pubkey::new_unique();
        let expiry = 1714000000i64;

        let h1 = compute_commitment_v3(
            nonce, 999999, 0, 500000, 0,
            &asset_a, &asset_b, &counterparty, expiry,
        );
        let h2 = compute_commitment_v3(
            nonce, 999999, 0, 500000, 0,
            &asset_a, &asset_b, &counterparty, expiry,
        );
        assert_eq!(h1, h2, "Same inputs must produce identical hashes");
    }

    // ── Test 2: Different amounts → different hashes ──────────────────
    #[test]
    fn test_commitment_different_amounts() {
        let nonce = 1u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let counterparty = Pubkey::new_unique();
        let expiry = 1714000000i64;

        let h1 = compute_commitment_v3(
            nonce, 999, 0, 0, 0, &asset_a, &asset_b, &counterparty, expiry,
        );
        let h2 = compute_commitment_v3(
            nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &counterparty, expiry,
        );
        assert_ne!(h1, h2, "Different amounts must produce different hashes");
    }

    // ── Test 3: Different counterparty → different hashes ─────────────
    #[test]
    fn test_commitment_different_counterparties() {
        let nonce = 42u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let cp1 = Pubkey::new_unique();
        let cp2 = Pubkey::new_unique();
        let expiry = 1714000000i64;

        let h1 = compute_commitment_v3(nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &cp1, expiry);
        let h2 = compute_commitment_v3(nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &cp2, expiry);
        assert_ne!(h1, h2, "Different counterparties must produce different hashes");
    }

    // ── Test 4: Different nonce → different hashes ────────────────────
    #[test]
    fn test_commitment_different_nonce() {
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let cp = Pubkey::new_unique();
        let expiry = 1714000000i64;

        let h1 = compute_commitment_v3(1, 1000, 0, 0, 0, &asset_a, &asset_b, &cp, expiry);
        let h2 = compute_commitment_v3(2, 1000, 0, 0, 0, &asset_a, &asset_b, &cp, expiry);
        assert_ne!(h1, h2, "Different nonces must produce different hashes");
    }

    // ── Test 5: Different expiry → different hashes ───────────────────
    #[test]
    fn test_commitment_different_expiry() {
        let nonce = 1u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let cp = Pubkey::new_unique();

        let h1 = compute_commitment_v3(nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &cp, 1714000000i64);
        let h2 = compute_commitment_v3(nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &cp, 1714000001i64);
        assert_ne!(h1, h2, "Different expiry must produce different hashes");
    }

    // ── Test 6: Cross-language test vector (fixed pubkeys) ────────────
    // This is THE critical test for Rust ↔ TypeScript consistency.
    // Both sides must produce the exact same 32-byte hash for identical inputs.
    // v3.1 layout: 128 bytes with transfer_a + transfer_b (two-way swap).
    #[test]
    fn test_cross_language_vector() {
        let nonce = 12345678901234u64;
        let transfer_a_lo = 999999u32;
        let transfer_a_hi = 0u32;
        let transfer_b_lo = 500000u32;
        let transfer_b_hi = 0u32;
        let asset_a = Pubkey::from_str("So11111111111111111111111111111111111111112").unwrap();
        let asset_b =
            Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap();
        let counterparty =
            Pubkey::from_str("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM").unwrap();
        let expiry = 1714000000i64;

        let hash = compute_commitment_v3(
            nonce, transfer_a_lo, transfer_a_hi, transfer_b_lo, transfer_b_hi,
            &asset_a, &asset_b, &counterparty, expiry,
        );

        let hex_hash: String = hash.iter().map(|b| format!("{:02x}", b)).collect();
        println!("Cross-language test vector hash (Rust v3.1): {}", hex_hash);

        assert_eq!(hash.len(), 32);
        assert_ne!(hash, [0u8; 32], "Hash should not be all zeros");

        // Verified against TypeScript computeCommitment() — both produce identical output.
        assert_eq!(
            hex_hash,
            "1c25fac0dfbd7ef191efed9c32f4671eedff5f2e710757fb56c9b79ad2dbaa2f",
            "Cross-language hash mismatch! Rust and TypeScript must produce identical hashes."
        );
    }

    // ── Test 7: Negative expiry (two's complement) ────────────────────
    #[test]
    fn test_commitment_negative_expiry() {
        let nonce = 1u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let cp = Pubkey::new_unique();

        let h_pos = compute_commitment_v3(nonce, 100, 0, 0, 0, &asset_a, &asset_b, &cp, 1000i64);
        let h_neg = compute_commitment_v3(nonce, 100, 0, 0, 0, &asset_a, &asset_b, &cp, -1000i64);
        assert_ne!(h_pos, h_neg, "Positive and negative expiry must differ");
    }

    // ── Test 8: transfer_b affects hash (two-way swap) ────────────────
    #[test]
    fn test_commitment_transfer_b_affects_hash() {
        let nonce = 1u64;
        let asset_a = Pubkey::new_unique();
        let asset_b = Pubkey::new_unique();
        let cp = Pubkey::new_unique();
        let expiry = 1714000000i64;

        let h_no_b = compute_commitment_v3(nonce, 1000, 0, 0, 0, &asset_a, &asset_b, &cp, expiry);
        let h_with_b = compute_commitment_v3(nonce, 1000, 0, 500, 0, &asset_a, &asset_b, &cp, expiry);
        assert_ne!(h_no_b, h_with_b, "transfer_b must affect hash");

        let h_b_lo = compute_commitment_v3(nonce, 1000, 0, 500, 0, &asset_a, &asset_b, &cp, expiry);
        let h_b_hi = compute_commitment_v3(nonce, 1000, 0, 500, 1, &asset_a, &asset_b, &cp, expiry);
        assert_ne!(h_b_lo, h_b_hi, "transfer_b_hi must affect hash");
    }
}
