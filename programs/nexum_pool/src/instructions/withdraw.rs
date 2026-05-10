use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::ProtocolConfig;
use crate::errors::NexumError;

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

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
        constraint = !config.is_paused @ NexumError::ProtocolPaused,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, NexumError::InvalidAmount);

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

    msg!(
        "withdraw: {} withdrew {} of mint {} from vault",
        ctx.accounts.owner.key(),
        amount,
        ctx.accounts.mint.key(),
    );
    Ok(())
}
