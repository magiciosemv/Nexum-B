use anchor_lang::prelude::*;
use crate::state::{UserLedger, LedgerStatus, ProtocolConfig};
use crate::errors::NexumError;

#[derive(Accounts)]
pub struct CreateUserLedger<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + UserLedger::LEN,
        seeds = [b"ledger", owner.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub ledger: Account<'info, UserLedger>,

    /// CHECK: The mint address, stored for PDA derivation
    pub mint: AccountInfo<'info>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
        constraint = !config.is_paused @ NexumError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateUserLedger>) -> Result<()> {
    let ledger = &mut ctx.accounts.ledger;
    ledger.owner = ctx.accounts.owner.key();
    ledger.mint = ctx.accounts.mint.key();
    ledger.balance_ct_lo = [0u8; 128];
    ledger.balance_ct_hi = [0u8; 128];
    ledger.audit_ct_lo = [0u8; 128];
    ledger.audit_ct_hi = [0u8; 128];
    ledger.version = 0;
    ledger.status = LedgerStatus::Active;
    ledger.last_settlement_id = [0u8; 32];
    ledger.bump = ctx.bumps.ledger;
    ledger.clear_pending();

    msg!(
        "UserLedger created: owner={}, mint={}, bump={}",
        ledger.owner,
        ledger.mint,
        ledger.bump
    );
    Ok(())
}
