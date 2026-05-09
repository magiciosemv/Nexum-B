use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke, pubkey::Pubkey};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::NexumError;
use crate::utils::commitment::compute_commitment_v3;

/// zk_verifier program ID — matches 6X4MCKGaZHVUpzVKJSmgZgUcK5ZTvxPixK4f3ARNfPyN
const ZK_VERIFIER_ID: &str = "6X4MCKGaZHVUpzVKJSmgZgUcK5ZTvxPixK4f3ARNfPyN";

/// Params for execute_settle_b.
/// Large proof/ciphertext arrays come from the ProofData account to avoid BPF stack overflow.
/// Transfer amounts are cleartext — verified against the commitment hash before execution.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleAtomicParams {
    pub nonce: u64,
    // Commitment hash as two 128-bit limbs (from CommitSlot)
    pub commitment_hash_lo: u128,
    pub commitment_hash_hi: u128,
    pub settlement_nonce: u64,
    // Two-way swap amounts (cleartext, verified against commitment hash)
    pub transfer_amount_a: u64,  // A→B amount (asset_a_mint)
    pub transfer_amount_b: u64,  // B→A amount (asset_b_mint)
}

#[derive(Accounts)]
#[instruction(p: SettleAtomicParams)]
pub struct ExecuteSettleB<'info> {
    /// Party A's ledger — must be BothPending. Boxed to reduce BPF stack frame.
    #[account(
        mut,
        seeds = [
            b"ledger",
            commit_slot.initiator.as_ref(),
            commit_slot.asset_a_mint.as_ref(),
        ],
        bump = ledger_a.bump,
        constraint = ledger_a.status == LedgerStatus::BothPending
            @ NexumError::LedgerNotBothPending,
    )]
    pub ledger_a: Box<Account<'info, UserLedger>>,

    /// Party B's ledger — must be PendingCounterparty. Boxed to reduce BPF stack frame.
    #[account(
        mut,
        seeds = [
            b"ledger",
            commit_slot.counterparty.as_ref(),
            commit_slot.asset_b_mint.as_ref(),
        ],
        bump = ledger_b.bump,
        constraint = ledger_b.status == LedgerStatus::PendingCounterparty
            @ NexumError::LedgerNotPending,
    )]
    pub ledger_b: Box<Account<'info, UserLedger>>,

    /// CommitSlot — must be BothLocked. Closed on success, rent to fee_payer. Boxed.
    #[account(
        mut,
        seeds = [
            b"cslot",
            ledger_a.key().as_ref(),
            &ledger_a.pending_nonce.to_le_bytes(),
        ],
        bump = commit_slot.bump,
        constraint = commit_slot.status == SlotStatus::BothLocked
            @ NexumError::SlotNotLocked,
        close = fee_payer,
    )]
    pub commit_slot: Box<Account<'info, CommitSlot>>,

    /// Proof data account — holds ZK proofs and ciphertexts (1537B). Boxed.
    /// PDA seeds: ["proofs", nonce.to_le_bytes()]
    /// Created off-chain by the submitting party before calling execute.
    #[account(
        seeds = [
            b"proofs",
            &p.nonce.to_le_bytes(),
        ],
        bump = proof_data.bump,
        constraint = proof_data.nonce == p.nonce
            @ NexumError::InvalidNonce,
    )]
    pub proof_data: Box<Account<'info, ProofData>>,

    /// Settlement record — permanent on-chain evidence.
    #[account(
        init,
        payer = fee_payer,
        space = 8 + SettlementRecord::LEN,
        seeds = [
            b"settlement",
            commit_slot.key().as_ref(),
            &p.settlement_nonce.to_le_bytes(),
        ],
        bump,
    )]
    pub settlement_record: Box<Account<'info, SettlementRecord>>,

    #[account(
        seeds = [b"nexum_config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    #[account(mut)]
    pub fee_payer: Signer<'info>,

    pub system_program: Program<'info, System>,

    /// ZK verifier program — called via CPI to verify Groth16 proofs.
    /// CHECK: Verified by program ID constraint. Raw AccountInfo used because
    /// nexum_pool does not depend on zk_verifier crate (avoids groth16-solana bloat).
    #[account(
        constraint = zk_verifier_program.key() == Pubkey::try_from(ZK_VERIFIER_ID).unwrap()
            @ NexumError::InvalidZkVerifierProgram,
    )]
    pub zk_verifier_program: AccountInfo<'info>,

    // ── SPL Token accounts for two-way swap ──────────────────────────

    /// Party A's token account for asset_a (source: A→B transfer).
    #[account(
        mut,
        constraint = party_a_token_a.mint == commit_slot.asset_a_mint @ NexumError::MintMismatch,
        constraint = party_a_token_a.owner == commit_slot.initiator @ NexumError::Unauthorized,
    )]
    pub party_a_token_a: Box<Account<'info, TokenAccount>>,

    /// Party B's token account for asset_a (destination: A→B transfer).
    #[account(
        mut,
        constraint = party_b_token_a.mint == commit_slot.asset_a_mint @ NexumError::MintMismatch,
    )]
    pub party_b_token_a: Box<Account<'info, TokenAccount>>,

    /// Party B's token account for asset_b (source: B→A transfer, signed by delegate PDA).
    #[account(
        mut,
        constraint = party_b_token_b.mint == commit_slot.asset_b_mint @ NexumError::MintMismatch,
        constraint = party_b_token_b.owner == commit_slot.counterparty @ NexumError::Unauthorized,
    )]
    pub party_b_token_b: Box<Account<'info, TokenAccount>>,

    /// Party A's token account for asset_b (destination: B→A transfer).
    #[account(
        mut,
        constraint = party_a_token_b.mint == commit_slot.asset_b_mint @ NexumError::MintMismatch,
    )]
    pub party_a_token_b: Box<Account<'info, TokenAccount>>,

    /// Delegate PDA — authorized by Party B during accept_commit to transfer asset_b.
    /// CHECK: PDA seeds verified, used as signing authority for CPI.
    #[account(
        seeds = [b"delegate", commit_slot.key().as_ref()],
        bump,
    )]
    /// CHECK: PDA used as signing authority
    pub delegate: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ExecuteSettleB>, p: SettleAtomicParams) -> Result<()> {
    let clock = Clock::get()?;
    let slot = &ctx.accounts.commit_slot;
    let config = &ctx.accounts.config;
    let proofs = &ctx.accounts.proof_data;

    // ── Step 1: Execute window validation ──────────────────────────────
    require!(
        clock.unix_timestamp <= slot.execute_expiry + config.clock_tolerance,
        NexumError::ExecuteWindowExpired
    );

    // ── Step 2: Commitment hash verification ──────────────────────────
    // Recompute the commitment hash from cleartext amounts and compare against on-chain hash.
    // This proves the transfer amounts were committed to during initiate_commit.
    let (a_lo, a_hi) = split_u64(p.transfer_amount_a);
    let (b_lo, b_hi) = split_u64(p.transfer_amount_b);
    let computed_hash = compute_commitment_v3(
        slot.nonce,
        a_lo, a_hi,
        b_lo, b_hi,
        &slot.asset_a_mint,
        &slot.asset_b_mint,
        &slot.counterparty,
        slot.expiry_init,
    );
    require!(
        computed_hash == slot.commitment_hash,
        NexumError::CommitmentMismatch
    );

    // ── Step 3: ZK proof verification via CPI to zk_verifier ──────────
    // Each proof verifies: balance transition is valid AND SHA-256(commitment preimage) matches hash
    // All amount values are PRIVATE — only commitment_hash is public.
    invoke_verify_proof(
        &ctx.accounts.zk_verifier_program,
        proofs.proof_a,
        p.commitment_hash_lo,
        p.commitment_hash_hi,
    ).map_err(|_| NexumError::ProofVerificationFailed)?;

    invoke_verify_proof(
        &ctx.accounts.zk_verifier_program,
        proofs.proof_b,
        p.commitment_hash_lo,
        p.commitment_hash_hi,
    ).map_err(|_| NexumError::ProofVerificationFailed)?;

    msg!("execute_settle_b: Both ZK proofs verified (private circuit)");

    // ── Step 4: SPL token transfers (two-way swap) ────────────────────
    // Transfer A→B: Party A sends asset_a to Party B (signed by fee_payer)
    if p.transfer_amount_a > 0 {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.party_a_token_a.to_account_info(),
                to: ctx.accounts.party_b_token_a.to_account_info(),
                authority: ctx.accounts.fee_payer.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, p.transfer_amount_a)?;
        msg!("execute_settle_b: transferred {} asset_a A→B", p.transfer_amount_a);
    }

    // Transfer B→A: Party B sends asset_b to Party A (signed by delegate PDA)
    if p.transfer_amount_b > 0 {
        let slot_key = ctx.accounts.commit_slot.key();
        let (_, delegate_bump) = Pubkey::find_program_address(
            &[b"delegate", slot_key.as_ref()],
            ctx.program_id,
        );
        let signer_seeds: &[&[&[u8]]] = &[&[b"delegate", slot_key.as_ref(), &[delegate_bump]]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.party_b_token_b.to_account_info(),
                to: ctx.accounts.party_a_token_b.to_account_info(),
                authority: ctx.accounts.delegate.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, p.transfer_amount_b)?;
        msg!("execute_settle_b: transferred {} asset_b B→A", p.transfer_amount_b);
    }

    // ── Step 5: Update balances using proof data from account ──────────
    let la = &mut ctx.accounts.ledger_a;
    la.balance_ct_lo = proofs.new_ct_a_lo;
    la.balance_ct_hi = proofs.new_ct_a_hi;
    la.audit_ct_lo = proofs.audit_ct_a_lo;
    la.audit_ct_hi = proofs.audit_ct_a_hi;
    la.version = la.version.checked_add(1).unwrap();
    la.status = LedgerStatus::Active;
    la.last_settlement_id = ctx.accounts.settlement_record.key().to_bytes();
    la.clear_pending();

    let lb = &mut ctx.accounts.ledger_b;
    lb.balance_ct_lo = proofs.new_ct_b_lo;
    lb.balance_ct_hi = proofs.new_ct_b_hi;
    lb.audit_ct_lo = proofs.audit_ct_b_lo;
    lb.audit_ct_hi = proofs.audit_ct_b_hi;
    lb.version = lb.version.checked_add(1).unwrap();
    lb.status = LedgerStatus::Active;
    lb.last_settlement_id = ctx.accounts.settlement_record.key().to_bytes();
    lb.clear_pending();

    // ── Step 6: Create settlement record ──────────────────────────────
    let record = &mut ctx.accounts.settlement_record;
    record.party_a = slot.initiator;
    record.party_b = slot.counterparty;
    record.asset_a_mint = slot.asset_a_mint;
    record.asset_b_mint = slot.asset_b_mint;
    record.commitment_hash = slot.commitment_hash;
    record.version_a = ctx.accounts.ledger_a.version;
    record.version_b = ctx.accounts.ledger_b.version;
    record.scheme = SettlementScheme::SchemeB;
    record.settled_at = clock.unix_timestamp;
    record.bump = ctx.bumps.settlement_record;

    emit!(ExecuteSchemeBEvent {
        settlement_id: ctx.accounts.settlement_record.key(),
        commit_id: slot.key(),
        initiator: slot.initiator,
        counterparty: slot.counterparty,
        transfer_amount_a: p.transfer_amount_a,
        transfer_amount_b: p.transfer_amount_b,
        ts: clock.unix_timestamp,
    });

    msg!(
        "execute_settle_b: settled {} <-> {}, A→B: {}, B→A: {}",
        slot.initiator,
        slot.counterparty,
        p.transfer_amount_a,
        p.transfer_amount_b
    );
    Ok(())
}

#[event]
pub struct ExecuteSchemeBEvent {
    pub settlement_id: Pubkey,
    pub commit_id: Pubkey,
    pub initiator: Pubkey,
    pub counterparty: Pubkey,
    pub transfer_amount_a: u64,
    pub transfer_amount_b: u64,
    pub ts: i64,
}

/// Split u64 into two u32 limbs (little-endian order) for commitment hash.
fn split_u64(v: u64) -> (u32, u32) {
    (v as u32, (v >> 32) as u32)
}

/// Call zk_verifier::verify_proof via raw CPI (invoke).
/// Private circuit: 2 public inputs (commitment_hash_lo, commitment_hash_hi).
fn invoke_verify_proof<'info>(
    zk_verifier_program: &AccountInfo<'info>,
    proof: [u8; 256],
    commitment_hash_lo: u128,
    commitment_hash_hi: u128,
) -> Result<()> {
    // Anchor discriminator for verify_proof: first 8 bytes of sha256("global:verify_proof")
    let discriminator: [u8; 8] = [217, 211, 191, 110, 144, 13, 186, 98];

    // Serialize instruction data: discriminator + proof(256) + 2 × u128_le
    let mut ix_data = Vec::with_capacity(8 + 256 + 32);
    ix_data.extend_from_slice(&discriminator);
    ix_data.extend_from_slice(&proof);
    ix_data.extend_from_slice(&commitment_hash_lo.to_le_bytes());
    ix_data.extend_from_slice(&commitment_hash_hi.to_le_bytes());

    let ix = Instruction {
        program_id: *zk_verifier_program.key,
        accounts: vec![],
        data: ix_data,
    };

    invoke(&ix, &[zk_verifier_program.clone()])?;
    Ok(())
}
