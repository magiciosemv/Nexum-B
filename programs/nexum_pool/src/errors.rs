use anchor_lang::prelude::*;

#[error_code]
pub enum NexumError {
    // ── General ───────────────────────────────────────────────────────
    #[msg("Unauthorized: signer does not match expected owner")]
    Unauthorized,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Self-settlement is not allowed")]
    SelfSettle,

    // ── Ledger status errors ──────────────────────────────────────────
    #[msg("Ledger is not in Active status")]
    LedgerNotActive,
    #[msg("Ledger is not in PendingInitiator status")]
    LedgerNotPending,
    #[msg("Ledger is not in BothPending status")]
    LedgerNotBothPending,
    #[msg("Ledger mint does not match")]
    MintMismatch,

    // ── CommitSlot status errors ──────────────────────────────────────
    #[msg("CommitSlot is not in WaitingAccept status")]
    SlotNotWaiting,
    #[msg("CommitSlot is not in BothLocked status")]
    SlotNotLocked,
    #[msg("Wrong counterparty for this commit slot")]
    WrongCounterparty,

    // ── Timing errors ─────────────────────────────────────────────────
    #[msg("Expiry timestamp is in the past")]
    ExpiryInPast,
    #[msg("Initiate window is too short (min 30s)")]
    WindowTooShort,
    #[msg("Initiate window is too long (max 60s)")]
    WindowTooLong,
    #[msg("Initiate has expired")]
    InitiateExpired,
    #[msg("Initiate window has not expired yet — cannot cancel")]
    WindowNotExpired,
    #[msg("Execute window has expired")]
    ExecuteWindowExpired,
    #[msg("Execute window is still active — cannot cancel")]
    ExecuteWindowActive,

    // ── Commitment hash errors ────────────────────────────────────────
    #[msg("Commitment hash cannot be all zeros")]
    EmptyCommitmentHash,
    #[msg("Commitment hash mismatch — amount differs from initial commitment")]
    CommitmentMismatch,

    // ── Version slot errors ───────────────────────────────────────────
    #[msg("Invalid slot count (must be 1-20)")]
    InvalidSlotCount,
    #[msg("Too many reserved slots")]
    TooManySlots,
    #[msg("Slot is not releasable")]
    SlotNotReleasable,

    // ── Proof data errors ──────────────────────────────────────────────
    #[msg("Proof data nonce does not match instruction nonce")]
    InvalidNonce,
    #[msg("Chunk index must be 0-3")]
    InvalidChunkIndex,
    #[msg("Chunk data size does not match expected size for this chunk index")]
    InvalidChunkSize,

    // ── ZK proof errors ────────────────────────────────────────────────
    #[msg("ZK proof verification failed — invalid balance transition proof")]
    ProofVerificationFailed,
    #[msg("Invalid ZK verifier program ID")]
    InvalidZkVerifierProgram,
}
