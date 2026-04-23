use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

pub mod vk;
use vk::{VERIFYING_KEY, NR_PUBINPUTS};

declare_id!("AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi");

/// Verify a Groth16 ZK proof for the balance_transition circuit.
///
/// Circuit has 7 public signals (circom order: outputs first, then public inputs):
///   [0] pub_old_lo, [1] pub_old_hi, [2] pub_new_lo, [3] pub_new_hi,
///   [4] pub_transfer_lo, [5] transfer_lo, [6] transfer_hi
///
/// Proof format (256 bytes, big-endian from snarkjs):
///   pi_a (G1): 64 bytes, pi_b (G2): 128 bytes, pi_c (G1): 64 bytes
///
/// groth16-solana expects BE format for VK and public inputs.
/// proof_a must be negated per Groth16 verification convention.

#[program]
pub mod zk_verifier {
    use super::*;

    pub fn verify_proof(
        _ctx: Context<VerifyProof>,
        proof: [u8; 256],
        transfer_lo: u32,
        transfer_hi: u32,
        old_lo: u32,
        old_hi: u32,
        new_lo: u32,
        new_hi: u32,
    ) -> Result<()> {
        // ── Fast reject: trivial proof ──────────────────────────────────
        let non_trivial = proof.iter().any(|&b| b != 0);
        require!(non_trivial, ZkError::TrivialProof);

        // ── Build public inputs (7 x 32 bytes, big-endian) ─────────────
        // circom order: outputs first, then public inputs
        // [0] pub_old_lo, [1] pub_old_hi, [2] pub_new_lo, [3] pub_new_hi,
        // [4] pub_transfer_lo, [5] transfer_lo, [6] transfer_hi
        let public_inputs: [[u8; 32]; NR_PUBINPUTS] = [
            u32_to_be32(old_lo),       // [0] pub_old_lo
            u32_to_be32(old_hi),       // [1] pub_old_hi
            u32_to_be32(new_lo),       // [2] pub_new_lo
            u32_to_be32(new_hi),       // [3] pub_new_hi
            u32_to_be32(transfer_lo),  // [4] pub_transfer_lo
            u32_to_be32(transfer_lo),  // [5] transfer_lo (public input)
            u32_to_be32(transfer_hi),  // [6] transfer_hi (public input)
        ];

        // ── Negate proof_a ─────────────────────────────────────────────
        // Groth16 verification requires proof_a to be negated.
        // Negation on affine Weierstrass: (x, y) -> (x, p - y)
        // y is bytes 32..64 in big-endian.
        let mut proof_a = [0u8; 64];
        proof_a.copy_from_slice(&proof[0..64]);
        negate_g1_y_be(&mut proof_a);

        let proof_b: &[u8; 128] = (&proof[64..192]).try_into().unwrap();
        let proof_c: &[u8; 64] = (&proof[192..256]).try_into().unwrap();

        // ── Groth16 verification via BN254 pairing check ───────────────
        let mut verifier = Groth16Verifier::new(
            &proof_a,
            proof_b,
            proof_c,
            &public_inputs,
            &VERIFYING_KEY,
        )
        .map_err(|_| ZkError::ProofVerificationFailed)?;

        verifier
            .verify()
            .map_err(|_| ZkError::ProofVerificationFailed)?;

        msg!("verify_proof: Groth16 pairing check PASSED");
        Ok(())
    }
}

/// Convert u32 to 32-byte big-endian field element
fn u32_to_be32(val: u32) -> [u8; 32] {
    let mut buf = [0u8; 32];
    buf[28..32].copy_from_slice(&val.to_be_bytes());
    buf
}

/// Negate the y-coordinate of a G1 point in big-endian format.
/// (x, y) -> (x, p - y) where p is the BN254 base field modulus (Fp).
fn negate_g1_y_be(point: &mut [u8; 64]) {
    // BN254 base field modulus (Fp) in big-endian
    // p = 0x30644E72E131A029B85045B68181585D97816A916871CA8D3C208C16D87CFD47
    let p: [u8; 32] = [
        48, 100, 78, 114, 225, 49, 160, 41, 184, 80, 69, 182, 129, 129, 88, 93, 151, 129, 106,
        145, 104, 113, 202, 141, 60, 32, 140, 22, 216, 124, 253, 71,
    ];
    // Compute p - y (modular subtraction, big-endian)
    let mut borrow: u8 = 0;
    for i in (0..32).rev() {
        let (diff, b1) = p[i].overflowing_sub(point[32 + i]);
        let (diff, b2) = diff.overflowing_sub(borrow);
        point[32 + i] = diff;
        borrow = if b1 || b2 { 1 } else { 0 };
    }
}

#[derive(Accounts)]
pub struct VerifyProof {}

#[error_code]
pub enum ZkError {
    #[msg("Proof is all zeros (trivial/empty proof)")]
    TrivialProof,
    #[msg("Groth16 proof verification failed")]
    ProofVerificationFailed,
}
