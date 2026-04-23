use anchor_lang::prelude::*;

/// Status of a VersionSlot — tracks the pre-allocated version for concurrent settlement.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum VSlotStatus {
    Free,    // Pre-allocated, not yet bound to a settlement
    Bound,   // Bound to a specific CommitSlot
    Done,    // Settlement completed, slot fulfilled its purpose
    Expired, // Timed out without being used, eligible for release
}

impl Default for VSlotStatus {
    fn default() -> Self {
        VSlotStatus::Free
    }
}

/// VersionSlot — pre-allocated version number for market maker concurrency.
///
/// PDA seeds: ["vslot", ledger_key(32B), slot_index_le8(8B)]
///
/// Enables parallel ZK proof generation by pre-assigning version numbers
/// before settlement execution. Without version slots, ZK proof generation
/// is strictly serial (each proof depends on the previous settlement's result).
///
/// Layout (data only, 90 bytes):
///   ledger        32B   Owning ledger
///   slot_version   8B   The pre-assigned version number
///   slot_index     8B   Slot sequence number (0-based)
///   status         1B   VSlotStatus enum
///   bound_to      32B   Bound CommitSlot pubkey (when Bound)
///   expires_at     8B   Timeout for Free slots
///   bump           1B   PDA bump
///   Total data: 90 bytes
///   With discriminator: 98 bytes
#[account]
#[derive(Default)]
pub struct VersionSlot {
    pub ledger: Pubkey,
    pub slot_version: u64,
    pub slot_index: u64,
    pub status: VSlotStatus,
    pub bound_to: [u8; 32],
    pub expires_at: i64,
    pub bump: u8,
}

impl VersionSlot {
    // 8(discrim) + 32 + 8 + 8 + 1 + 32 + 8 + 1 = 98
    pub const LEN: usize = 8  // discriminator
        + 32                  // ledger
        + 8                   // slot_version
        + 8                   // slot_index
        + 1                   // status (enum)
        + 32                  // bound_to
        + 8                   // expires_at
        + 1;                  // bump
        // Total: 98 bytes

    /// Check if this slot has expired (only meaningful for Free slots).
    pub fn is_expired(&self, current_time: i64) -> bool {
        self.status == VSlotStatus::Free && current_time > self.expires_at
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_slot_len() {
        let expected = 8 + 32 + 8 + 8 + 1 + 32 + 8 + 1;
        assert_eq!(VersionSlot::LEN, expected);
        assert_eq!(VersionSlot::LEN, 98);
    }

    #[test]
    fn test_is_expired_free_and_past() {
        let slot = VersionSlot {
            status: VSlotStatus::Free,
            expires_at: 1000,
            ..Default::default()
        };
        assert!(slot.is_expired(1001));
        assert!(!slot.is_expired(999));
        assert!(!slot.is_expired(1000)); // exactly at expiry is NOT expired
    }

    #[test]
    fn test_is_expired_non_free_never_expires() {
        let slot = VersionSlot {
            status: VSlotStatus::Bound,
            expires_at: 1000,
            ..Default::default()
        };
        assert!(!slot.is_expired(2000)); // Bound slots don't expire
    }
}
