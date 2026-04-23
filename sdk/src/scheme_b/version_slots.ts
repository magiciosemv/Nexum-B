/**
 * VersionSlotManager — Market Maker Concurrency Engine
 *
 * Enables parallel ZK proof generation by pre-allocating version numbers.
 * Without version slots, ZK proof generation is strictly serial because
 * each proof depends on the previous settlement's result version number.
 *
 * Chain-of-Assumption Rule:
 *   proof_i is generated assuming slots 0..i-1 all succeed.
 *   Running balance for proof_i = initial_balance - sum(transfer_j for j<i)
 *
 * If slot k fails, ALL proofs for slots > k must be regenerated.
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findVersionSlotPDA, findLedgerPDA, VSlotStatus, bigIntToLeBytes } from "./index";

export interface SlotInfo {
  slot_index: bigint;
  slot_version: bigint;
  pda: PublicKey;
  status: VSlotStatus;
  bound_to: PublicKey | null;
}

export class VersionSlotManager {
  private program: anchor.Program;
  private wallet: anchor.Wallet;
  private ledgerPda: PublicKey;
  private currentVersion: bigint;
  private nextSlotIndex: bigint;
  private maxSlots: number;

  constructor(
    program: anchor.Program,
    wallet: anchor.Wallet,
    ledgerPda: PublicKey,
    currentVersion: bigint,
    maxSlots: number = 20
  ) {
    this.program = program;
    this.wallet = wallet;
    this.ledgerPda = ledgerPda;
    this.currentVersion = currentVersion;
    this.nextSlotIndex = 0n;
    this.maxSlots = maxSlots;
  }

  /**
   * Reserve N version slots on-chain.
   * Creates N VersionSlot PDAs with sequential version numbers.
   */
  async reserve(count: number): Promise<SlotInfo[]> {
    if (count < 1 || count > this.maxSlots) {
      throw new Error(`Slot count must be 1-${this.maxSlots}, got ${count}`);
    }

    const slots: SlotInfo[] = [];

    for (let i = 0; i < count; i++) {
      const slotIndex = this.nextSlotIndex + BigInt(i);
      const slotVersion = this.currentVersion + slotIndex + 1n;

      const [slotPda] = findVersionSlotPDA(
        this.ledgerPda,
        slotIndex,
        this.program.programId
      );

      slots.push({
        slot_index: slotIndex,
        slot_version: slotVersion,
        pda: slotPda,
        status: VSlotStatus.Free,
        bound_to: null,
      });
    }

    // In production, call program.methods.reserveVersionSlots(count)
    // with remaining_accounts populated with the slot PDAs.
    // For now, return the slot info for the caller to manage.

    this.nextSlotIndex += BigInt(count);

    return slots;
  }

  /**
   * Release a version slot (close account, refund rent).
   * Only Free+expired or Done slots can be released.
   */
  async release(slotPda: PublicKey): Promise<string> {
    const sig = await this.program.methods
      .releaseVersionSlot()
      .accounts({
        owner: this.wallet.publicKey,
        versionSlot: slotPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed" });

    return sig;
  }

  /**
   * Get the expected running balance after N sequential transfers.
   * Used for parallel ZK proof generation under the chain-of-assumption rule.
   *
   * @param initialBalance - Current decrypted balance
   * @param transfers - Array of transfer amounts in order
   * @param slotIndex - Which slot's expected balance to compute
   */
  getExpectedBalance(
    initialBalance: bigint,
    transfers: bigint[],
    slotIndex: number
  ): bigint {
    let balance = initialBalance;
    for (let i = 0; i < slotIndex && i < transfers.length; i++) {
      balance -= transfers[i];
    }
    return balance;
  }

  /**
   * Handle chain failure: when slot k fails, regenerate proofs for all slots > k.
   *
   * @param failedSlotIndex - The slot that failed
   * @param allSlots - All slot infos
   * @returns Array of slot indices that need proof regeneration
   */
  getSlotsToRegenerate(failedSlotIndex: number, allSlots: SlotInfo[]): number[] {
    return allSlots
      .map((s, i) => i)
      .filter(i => i > failedSlotIndex && allSlots[i].status !== VSlotStatus.Done);
  }

  /**
   * Get the next slot index for reservation tracking.
   */
  getNextSlotIndex(): bigint {
    return this.nextSlotIndex;
  }

  /**
   * Get the base version (current on-chain version).
   */
  getCurrentVersion(): bigint {
    return this.currentVersion;
  }
}
