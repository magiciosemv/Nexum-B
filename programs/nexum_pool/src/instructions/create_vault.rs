use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Initialize a shared Treasury Vault for a given mint.
/// Global: one vault per mint, controlled by the program.
/// Seeds: ["nexum_vault", mint] — unique per mint.
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Shared Treasury Vault PDA token account — program-controlled escrow.
    /// All deposits for this mint go here. All withdrawals come from here.
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = vault,
        seeds = [b"nexum_vault", mint.key().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    /// The mint address for PDA derivation and token account init.
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    msg!(
        "initialize_vault: shared treasury vault created for mint={}",
        ctx.accounts.mint.key(),
    );
    Ok(())
}
