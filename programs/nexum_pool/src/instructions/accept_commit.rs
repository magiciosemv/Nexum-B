use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Approve};
use crate::state::{UserLedger, LedgerStatus, CommitSlot, SlotStatus, ProtocolConfig};
use crate::errors::NexumError;

#[derive(Accounts)]
pub struct AcceptCommit<'info> {
    /// Party B (counterparty) must sign and own ledger_b.
    #[account(
        signer,
        constraint = s.key() == ledger_b.owner @ NexumError::Unauthorized,
    )]
    pub s: Signer<'info>,

    /// Party A's ledger — must be PendingInitiator, transitions to BothPending. Boxed.
    #[account(
        mut,
        seeds = [
            b"ledger",
            commit_slot.initiator.as_ref(),
            commit_slot.asset_a_mint.as_ref(),
        ],
        bump = ledger_a.bump,
        constraint = ledger_a.status == LedgerStatus::PendingInitiator
            @ NexumError::LedgerNotPending,
        constraint = ledger_a.pending_counterparty == s.key()
            @ NexumError::WrongCounterparty,
    )]
    pub ledger_a: Box<Account<'info, UserLedger>>,

    /// Party B's ledger — must be Active, will transition to PendingCounterparty. Boxed.
    #[account(
        mut,
        seeds = [
            b"ledger",
            ledger_b.owner.as_ref(),
            commit_slot.asset_b_mint.as_ref(),
        ],
        bump = ledger_b.bump,
        constraint = ledger_b.status == LedgerStatus::Active
            @ NexumError::LedgerNotActive,
        constraint = ledger_b.mint == commit_slot.asset_b_mint
            @ NexumError::MintMismatch,
    )]
    pub ledger_b: Box<Account<'info, UserLedger>>,

    /// The CommitSlot — must be WaitingAccept. Boxed.
    #[account(
        mut,
        seeds = [
            b"cslot",
            ledger_a.key().as_ref(),
            &ledger_a.pending_nonce.to_le_bytes(),
        ],
        bump = commit_slot.bump,
        constraint = commit_slot.status == SlotStatus::WaitingAccept
            @ NexumError::SlotNotWaiting,
        constraint = commit_slot.counterparty == s.key()
            @ NexumError::WrongCounterparty,
    )]
    pub commit_slot: Box<Account<'info, CommitSlot>>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    /// Party B's token account for asset_b — source of B→A transfer.
    /// Must be owned by Party B and match the CommitSlot's asset_b_mint.
    #[account(
        mut,
        constraint = party_b_token.owner == s.key() @ NexumError::Unauthorized,
        constraint = party_b_token.mint == commit_slot.asset_b_mint @ NexumError::MintMismatch,
    )]
    pub party_b_token: Box<Account<'info, TokenAccount>>,

    /// Delegate PDA — will be authorized to transfer from Party B's token account.
    /// Derived from commit_slot key so it's unique per swap.
    /// CHECK: PDA used as delegate authority, no data stored.
    #[account(
        seeds = [b"delegate", commit_slot.key().as_ref()],
        bump,
    )]
    /// CHECK: PDA used as signing authority
    pub delegate: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<AcceptCommit>) -> Result<()> {
    let clock = Clock::get()?;
    let cfg = &ctx.accounts.config;

    // ── Expiry check (in handler to reduce stack) ──────────────────────
    require!(
        clock.unix_timestamp <= ctx.accounts.ledger_a.pending_expiry + cfg.clock_tolerance,
        NexumError::InitiateExpired,
    );

    // ── Approve delegate PDA on Party B's token account ────────────────
    // Party B authorizes the delegate PDA to transfer asset_b tokens on their behalf.
    // Amount: u64::MAX (unlimited). The real transfer amount is verified against
    // the commitment hash at execute time — only the committed amount will be transferred.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Approve {
            to: ctx.accounts.party_b_token.to_account_info(),
            delegate: ctx.accounts.delegate.to_account_info(),
            authority: ctx.accounts.s.to_account_info(),
        },
    );
    token::approve(cpi_ctx, u64::MAX)?;

    // ── CRITICAL: Symmetric dual-lock ─────────────────────────────────
    // Party A: PendingInitiator → BothPending
    // Party B: Active → PendingCounterparty
    // Both balances locked simultaneously — no unilateral walk-away.
    ctx.accounts.ledger_a.status = LedgerStatus::BothPending;

    let lb = &mut ctx.accounts.ledger_b;
    lb.status = LedgerStatus::PendingCounterparty;
    lb.pending_counterparty = ctx.accounts.ledger_a.owner;
    lb.pending_nonce = ctx.accounts.ledger_a.pending_nonce;

    // ── Update CommitSlot with execution window ───────────────────────
    let slot = &mut ctx.accounts.commit_slot;
    slot.status = SlotStatus::BothLocked;
    slot.both_locked_at = clock.unix_timestamp;
    slot.execute_expiry = clock.unix_timestamp + cfg.execute_window;

    emit!(AcceptCommitEvent {
        slot_id: slot.key(),
        initiator: slot.initiator,
        counterparty: slot.counterparty,
        locked_at: slot.both_locked_at,
        execute_expiry: slot.execute_expiry,
    });

    msg!(
        "accept_commit: {} accepted, delegate approved, execute window closes {}",
        slot.counterparty,
        slot.execute_expiry
    );
    Ok(())
}

#[event]
pub struct AcceptCommitEvent {
    pub slot_id: Pubkey,
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub locked_at: i64,
    pub execute_expiry: i64,
}
