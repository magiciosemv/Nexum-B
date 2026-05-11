use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::NexumError;

#[derive(Accounts)]
pub struct RegisterRegulator<'info> {
    #[account(
        mut,
        seeds = [b"nexum_config"],
        bump = config.bump,
        constraint = signer.key() == config.authority @ NexumError::UnauthorizedRegulator,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(mut)]
    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<RegisterRegulator>, regulator_pubkey: [u8; 64]) -> Result<()> {
    ctx.accounts.config.regulator_pubkey = regulator_pubkey;
    msg!("register_regulator: regulator public key set by {}", ctx.accounts.signer.key());
    Ok(())
}
