use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::UserLedger;

#[derive(Accounts)]
pub struct MigrateLedger<'info> {
    /// CHECK: Raw account, manually handled
    #[account(mut)]
    pub ledger: AccountInfo<'info>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateLedger>) -> Result<()> {
    let ledger_info = &ctx.accounts.ledger;
    let old_data = ledger_info.try_borrow_data()?;
    let old_len = old_data.len();
    let new_len = UserLedger::LEN; // 994 bytes (includes discriminator)

    msg!("migrate_ledger: old size = {}, new size = {}", old_len, new_len);

    if old_len >= new_len {
        msg!("Ledger already large enough, no migration needed");
        return Ok(());
    }

    // Verify account is owned by this program
    require!(
        ledger_info.owner == ctx.program_id,
        crate::errors::NexumError::Unauthorized
    );

    // Log discriminator for debugging
    msg!("migrate_ledger: discriminator = {:?}", &old_data[..8]);

    // Drop the borrow before realloc
    drop(old_data);

    // Realloc the account
    ledger_info.realloc(new_len, false)?;

    // Zero-fill the new bytes (regulator ciphertexts)
    let mut data = ledger_info.try_borrow_mut_data()?;
    for i in old_len..new_len {
        data[i] = 0;
    }
    drop(data);

    // Transfer rent if needed
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(new_len);
    let current_balance = ledger_info.lamports();

    if min_balance > current_balance {
        let diff = min_balance - current_balance;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ledger_info.to_account_info(),
                },
            ),
            diff,
        )?;
    }

    msg!("migrate_ledger: resized to {} bytes", new_len);
    Ok(())
}
