use anchor_lang::prelude::*;
use crate::state::ProofData;
use crate::errors::NexumError;

/// Write a chunk of proof/ciphertext data to a ProofData account.
///
/// ProofData has 2048 bytes of data arrays, split into 6 chunks:
///   Chunk 0: proof_a (256 bytes)
///   Chunk 1: new_ct_a_lo(128) + new_ct_a_hi(128) + audit_ct_a_lo(128) + audit_ct_a_hi(128) = 512 bytes
///   Chunk 2: proof_b (256 bytes)
///   Chunk 3: new_ct_b_lo(128) + new_ct_b_hi(128) + audit_ct_b_lo(128) + audit_ct_b_hi(128) = 512 bytes
///   Chunk 4: regulator_ct_a_lo(128) + regulator_ct_a_hi(128) = 256 bytes
///   Chunk 5: regulator_ct_b_lo(128) + regulator_ct_b_hi(128) = 256 bytes
///
/// This instruction is called after create_proof_data to populate the account
/// with real ZK proof + ciphertext data. The account must already exist.
///
/// Instruction data size (worst case, chunk 1 or 3):
///   8 (discriminator) + 8 (nonce) + 1 (chunk_index) + 4 (vec length) + 512 (data) = 533 bytes
/// Well within Solana's 1232-byte instruction data limit.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WriteProofDataParams {
    pub nonce: u64,
    pub chunk_index: u8,
    pub data: Vec<u8>,
}

#[derive(Accounts)]
#[instruction(params: WriteProofDataParams)]
pub struct WriteProofData<'info> {
    #[account(
        mut,
        seeds = [
            b"proofs",
            params.nonce.to_le_bytes().as_ref(),
        ],
        bump = proof_data.bump,
        constraint = proof_data.nonce == params.nonce
            @ NexumError::InvalidNonce,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,

    /// Only the authority who created the ProofData can write to it.
    #[account(
        signer,
        constraint = proof_data.nonce == params.nonce
            @ NexumError::InvalidNonce,
    )]
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<WriteProofData>, params: WriteProofDataParams) -> Result<()> {
    let data = &mut ctx.accounts.proof_data;
    let chunk = params.chunk_index;
    let payload = &params.data;

    match chunk {
        0 => {
            require!(payload.len() == 256, NexumError::InvalidChunkSize);
            data.proof_a.copy_from_slice(payload);
        }
        1 => {
            require!(payload.len() == 512, NexumError::InvalidChunkSize);
            data.new_ct_a_lo.copy_from_slice(&payload[0..128]);
            data.new_ct_a_hi.copy_from_slice(&payload[128..256]);
            data.audit_ct_a_lo.copy_from_slice(&payload[256..384]);
            data.audit_ct_a_hi.copy_from_slice(&payload[384..512]);
        }
        2 => {
            require!(payload.len() == 256, NexumError::InvalidChunkSize);
            data.proof_b.copy_from_slice(payload);
        }
        3 => {
            require!(payload.len() == 512, NexumError::InvalidChunkSize);
            data.new_ct_b_lo.copy_from_slice(&payload[0..128]);
            data.new_ct_b_hi.copy_from_slice(&payload[128..256]);
            data.audit_ct_b_lo.copy_from_slice(&payload[256..384]);
            data.audit_ct_b_hi.copy_from_slice(&payload[384..512]);
        }
        4 => {
            require!(payload.len() == 256, NexumError::InvalidChunkSize);
            data.regulator_ct_a_lo.copy_from_slice(&payload[0..128]);
            data.regulator_ct_a_hi.copy_from_slice(&payload[128..256]);
        }
        5 => {
            require!(payload.len() == 256, NexumError::InvalidChunkSize);
            data.regulator_ct_b_lo.copy_from_slice(&payload[0..128]);
            data.regulator_ct_b_hi.copy_from_slice(&payload[128..256]);
        }
        _ => {
            return Err(NexumError::InvalidChunkIndex.into());
        }
    }

    msg!("write_proof_data: chunk {} written ({} bytes)", chunk, payload.len());
    Ok(())
}
