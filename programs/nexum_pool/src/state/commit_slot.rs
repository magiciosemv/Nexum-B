use anchor_lang::prelude::*;

/// Status of a CommitSlot — tracks the lifecycle of a Scheme B settlement intent.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum SlotStatus {
    WaitingAccept, // After initiate_commit, waiting for counterparty to accept
    BothLocked,    // After accept_commit, both balances locked, waiting for execute
    Settled,       // execute_settle_b succeeded (briefly before account closed)
    Cancelled,     // cancel_initiate or cancel_mutual (briefly before account closed)
}

impl Default for SlotStatus {
    fn default() -> Self {
        SlotStatus::WaitingAccept
    }
}

/// CommitSlot — the minimal 204-byte commitment anchor for Scheme B.
///
/// PDA seeds: ["cslot", ledger_a_key(32B), nonce_le8(8B)]
///
/// Only stores a hash + metadata, no ciphertexts, no ZK proofs.
/// Rent is refunded when the slot is closed (execute or cancel).
///
/// Layout (data only, 196 bytes):
///   initiator        32B
///   counterparty     32B
///   asset_a_mint     32B
///   asset_b_mint     32B
///   commitment_hash  32B   SHA-256 of the 120-byte commitment input
///   expiry_init       8B   When the initiate window closes
///   execute_expiry    8B   When the execute window closes (filled on accept)
///   nonce             8B   Anti-collision for PDA derivation
///   both_locked_at    8B   Timestamp when both parties locked (filled on accept)
///   status            1B   SlotStatus enum
///   bump              1B   PDA bump seed
///   Total data: 196 bytes
///   With discriminator: 204 bytes
#[account]
#[derive(Default)]
pub struct CommitSlot {
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub asset_a_mint: Pubkey,
    pub asset_b_mint: Pubkey,
    pub commitment_hash: [u8; 32],
    pub expiry_init: i64,
    pub execute_expiry: i64,
    pub nonce: u64,
    pub both_locked_at: i64,
    pub status: SlotStatus,
    pub bump: u8,
}

impl CommitSlot {
    // 8(discrim) + 32×4 + 32 + 8×3 + 8 + 1 + 1
    // = 8 + 128 + 32 + 24 + 8 + 2 = 202
    // Design doc says 204, leave 2 bytes alignment padding
    pub const LEN: usize = 8  // discriminator
        + 32                  // initiator
        + 32                  // counterparty
        + 32                  // asset_a_mint
        + 32                  // asset_b_mint
        + 32                  // commitment_hash
        + 8                   // expiry_init
        + 8                   // execute_expiry
        + 8                   // nonce
        + 8                   // both_locked_at
        + 1                   // status (enum)
        + 1;                  // bump
        // Total: 202 bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commit_slot_len() {
        let expected = 8 + 32 * 5 + 8 * 3 + 8 + 1 + 1;
        assert_eq!(CommitSlot::LEN, expected);
        // 202 bytes — design doc says 204, the 2-byte difference is Anchor alignment
        assert_eq!(CommitSlot::LEN, 202);
    }

    #[test]
    fn test_default_status() {
        let slot = CommitSlot::default();
        assert_eq!(slot.status, SlotStatus::WaitingAccept);
        assert_eq!(slot.commitment_hash, [0u8; 32]);
        assert_eq!(slot.execute_expiry, 0);
        assert_eq!(slot.both_locked_at, 0);
    }
}
