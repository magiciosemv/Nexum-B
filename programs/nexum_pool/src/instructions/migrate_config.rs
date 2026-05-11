use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::ProtocolConfig;

#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    /// CHECK: Raw account, manually handled
    #[account(
        mut,
        seeds = [b"nexum_config"],
        bump,
    )]
    pub config: AccountInfo<'info>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateConfig>) -> Result<()> {
    let config_info = &ctx.accounts.config;
    let old_data = config_info.try_borrow_data()?;
    let old_len = old_data.len();
    let new_len = 8 + ProtocolConfig::LEN; // 179 bytes

    msg!("migrate_config: old size = {}, new size = {}", old_len, new_len);

    if old_len >= new_len {
        msg!("Config already large enough, no migration needed");
        return Ok(());
    }

    // Drop the borrow before realloc
    drop(old_data);

    // Realloc the account
    config_info.realloc(new_len, false)?;

    // Transfer rent if needed
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(new_len);
    let current_balance = config_info.lamports();

    if min_balance > current_balance {
        let diff = min_balance - current_balance;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: config_info.to_account_info(),
                },
            ),
            diff,
        )?;
    }

    msg!("migrate_config: resized to {} bytes", new_len);
    Ok(())
}
