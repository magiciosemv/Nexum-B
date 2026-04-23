use anchor_lang::prelude::*;
use crate::state::{UserLedger, LedgerStatus, CommitSlot, ProtocolConfig};
use crate::errors::NexumError;

/// Cancel an expired initiate — only Party A can call, only after the window has expired.
#[derive(Accounts)]
pub struct CancelInitiate<'info> {
    /// Only the initiator can cancel (and only after expiry). Must be mut for rent refund.
    #[account(
        mut,
        signer,
        constraint = s.key() == ledger_a.owner @ NexumError::Unauthorized,
    )]
    pub s: Signer<'info>,

    /// Party A's ledger — must be PendingInitiator.
    #[account(
        mut,
        seeds = [b"ledger", ledger_a.owner.as_ref(), ledger_a.mint.as_ref()],
        bump = ledger_a.bump,
        constraint = ledger_a.status == LedgerStatus::PendingInitiator
            @ NexumError::LedgerNotPending,
        // Window MUST have expired (with tolerance)
        constraint = Clock::get()?.unix_timestamp
            > ledger_a.pending_expiry + config.clock_tolerance
            @ NexumError::WindowNotExpired,
    )]
    pub ledger_a: Account<'info, UserLedger>,

    /// CommitSlot to close — rent returned to Party A.
    #[account(
        mut,
        seeds = [b"cslot", ledger_a.key().as_ref(), &ledger_a.pending_nonce.to_le_bytes()],
        bump = commit_slot.bump,
        close = s,  // Rent returned to initiator
    )]
    pub commit_slot: Account<'info, CommitSlot>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,
}

pub fn handler(ctx: Context<CancelInitiate>) -> Result<()> {
    let la = &mut ctx.accounts.ledger_a;
    la.status = LedgerStatus::Active;
    la.clear_pending();

    // commit_slot is closed by Anchor's `close` attribute — rent goes to `s`

    emit!(CancelInitiateEvent {
        slot_id: ctx.accounts.commit_slot.key(),
        initiator: ctx.accounts.ledger_a.owner,
        counterparty: ctx.accounts.commit_slot.counterparty,
        ts: Clock::get()?.unix_timestamp,
    });

    msg!(
        "cancel_initiate: initiator {} unlocked",
        ctx.accounts.ledger_a.owner
    );
    Ok(())
}

#[event]
pub struct CancelInitiateEvent {
    pub slot_id: Pubkey,
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub ts: i64,
}
