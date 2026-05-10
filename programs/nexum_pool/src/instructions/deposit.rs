use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::ProtocolConfig;
use crate::errors::NexumError;

/// Deposit SPL tokens into the shared Treasury Vault PDA.
/// The vault must already exist (call create_vault first).
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// User's source token account (wallet ATA).
    #[account(
        mut,
        constraint = user_token.owner == owner.key() @ NexumError::Unauthorized,
        constraint = user_token.mint == mint.key() @ NexumError::MintMismatch,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,

    /// Vault PDA token account — must already exist.
    #[account(
        mut,
        seeds = [b"nexum_vault", mint.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

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

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, NexumError::InvalidAmount);

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    msg!(
        "deposit: {} deposited {} of mint {} into vault",
        ctx.accounts.owner.key(),
        amount,
        ctx.accounts.mint.key(),
    );
    Ok(())
}
