/**
 * initializeVault() — Shared Treasury Vault: Initialize a protocol-level vault for a mint
 *
 * Must be called once per mint before any deposits.
 * The vault PDA is derived from ["nexum_vault", mint] — globally unique per mint.
 * All users deposit into and withdraw from this shared vault.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findTreasuryVaultPDA } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export interface InitializeVaultParams {
  mint: PublicKey;
}

export interface InitializeVaultResult {
  vault: PublicKey;
  tx_signature: string;
}

export async function initializeVault(
  program: anchor.Program,
  wallet: anchor.Wallet,
  params: InitializeVaultParams
): Promise<InitializeVaultResult> {
  const [vaultPda] = findTreasuryVaultPDA(params.mint, program.programId);

  const tx = await program.methods
    .initializeVault()
    .accounts({
      payer: wallet.publicKey,
      vault: vaultPda,
      mint: params.mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return { vault: vaultPda, tx_signature: sig };
}
