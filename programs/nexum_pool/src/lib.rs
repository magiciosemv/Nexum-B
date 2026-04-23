pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;
pub use utils::*;

use anchor_lang::prelude::*;

declare_id!("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");

#[program]
pub mod nexum_pool {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        instructions::initialize_pool::handler(ctx)
    }

    pub fn create_user_ledger(ctx: Context<CreateUserLedger>) -> Result<()> {
        instructions::create_user_ledger::handler(ctx)
    }

    pub fn initiate_commit(
        ctx: Context<InitiateCommit>,
        params: instructions::initiate_commit::InitiateCommitParams,
    ) -> Result<()> {
        instructions::initiate_commit::handler(ctx, params)
    }

    pub fn accept_commit(ctx: Context<AcceptCommit>) -> Result<()> {
        instructions::accept_commit::handler(ctx)
    }

    pub fn create_proof_data(
        ctx: Context<CreateProofData>,
        params: instructions::create_proof_data::CreateProofDataParams,
    ) -> Result<()> {
        instructions::create_proof_data::handler(ctx, params)
    }

    pub fn execute_settle_b(
        ctx: Context<ExecuteSettleB>,
        params: instructions::execute_settle_b::SettleAtomicParams,
    ) -> Result<()> {
        instructions::execute_settle_b::handler(ctx, params)
    }

    pub fn cancel_initiate(ctx: Context<CancelInitiate>) -> Result<()> {
        instructions::cancel_initiate::handler(ctx)
    }

    pub fn cancel_mutual(ctx: Context<CancelMutual>) -> Result<()> {
        instructions::cancel_mutual::handler(ctx)
    }

    pub fn write_proof_data(
        ctx: Context<WriteProofData>,
        params: instructions::write_proof_data::WriteProofDataParams,
    ) -> Result<()> {
        instructions::write_proof_data::handler(ctx, params)
    }
}
