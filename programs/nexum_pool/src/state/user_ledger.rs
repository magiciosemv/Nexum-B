use anchor_lang::prelude::*;

/// Ledger status enum — shared by Scheme A and Scheme B.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum LedgerStatus {
    Active,              // Normal state, can participate in all operations
    PendingInitiator,    // Scheme B: Party A initiated, waiting for B to accept
    BothPending,         // Scheme B: Both parties locked, waiting for execute
    PendingCounterparty, // Scheme B: Party B accepted, balance locked
    Emergency,           // Emergency recovery
}

impl Default for LedgerStatus {
    fn default() -> Self {
        LedgerStatus::Active
    }
}

/// User encrypted-balance ledger.
///
/// Scheme A size: 610 bytes (discriminator 8 + data 602)
/// Scheme B adds: 112 bytes of pending fields
/// Regulator adds: 256 bytes of regulator ciphertexts
/// Total: 994 bytes (discriminator 8 + data 970)
///
/// Layout:
///   owner               32B
///   mint                32B
///   balance_ct_lo      128B   ElGamal ciphertext ( Baby Jubjub, 4 coordinates × 32B)
///   balance_ct_hi      128B
///   audit_ct_lo        128B   Last settlement audit ciphertext
///   audit_ct_hi        128B
///   version              8B   Monotonically increasing
///   status               1B   LedgerStatus enum
///   last_settlement_id  32B
///   bump                 1B
///   ── Scheme B pending fields (112B) ──
///   pending_commitment   32B   Commitment hash (zero when Active)
///   pending_expiry        8B   Initiate expiry timestamp
///   pending_counterparty 32B   Authorized counterparty pubkey
///   pending_asset_b_mint 32B   Counterparty's asset mint
///   pending_nonce         8B   CommitSlot nonce
#[account]
pub struct UserLedger {
    // ── Base fields (Scheme A, 602 bytes) ────────────────────────────
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub balance_ct_lo: [u8; 128],
    pub balance_ct_hi: [u8; 128],
    pub audit_ct_lo: [u8; 128],
    pub audit_ct_hi: [u8; 128],
    pub version: u64,
    pub status: LedgerStatus,
    pub last_settlement_id: [u8; 32],
    pub bump: u8,

    // ── Scheme B pending fields (112 bytes) ──────────────────────────
    pub pending_commitment: [u8; 32],
    pub pending_expiry: i64,
    pub pending_counterparty: Pubkey,
    pub pending_asset_b_mint: Pubkey,
    pub pending_nonce: u64,

    // ── Regulator ciphertexts (256 bytes) ───────────────────────────
    pub regulator_ct_lo: [u8; 128],   // Regulator-encrypted balance low 32 bits
    pub regulator_ct_hi: [u8; 128],   // Regulator-encrypted balance high 32 bits
}

impl Default for UserLedger {
    fn default() -> Self {
        Self {
            owner: Pubkey::default(),
            mint: Pubkey::default(),
            balance_ct_lo: [0u8; 128],
            balance_ct_hi: [0u8; 128],
            audit_ct_lo: [0u8; 128],
            audit_ct_hi: [0u8; 128],
            version: 0,
            status: LedgerStatus::Active,
            last_settlement_id: [0u8; 32],
            bump: 0,
            pending_commitment: [0u8; 32],
            pending_expiry: 0,
            pending_counterparty: Pubkey::default(),
            pending_asset_b_mint: Pubkey::default(),
            pending_nonce: 0,
            regulator_ct_lo: [0u8; 128],
            regulator_ct_hi: [0u8; 128],
        }
    }
}

impl UserLedger {
    // 8(discrim) + 32 + 32 + 128×4 + 8 + 1 + 32 + 1 + 32 + 8 + 32 + 32 + 8 + 128×2
    // = 8 + 602 + 112 + 256 = 994 bytes
    //
    // discriminator: 8
    // owner: 32
    // mint: 32
    // balance_ct_lo: 128
    // balance_ct_hi: 128
    // audit_ct_lo: 128
    // audit_ct_hi: 128
    // version: 8
    // status: 1 (enum variant index)
    // last_settlement_id: 32
    // bump: 1
    // pending_commitment: 32
    // pending_expiry: 8
    // pending_counterparty: 32
    // pending_asset_b_mint: 32
    // pending_nonce: 8
    // regulator_ct_lo: 128
    // regulator_ct_hi: 128
    // Total: 8 + 32 + 32 + 512 + 8 + 1 + 32 + 1 + 32 + 8 + 32 + 32 + 8 + 256 = 994
    pub const LEN: usize = 8  // discriminator
        + 32                  // owner
        + 32                  // mint
        + 128                 // balance_ct_lo
        + 128                 // balance_ct_hi
        + 128                 // audit_ct_lo
        + 128                 // audit_ct_hi
        + 8                   // version
        + 1                   // status (enum)
        + 32                  // last_settlement_id
        + 1                   // bump
        + 32                  // pending_commitment
        + 8                   // pending_expiry
        + 32                  // pending_counterparty
        + 32                  // pending_asset_b_mint
        + 8                   // pending_nonce
        + 128                 // regulator_ct_lo
        + 128;                // regulator_ct_hi

    /// Clear all pending fields. MUST be called in execute_settle_b, cancel_initiate,
    /// and cancel_mutual after state transitions.
    /// Does NOT modify status — caller must set it separately.
    pub fn clear_pending(&mut self) {
        self.pending_commitment = [0u8; 32];
        self.pending_expiry = 0;
        self.pending_counterparty = Pubkey::default();
        self.pending_asset_b_mint = Pubkey::default();
        self.pending_nonce = 0;
    }

    /// Check if the ledger is in any locked state.
    pub fn is_locked(&self) -> bool {
        self.status != LedgerStatus::Active && self.status != LedgerStatus::Emergency
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ledger_len_constant() {
        // Verify LEN matches manual calculation (includes regulator ciphertexts)
        let expected = 8 + 32 + 32 + 128 * 4 + 8 + 1 + 32 + 1 + 32 + 8 + 32 + 32 + 8 + 128 * 2;
        assert_eq!(UserLedger::LEN, expected, "UserLedger::LEN mismatch");
        assert_eq!(UserLedger::LEN, 994, "UserLedger must be exactly 994 bytes");
    }

    #[test]
    fn test_clear_pending_zeros_all() {
        let mut ledger = UserLedger::default();
        ledger.pending_commitment = [42u8; 32];
        ledger.pending_expiry = 12345;
        ledger.pending_nonce = 999;

        ledger.clear_pending();

        assert_eq!(ledger.pending_commitment, [0u8; 32]);
        assert_eq!(ledger.pending_expiry, 0);
        assert_eq!(ledger.pending_counterparty, Pubkey::default());
        assert_eq!(ledger.pending_asset_b_mint, Pubkey::default());
        assert_eq!(ledger.pending_nonce, 0);
    }

    #[test]
    fn test_clear_pending_does_not_touch_status() {
        let mut ledger = UserLedger::default();
        ledger.status = LedgerStatus::BothPending;
        ledger.clear_pending();
        assert_eq!(ledger.status, LedgerStatus::BothPending);
    }

    #[test]
    fn test_is_locked() {
        let mut ledger = UserLedger::default();
        assert!(!ledger.is_locked()); // Active by default

        ledger.status = LedgerStatus::PendingInitiator;
        assert!(ledger.is_locked());

        ledger.status = LedgerStatus::BothPending;
        assert!(ledger.is_locked());

        ledger.status = LedgerStatus::PendingCounterparty;
        assert!(ledger.is_locked());

        ledger.status = LedgerStatus::Emergency;
        assert!(!ledger.is_locked());
    }
}
