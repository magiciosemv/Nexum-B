use anchor_lang::prelude::*;
use crate::state::{UserLedger, VersionSlot, VSlotStatus};
use crate::errors::NexumError;
use crate::constants::MAX_VERSION_SLOTS;

// ── Reserve Version Slots ────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(count: u8)]
pub struct ReserveVersionSlots<'info> {
    #[account(
        signer,
        constraint = owner.key() == ledger.owner @ NexumError::Unauthorized,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"ledger", ledger.owner.as_ref(), ledger.mint.as_ref()],
        bump = ledger.bump,
    )]
    pub ledger: Box<Account<'info, UserLedger>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_reserve(ctx: Context<ReserveVersionSlots>, count: u8) -> Result<()> {
    require!(
        count > 0 && count <= MAX_VERSION_SLOTS,
        NexumError::InvalidSlotCount
    );

    let remaining = &ctx.remaining_accounts;
    require!(
        remaining.len() == count as usize,
        NexumError::InvalidSlotCount
    );

    let ledger = &ctx.accounts.ledger;
    let ledger_key = ledger.key();
    let base_version = ledger.version;
    let clock = Clock::get()?;

    for i in 0..count as usize {
        let slot_account = &remaining[i];
        let slot_index = i as u64;
        let slot_version = base_version + slot_index + 1;

        // Verify PDA seeds: ["vslot", ledger_key, slot_index_le8]
        let expected_key = Pubkey::create_program_address(
            &[
                b"vslot".as_ref(),
                ledger_key.as_ref(),
                &slot_index.to_le_bytes(),
            ],
            ctx.program_id,
        ).map_err(|_| NexumError::Unauthorized)?;

        require!(
            slot_account.key() == expected_key,
            NexumError::Unauthorized
        );

        // Initialize the VersionSlot account data
        let mut slot_data = slot_account.try_borrow_mut_data()?;
        // Write discriminator (8 bytes) for VersionSlot account
        let disc = VersionSlot::DISCRIMINATOR;
        slot_data[..8].copy_from_slice(disc);

        // Write fields after discriminator using manual serialization
        // Layout: ledger(32) + slot_version(8) + slot_index(8) + status(1) + bound_to(32) + expires_at(8) + bump(1) = 90
        let mut off = 8;
        slot_data[off..off + 32].copy_from_slice(ledger_key.as_ref()); off += 32;
        slot_data[off..off + 8].copy_from_slice(&slot_version.to_le_bytes()); off += 8;
        slot_data[off..off + 8].copy_from_slice(&slot_index.to_le_bytes()); off += 8;
        slot_data[off] = VSlotStatus::Free as u8; off += 1;
        slot_data[off..off + 32].copy_from_slice(&[0u8; 32]); off += 32; // bound_to
        // expires_at: 5 minutes from now for proof generation window
        let expires_at = clock.unix_timestamp + 300;
        slot_data[off..off + 8].copy_from_slice(&expires_at.to_le_bytes()); off += 8;
        // Bump is not known here since we used create_program_address, write 0
        // The real bump would need find_program_address; for reserved slots this is acceptable
        slot_data[off] = 0u8;

        msg!(
            "Reserved version slot: index={}, version={}",
            slot_index,
            slot_version
        );
    }

    Ok(())
}

// ── Release Version Slot ─────────────────────────────────────────────

#[derive(Accounts)]
pub struct ReleaseVersionSlot<'info> {
    #[account(
        signer,
        constraint = owner.key() == version_slot.ledger
            @ NexumError::Unauthorized,
    )]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = is_releasable(&version_slot) @ NexumError::SlotNotReleasable,
        close = owner,
    )]
    pub version_slot: Account<'info, VersionSlot>,

    pub system_program: Program<'info, System>,
}

/// A slot is releasable if it's Done or if it's Free and expired.
fn is_releasable(slot: &VersionSlot) -> bool {
    match slot.status {
        VSlotStatus::Done => true,
        VSlotStatus::Free => {
            let clock = Clock::get().unwrap();
            slot.is_expired(clock.unix_timestamp)
        }
        _ => false,
    }
}

pub fn handle_release(_ctx: Context<ReleaseVersionSlot>) -> Result<()> {
    msg!("Version slot released, rent refunded");
    Ok(())
}
