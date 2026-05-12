use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction as SolInstruction, program::invoke, pubkey::Pubkey};
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use solana_sha256_hasher::hash as sha256_hash;
use crate::state::{ProtocolConfig, UserLedger, LedgerStatus};
use crate::errors::NexumError;

/// zk_verifier program ID
const ZK_VERIFIER_ID: &str = "HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA";

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Vault PDA token account — program-controlled escrow.
    #[account(
        mut,
        seeds = [b"nexum_vault", mint.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// User's destination token account (wallet ATA).
    #[account(
        mut,
        constraint = user_token.owner == owner.key() @ NexumError::Unauthorized,
        constraint = user_token.mint == mint.key() @ NexumError::MintMismatch,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,

    /// The mint address for PDA derivation.
    pub mint: Account<'info, Mint>,

    /// User's encrypted-balance ledger. Required to ensure the withdrawer
    /// has an active ledger for this mint and is not locked in a settlement.
    #[account(
        seeds = [b"ledger", owner.key().as_ref(), mint.key().as_ref()],
        bump = ledger.bump,
        constraint = ledger.owner == owner.key() @ NexumError::Unauthorized,
        constraint = ledger.mint == mint.key() @ NexumError::MintMismatch,
        constraint = ledger.status == LedgerStatus::Active @ NexumError::LedgerNotActive,
    )]
    pub ledger: Box<Account<'info, UserLedger>>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
        constraint = !config.is_paused @ NexumError::ProtocolPaused,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    pub token_program: Program<'info, Token>,

    /// ZK verifier program.
    /// CHECK: Verified by program ID constraint.
    #[account(
        constraint = zk_verifier_program.key() == Pubkey::try_from(ZK_VERIFIER_ID).unwrap()
            @ NexumError::InvalidZkVerifierProgram,
    )]
    pub zk_verifier_program: AccountInfo<'info>,
}

pub fn handler(
    ctx: Context<Withdraw>,
    amount: u64,
    proof: [u8; 256],
    new_ct_lo: [u8; 128],
    new_ct_hi: [u8; 128],
    new_r_lo: [u8; 31],
    new_r_hi: [u8; 31],
) -> Result<()> {
    require!(amount > 0, NexumError::InvalidAmount);

    // Verify ZK proof of balance sufficiency
    // Public inputs: old_ct_lo_hash, old_ct_hi_hash (SHA-256 of old ciphertexts)
    // The circuit proves: old_balance = new_balance + amount (no underflow)
    let ledger = &ctx.accounts.ledger;

    // Compute hash of old ciphertexts for binding
    let old_ct_hash_lo = sha256_hash(&ledger.balance_ct_lo);
    let old_ct_hash_hi = sha256_hash(&ledger.balance_ct_hi);
    let hash_lo_128 = u128::from_be_bytes(old_ct_hash_lo.to_bytes()[0..16].try_into().unwrap());
    let hash_hi_128 = u128::from_be_bytes(old_ct_hash_hi.to_bytes()[0..16].try_into().unwrap());

    // Call zk_verifier to verify the proof
    invoke_verify_proof(
        &ctx.accounts.zk_verifier_program,
        proof,
        hash_lo_128,
        hash_hi_128,
    ).map_err(|_| NexumError::ProofVerificationFailed)?;

    let mint_key = ctx.accounts.mint.key();
    let (_, bump) = Pubkey::find_program_address(
        &[b"nexum_vault", mint_key.as_ref()],
        ctx.program_id,
    );
    let signer_seeds: &[&[&[u8]]] = &[&[b"nexum_vault", mint_key.as_ref(), &[bump]]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.user_token.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(cpi_ctx, amount)?;

    // Update encrypted balance with new ciphertexts and randomness
    let ledger_mut = &mut ctx.accounts.ledger;
    ledger_mut.balance_ct_lo = new_ct_lo;
    ledger_mut.balance_ct_hi = new_ct_hi;
    ledger_mut.encryption_r_lo = new_r_lo;
    ledger_mut.encryption_r_hi = new_r_hi;
    ledger_mut.version = ledger_mut.version.checked_add(1).unwrap();

    msg!(
        "withdraw: {} withdrew {} of mint {} from vault",
        ctx.accounts.owner.key(),
        amount,
        ctx.accounts.mint.key(),
    );
    Ok(())
}

/// Call zk_verifier::verify_proof via raw CPI (invoke).
/// Private circuit: 2 public inputs (hash_lo, hash_hi).
fn invoke_verify_proof<'info>(
    zk_verifier_program: &AccountInfo<'info>,
    proof: [u8; 256],
    hash_lo: u128,
    hash_hi: u128,
) -> Result<()> {
    // Anchor discriminator for verify_withdraw_proof: first 8 bytes of sha256("global:verify_withdraw_proof")
    let discriminator: [u8; 8] = [149, 237, 8, 22, 199, 149, 28, 70];

    // Serialize instruction data: discriminator + proof(256) + 2 × u128_le
    let mut ix_data = Vec::with_capacity(8 + 256 + 32);
    ix_data.extend_from_slice(&discriminator);
    ix_data.extend_from_slice(&proof);
    ix_data.extend_from_slice(&hash_lo.to_le_bytes());
    ix_data.extend_from_slice(&hash_hi.to_le_bytes());

    let ix = SolInstruction {
        program_id: *zk_verifier_program.key,
        accounts: vec![],
        data: ix_data,
    };

    invoke(&ix, &[zk_verifier_program.clone()])?;
    Ok(())
}
