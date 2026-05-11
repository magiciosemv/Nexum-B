use anchor_lang::prelude::*;

/// Protocol-level configuration, stored in a single PDA.
/// PDA seeds: ["nexum_config"]
#[account]
pub struct ProtocolConfig {
    pub authority: Pubkey,           // 32  Governance authority
    pub is_paused: bool,             // 1   Emergency pause flag
    pub min_init_window: i64,        // 8   Minimum initiate validity (seconds)
    pub max_init_window: i64,        // 8   Maximum initiate validity (seconds)
    pub execute_window: i64,         // 8   Execute window after dual-lock (seconds)
    pub clock_tolerance: i64,        // 8   Solana clock skew tolerance (seconds)
    pub max_version_slots: u8,       // 1   Max slots per reserve call
    pub bump: u8,                    // 1
    pub regulator_authority: Pubkey, // 32  Preset regulator wallet address
    pub regulator_pubkey: [u8; 64],  // 64  Baby Jubjub public key (filled on registration)
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
        + 1                   // bump
        + 32                  // regulator_authority
        + 64;                 // regulator_pubkey
        // Total: 171 bytes
}

impl Default for ProtocolConfig {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            is_paused: false,
            min_init_window: 0,
            max_init_window: 0,
            execute_window: 0,
            clock_tolerance: 0,
            max_version_slots: 0,
            bump: 0,
            regulator_authority: Pubkey::default(),
            regulator_pubkey: [0u8; 64],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_len_constant() {
        let expected = 8 + 32 + 1 + 8 + 8 + 8 + 8 + 1 + 1 + 32 + 64;
        assert_eq!(ProtocolConfig::LEN, expected, "ProtocolConfig::LEN mismatch");
        assert_eq!(ProtocolConfig::LEN, 171, "ProtocolConfig must be exactly 171 bytes");
    }
}
