use anchor_lang::prelude::*;
use crate::state::{UserLedger, LedgerStatus, CommitSlot, SlotStatus, ProtocolConfig};
use crate::errors::NexumError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitiateCommitParams {
    pub nonce: u64,
    pub counterparty: Pubkey,
    pub asset_b_mint: Pubkey,
    pub commitment_hash: [u8; 32],
    pub expiry_init: i64,
}

#[derive(Accounts)]
#[instruction(p: InitiateCommitParams)]
pub struct InitiateCommit<'info> {
    /// Party A (initiator) must sign and own the ledger.
    #[account(
        mut,
        signer,
        constraint = s.key() == ledger_a.owner @ NexumError::Unauthorized,
    )]
    pub s: Signer<'info>,

    /// Party A's ledger — must be Active, will be set to PendingInitiator.
    #[account(
        mut,
        seeds = [b"ledger", ledger_a.owner.as_ref(), ledger_a.mint.as_ref()],
        bump = ledger_a.bump,
        constraint = ledger_a.status == LedgerStatus::Active
            @ NexumError::LedgerNotActive,
        constraint = p.counterparty != ledger_a.owner
            @ NexumError::SelfSettle,
    )]
    pub ledger_a: Box<Account<'info, UserLedger>>,

    /// New CommitSlot — stores the commitment hash and metadata.
    #[account(
        init,
        payer = s,
        space = CommitSlot::LEN,
        seeds = [b"cslot", ledger_a.key().as_ref(), &p.nonce.to_le_bytes()],
        bump,
    )]
    pub commit_slot: Account<'info, CommitSlot>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
        constraint = !config.is_paused @ NexumError::ProtocolPaused,
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitiateCommit>, p: InitiateCommitParams) -> Result<()> {
    let clock = Clock::get()?;
    let cfg = &ctx.accounts.config;

    // ── Validate expiry window ────────────────────────────────────────
    let window = p
        .expiry_init
        .checked_sub(clock.unix_timestamp)
        .ok_or(NexumError::ExpiryInPast)?;
    require!(
        window >= cfg.min_init_window,
        NexumError::WindowTooShort
    );
    require!(
        window <= cfg.max_init_window,
        NexumError::WindowTooLong
    );

    // ── Validate commitment hash is not empty ─────────────────────────
    require!(
        p.commitment_hash != [0u8; 32],
        NexumError::EmptyCommitmentHash
    );

    // ── Lock Party A's ledger ─────────────────────────────────────────
    let la = &mut ctx.accounts.ledger_a;
    la.status = LedgerStatus::PendingInitiator;
    la.pending_commitment = p.commitment_hash;
    la.pending_expiry = p.expiry_init;
    la.pending_counterparty = p.counterparty;
    la.pending_asset_b_mint = p.asset_b_mint;
    la.pending_nonce = p.nonce;

    // ── Create minimal CommitSlot ─────────────────────────────────────
    let slot = &mut ctx.accounts.commit_slot;
    slot.initiator = la.owner;
    slot.counterparty = p.counterparty;
    slot.asset_a_mint = la.mint;
    slot.asset_b_mint = p.asset_b_mint;
    slot.commitment_hash = p.commitment_hash;
    slot.expiry_init = p.expiry_init;
    slot.execute_expiry = 0;      // Filled on accept
    slot.nonce = p.nonce;
    slot.both_locked_at = 0;      // Filled on accept
    slot.status = SlotStatus::WaitingAccept;
    slot.bump = ctx.bumps.commit_slot;

    emit!(InitiateCommitEvent {
        slot_id: slot.key(),
        initiator: la.owner,
        counterparty: p.counterparty,
        asset_a: la.mint,
        asset_b: p.asset_b_mint,
        expiry: p.expiry_init,
        ts: clock.unix_timestamp,
    });

    msg!(
        "initiate_commit: initiator={}, counterparty={}, expires={}",
        la.owner,
        p.counterparty,
        p.expiry_init
    );
    Ok(())
}

#[event]
pub struct InitiateCommitEvent {
    pub slot_id: Pubkey,
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub asset_a: Pubkey,
    pub asset_b: Pubkey,
    pub expiry: i64,
    pub ts: i64,
}
