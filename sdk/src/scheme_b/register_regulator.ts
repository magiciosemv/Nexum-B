/**
 * register_regulator.ts — SDK function for registering a regulator public key
 *
 * Calls the on-chain register_regulator instruction to store a 64-byte
 * Baby Jubjub ElGamal public key in ProtocolConfig.
 *
 * Must be called by the wallet matching config.authority (governance authority).
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findConfigPDA } from "./index";
import { sendAndConfirmPolling } from "../utils/send_tx";

/**
 * Register a regulator ElGamal public key on-chain.
 *
 * @param program - Anchor Program instance (with wallet connected via provider)
 * @param regulatorPubkey - 64-byte Baby Jubjub public key (from deriveRegulatorKey)
 * @returns Transaction signature
 */
export async function registerRegulator(
  program: anchor.Program,
  regulatorPubkey: Uint8Array
): Promise<string> {
  if (regulatorPubkey.length !== 64) {
    throw new Error(`regulatorPubkey must be 64 bytes, got ${regulatorPubkey.length}`);
  }

  const wallet = program.provider.wallet as anchor.Wallet;
  const [configPda] = findConfigPDA(program.programId);

  // Convert Uint8Array to number array for Anchor IDL type
  const pubkeyArray = Array.from(regulatorPubkey) as number[];

  const tx = await program.methods
    .registerRegulator(pubkeyArray)
    .accounts({
      config: configPda,
      signer: wallet.publicKey,
    })
    .transaction();

  const sig = await sendAndConfirmPolling(
    program.provider.connection,
    wallet,
    tx
  );

  return sig;
}
