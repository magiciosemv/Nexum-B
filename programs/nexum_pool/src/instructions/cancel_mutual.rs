use anchor_lang::prelude::*;
use crate::state::{UserLedger, LedgerStatus, CommitSlot, SlotStatus, ProtocolConfig};
use crate::errors::NexumError;

/// Cancel after both parties are locked but execute window has expired.
/// Either party can call this.
#[derive(Accounts)]
pub struct CancelMutual<'info> {
    /// Either Party A or Party B can call.
    pub caller: Signer<'info>,

    /// Party A's ledger — must be BothPending. Boxed to reduce BPF stack frame.
    #[account(
        mut,
        seeds = [
            b"ledger",
            commit_slot.initiator.as_ref(),
            commit_slot.asset_a_mint.as_ref(),
        ],
        bump = ledger_a.bump,
        constraint = ledger_a.status == LedgerStatus::BothPending
            @ NexumError::LedgerNotBothPending,
    )]
    pub ledger_a: Box<Account<'info, UserLedger>>,

    /// Party B's ledger — must be PendingCounterparty. Boxed to reduce BPF stack frame.
    #[account(
        mut,
        seeds = [
            b"ledger",
            commit_slot.counterparty.as_ref(),
            commit_slot.asset_b_mint.as_ref(),
        ],
        bump = ledger_b.bump,
        constraint = ledger_b.status == LedgerStatus::PendingCounterparty
            @ NexumError::LedgerNotPending,
    )]
    pub ledger_b: Box<Account<'info, UserLedger>>,

    /// CommitSlot — must be BothLocked. Boxed. Clock check moved to handler.
    #[account(
        mut,
        seeds = [b"cslot", ledger_a.key().as_ref(), &ledger_a.pending_nonce.to_le_bytes()],
        bump = commit_slot.bump,
        constraint = commit_slot.status == SlotStatus::BothLocked
            @ NexumError::SlotNotLocked,
        close = caller,
    )]
    pub commit_slot: Box<Account<'info, CommitSlot>>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,
}

pub fn handler(ctx: Context<CancelMutual>) -> Result<()> {
    // ── Execute window expiry check (moved from constraint to handler to save stack) ──
    let clock = Clock::get()?;
    let slot = &ctx.accounts.commit_slot;
    let config = &ctx.accounts.config;
    require!(
        clock.unix_timestamp > slot.execute_expiry + config.clock_tolerance,
        NexumError::ExecuteWindowActive,
    );

    // ── Unlock both parties ───────────────────────────────────────────
    let la = &mut ctx.accounts.ledger_a;
    la.status = LedgerStatus::Active;
    la.clear_pending();

    let lb = &mut ctx.accounts.ledger_b;
    lb.status = LedgerStatus::Active;
    lb.clear_pending();

    // commit_slot closed by Anchor's `close` attribute

    emit!(CancelMutualEvent {
        slot_id: ctx.accounts.commit_slot.key(),
        initiator: ctx.accounts.ledger_a.owner,
        counterparty: ctx.accounts.ledger_b.owner,
        ts: clock.unix_timestamp,
    });

    msg!(
        "cancel_mutual: {} and {} both unlocked",
        ctx.accounts.ledger_a.owner,
        ctx.accounts.ledger_b.owner
    );
    Ok(())
}

#[event]
pub struct CancelMutualEvent {
    pub slot_id: Pubkey,
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub ts: i64,
}
