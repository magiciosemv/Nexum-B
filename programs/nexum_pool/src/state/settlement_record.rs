use anchor_lang::prelude::*;

/// Distinguishes settlement records by scheme origin.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
pub enum SettlementScheme {
    SchemeA,
    SchemeB,
}

impl Default for SettlementScheme {
    fn default() -> Self {
        SettlementScheme::SchemeA
    }
}

/// Permanent on-chain record of a completed settlement.
/// PDA seeds: ["settlement", commit_slot_or_nonce_key, settlement_nonce_le8]
#[account]
#[derive(Default)]
pub struct SettlementRecord {
    pub party_a: Pubkey,             // 32  Initiator
    pub party_b: Pubkey,             // 32  Counterparty
    pub asset_a_mint: Pubkey,        // 32  Asset A mint
    pub asset_b_mint: Pubkey,        // 32  Asset B mint
    pub commitment_hash: [u8; 32],   // 32  SHA-256 commitment hash (from CommitSlot)
    pub version_a: u64,              // 8   Ledger A version after settlement
    pub version_b: u64,              // 8   Ledger B version after settlement
    pub scheme: SettlementScheme,    // 1   Which scheme produced this record
    pub settled_at: i64,             // 8   Timestamp
    pub bump: u8,                    // 1
}

impl SettlementRecord {
    pub const LEN: usize = 8  // discriminator
        + 32                  // party_a
        + 32                  // party_b
        + 32                  // asset_a_mint
        + 32                  // asset_b_mint
        + 32                  // commitment_hash
        + 8                   // version_a
        + 8                   // version_b
        + 1                   // scheme
        + 8                   // settled_at
        + 1;                  // bump
        // Total: 154 bytes
}
