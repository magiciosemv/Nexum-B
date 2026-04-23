use anchor_lang::prelude::*;

/// Holds ZK proof and ciphertext data for execute_settle_b.
/// Created off-chain and passed as an account to avoid BPF stack overflow
/// from deserializing large arrays as instruction parameters.
///
/// PDA seeds: ["proofs", commit_slot_key, nonce_le8]
#[account]
pub struct ProofData {
    // ── Party A proof ───────────────────────────────────────────────────
    pub proof_a: [u8; 256],        // 256  ZK proof for party A
    pub new_ct_a_lo: [u8; 128],   // 128  New ElGamal ciphertext lo
    pub new_ct_a_hi: [u8; 128],   // 128  New ElGamal ciphertext hi
    pub audit_ct_a_lo: [u8; 128], // 128  Audit ciphertext lo
    pub audit_ct_a_hi: [u8; 128], // 128  Audit ciphertext hi

    // ── Party B proof ───────────────────────────────────────────────────
    pub proof_b: [u8; 256],        // 256  ZK proof for party B
    pub new_ct_b_lo: [u8; 128],   // 128  New ElGamal ciphertext lo
    pub new_ct_b_hi: [u8; 128],   // 128  New ElGamal ciphertext hi
    pub audit_ct_b_lo: [u8; 128], // 128  Audit ciphertext lo
    pub audit_ct_b_hi: [u8; 128], // 128  Audit ciphertext hi

    // ── Metadata ────────────────────────────────────────────────────────
    pub nonce: u64,                // 8    Matches CommitSlot nonce
    pub bump: u8,                  // 1
}

impl ProofData {
    /// Discriminator (8) + proof_a(256) + ct_a(4x128) + proof_b(256) + ct_b(4x128) + nonce(8) + bump(1)
    pub const LEN: usize = 8
        + 256               // proof_a
        + 128 + 128 + 128 + 128  // new_ct_a_lo, new_ct_a_hi, audit_ct_a_lo, audit_ct_a_hi
        + 256               // proof_b
        + 128 + 128 + 128 + 128  // new_ct_b_lo, new_ct_b_hi, audit_ct_b_lo, audit_ct_b_hi
        + 8                 // nonce
        + 1;                // bump
        // Total: 1537 bytes
}
