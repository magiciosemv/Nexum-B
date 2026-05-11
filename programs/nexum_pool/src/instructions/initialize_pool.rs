use anchor_lang::prelude::*;
use crate::state::ProtocolConfig;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::LEN,
        seeds = [b"nexum_config"],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePool>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.is_paused = false;
    config.min_init_window = MIN_INIT_WINDOW;
    config.max_init_window = MAX_INIT_WINDOW;
    config.execute_window = EXECUTE_WINDOW;
    config.clock_tolerance = CLOCK_TOLERANCE;
    config.max_version_slots = MAX_VERSION_SLOTS;
    config.bump = ctx.bumps.config;
    config.regulator_authority = Pubkey::default();
    config.regulator_pubkey = [0u8; 64];

    msg!("Protocol initialized with default config");
    Ok(())
}
