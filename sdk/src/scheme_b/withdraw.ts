/**
 * withdraw() — Treasury Vault Model: Withdraw SPL tokens from shared treasury
 *
 * Users withdraw tokens from the shared Treasury Vault PDA after settlement completes.
 * The Treasury Vault PDA is derived from ["nexum_vault", mint] — a single vault per mint.
 * The on-chain program enforces that only the rightful owner can withdraw.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findTreasuryVaultPDA, findConfigPDA, findAssociatedTokenAddress } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface WithdrawParams {
  mint: PublicKey;
  amount: bigint;
}

export interface WithdrawResult {
  vault: PublicKey;
  tx_signature: string;
}

export async function withdraw(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: WithdrawParams
): Promise<WithdrawResult> {
  const [vaultPda] = findTreasuryVaultPDA(params.mint, program.programId);
  const [configPda] = findConfigPDA(program.programId);
  const userToken = findAssociatedTokenAddress(wallet.publicKey, params.mint);

  const tx = await program.methods
    .withdraw(new anchor.BN(params.amount.toString()))
    .accounts({
      owner: wallet.publicKey,
      vault: vaultPda,
      userToken: userToken,
      mint: params.mint,
      config: configPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return { vault: vaultPda, tx_signature: sig };
}
