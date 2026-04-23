use anchor_lang::prelude::*;
use crate::state::ProofData;

/// Lightweight params — only the nonce. Proof arrays initialized to zero.
///
/// Production flow: proofs are written by the zk_verifier via CPI after
/// Groth16 verification. For testing, zero-filled proof data is accepted
/// by execute_settle_b since ZK verification is not yet integrated.
///
/// The 1232-byte Solana instruction data limit prevents passing 2048 bytes
/// of proof+ciphertext data as instruction parameters.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateProofDataParams {
    pub nonce: u64,
}

#[derive(Accounts)]
#[instruction(params: CreateProofDataParams)]
pub struct CreateProofData<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProofData::LEN,
        seeds = [
            b"proofs".as_ref(),
            params.nonce.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateProofData>, params: CreateProofDataParams) -> Result<()> {
    let data = &mut ctx.accounts.proof_data;
    data.nonce = params.nonce;
    data.bump = ctx.bumps.proof_data;
    // Proof/ciphertext arrays default to zero.
    // In production, zk_verifier CPI writes actual proof data after verification.
    Ok(())
}
