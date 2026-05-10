/**
 * deposit() — Treasury Vault Model: Deposit SPL tokens into shared treasury vault
 *
 * Users deposit tokens into the shared Treasury Vault PDA before participating in settlements.
 * The Treasury Vault PDA is derived from ["nexum_vault", mint] and is shared by all users of that mint.
 * During settlement, the program transfers tokens from the Treasury Vault to counterparty ATAs.
 *
 * Tokens in the Treasury Vault are fully controlled by the program.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findTreasuryVaultPDA, findConfigPDA, findAssociatedTokenAddress } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface DepositParams {
  mint: PublicKey;
  amount: bigint;
}

export interface DepositResult {
  vault: PublicKey;
  tx_signature: string;
}

export async function deposit(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: DepositParams
): Promise<DepositResult> {
  const [vaultPda] = findTreasuryVaultPDA(params.mint, program.programId);
  const [configPda] = findConfigPDA(program.programId);
  const userToken = findAssociatedTokenAddress(wallet.publicKey, params.mint);

  const tx = await program.methods
    .deposit(new anchor.BN(params.amount.toString()))
    .accounts({
      owner: wallet.publicKey,
      userToken: userToken,
      vault: vaultPda,
      mint: params.mint,
      config: configPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return { vault: vaultPda, tx_signature: sig };
}
