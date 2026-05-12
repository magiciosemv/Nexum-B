/**
 * withdraw() — Treasury Vault Model: Withdraw SPL tokens from shared treasury
 *
 * Users withdraw tokens from the shared Treasury Vault PDA after settlement completes.
 * The Treasury Vault PDA is derived from ["nexum_vault", mint] — a single vault per mint.
 * The on-chain program enforces that only the rightful owner can withdraw.
 *
 * Requires a ZK proof of balance sufficiency and new encrypted balance ciphertexts.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findTreasuryVaultPDA, findConfigPDA, findAssociatedTokenAddress, findLedgerPDA } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");

export interface WithdrawParams {
  mint: PublicKey;
  amount: bigint;
  /** 256-byte Groth16 proof of balance sufficiency */
  proof: number[];
  /** 128-byte ElGamal ciphertext for the new balance low limb */
  newCtLo: number[];
  /** 128-byte ElGamal ciphertext for the new balance high limb */
  newCtHi: number[];
  /** 31-byte randomness used for encrypting the new low limb */
  newRLo: number[];
  /** 31-byte randomness used for encrypting the new high limb */
  newRHi: number[];
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
  const [ledger] = findLedgerPDA(wallet.publicKey, params.mint, program.programId);
  const userToken = findAssociatedTokenAddress(wallet.publicKey, params.mint);

  const tx = await program.methods
    .withdraw(
      new anchor.BN(params.amount.toString()),
      params.proof,
      params.newCtLo,
      params.newCtHi,
      params.newRLo,
      params.newRHi,
    )
    .accounts({
      owner: wallet.publicKey,
      vault: vaultPda,
      userToken: userToken,
      mint: params.mint,
      ledger: ledger,
      config: configPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      zkVerifierProgram: ZK_VERIFIER_ID,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(program.provider.connection, wallet, tx);
  return { vault: vaultPda, tx_signature: sig };
}
