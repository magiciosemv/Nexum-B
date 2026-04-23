use anchor_lang::prelude::*;

/// Protocol-level configuration, stored in a single PDA.
/// PDA seeds: ["nexum_config"]
#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub authority: Pubkey,           // 32  Governance authority
    pub is_paused: bool,             // 1   Emergency pause flag
    pub min_init_window: i64,        // 8   Minimum initiate validity (seconds)
    pub max_init_window: i64,        // 8   Maximum initiate validity (seconds)
    pub execute_window: i64,         // 8   Execute window after dual-lock (seconds)
    pub clock_tolerance: i64,        // 8   Solana clock skew tolerance (seconds)
    pub max_version_slots: u8,       // 1   Max slots per reserve call
    pub bump: u8,                    // 1
}

impl ProtocolConfig {
    pub const LEN: usize = 8  // discriminator
        + 32                  // authority
        + 1                   // is_paused
        + 8                   // min_init_window
        + 8                   // max_init_window
        + 8                   // execute_window
        + 8                   // clock_tolerance
        + 1                   // max_version_slots
        + 1;                  // bump
        // Total: 67 bytes
}
