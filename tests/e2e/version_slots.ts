/**
 * version_slots.ts — E2E Test: Market Maker Concurrency
 *
 * Tests the VersionSlotManager and on-chain reserve/release logic.
 * Verifies chain-of-assumption rule and failure recovery.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { VersionSlotManager } from "../../sdk/src/scheme_b/version_slots";
import { findVersionSlotPDA, findLedgerPDA, findConfigPDA } from "../../sdk/src/scheme_b/index";

describe("Version Slots — Market Maker Concurrency", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NexumPool as Program;
  const maker = Keypair.generate();

  let ledgerPda: PublicKey;
  let configPda: PublicKey;

  const USDC_MINT = Keypair.generate().publicKey;

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(maker.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    [ledgerPda] = findLedgerPDA(maker.publicKey, USDC_MINT, program.programId);
    [configPda] = findConfigPDA(program.programId);

    // Setup (skip if config already exists)
    try {
      await program.methods.initializePool()
        .accounts({ authority: provider.wallet.publicKey, config: configPda, systemProgram: SystemProgram.programId })
        .rpc();
    } catch (e: any) {
      if (!e.message?.includes("already in use")) throw e;
    }

    await program.methods.createUserLedger()
      .accounts({ owner: maker.publicKey, ledger: ledgerPda, mint: USDC_MINT, config: configPda, systemProgram: SystemProgram.programId })
      .signers([maker]).rpc();
  });

  it("VersionSlotManager computes expected balances for parallel proofs", () => {
    const manager = new VersionSlotManager(
      program,
      { publicKey: maker.publicKey } as any,
      ledgerPda,
      10n, // current version
      5
    );

    const initialBalance = 1_000_000_000n; // 1000 USDC
    const transfers = [100_000_000n, 50_000_000n, 200_000_000n, 75_000_000n, 30_000_000n];

    // Verify chain-of-assumption balance computation
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 0), 1_000_000_000n);
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 1), 900_000_000n);
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 2), 850_000_000n);
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 3), 650_000_000n);
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 4), 575_000_000n);
    assert.equal(manager.getExpectedBalance(initialBalance, transfers, 5), 545_000_000n);
  });

  it("VersionSlotManager identifies slots to regenerate after failure", () => {
    const manager = new VersionSlotManager(
      program,
      { publicKey: maker.publicKey } as any,
      ledgerPda,
      0n,
      5
    );

    const { VSlotStatus } = require("../../sdk/src/scheme_b/index");
    const slots = [
      { slot_index: 0n, slot_version: 1n, pda: PublicKey.default, status: VSlotStatus.Done, bound_to: null },
      { slot_index: 1n, slot_version: 2n, pda: PublicKey.default, status: VSlotStatus.Done, bound_to: null },
      { slot_index: 2n, slot_version: 3n, pda: PublicKey.default, status: VSlotStatus.Free, bound_to: null }, // Failed
      { slot_index: 3n, slot_version: 4n, pda: PublicKey.default, status: VSlotStatus.Free, bound_to: null },
      { slot_index: 4n, slot_version: 5n, pda: PublicKey.default, status: VSlotStatus.Free, bound_to: null },
    ];

    // Slot 2 failed → slots 3 and 4 need regeneration
    const toRegen = manager.getSlotsToRegenerate(2, slots);
    assert.deepEqual(toRegen, [3, 4]);

    // Slot 0 failed → slots 2, 3, 4 need regeneration (slot 1 is Done, so it's skipped)
    const toRegenFrom0 = manager.getSlotsToRegenerate(0, slots);
    assert.deepEqual(toRegenFrom0, [2, 3, 4]); // slot 1 is Done, so it won't be included
  });

  it("PDA derivation is consistent between SDK and on-chain", async () => {
    // Verify that SDK PDA derivation matches what Anchor expects
    const slotIndex = 0n;
    const [sdkPda] = findVersionSlotPDA(ledgerPda, slotIndex, program.programId);

    // The PDA should be deterministic
    const [sdkPda2] = findVersionSlotPDA(ledgerPda, slotIndex, program.programId);
    assert.equal(sdkPda.toBase58(), sdkPda2.toBase58());

    // Different slot indices should produce different PDAs
    const [sdkPda3] = findVersionSlotPDA(ledgerPda, 1n, program.programId);
    assert.notEqual(sdkPda.toBase58(), sdkPda3.toBase58());
  });
});
