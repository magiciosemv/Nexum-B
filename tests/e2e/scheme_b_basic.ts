/**
 * scheme_b_basic.ts — E2E Test: Full Scheme B Three-Step Flow with Real ZK Proofs
 *
 * Tests: initiate_commit → accept_commit → execute_settle_b
 * Uses real Groth16 proofs (ProverManager) and ElGamal encrypted ciphertexts.
 *
 * Circuit: balance_transition.circom
 *   Proves: old_balance = new_balance + transfer
 *   For sender (A): A_old = A_new + transfer (balance decreases)
 *   For receiver (B): B_new = B_old + transfer → circuit uses old=B_new, new=B_old
 *
 * Requires: local validator running (anchor test)
 * Requires: NODE_PATH set for snarkjs access
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from "@solana/web3.js";
import { assert } from "chai";
import { computeCommitment } from "../../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  splitAmount,
} from "../../sdk/src/scheme_b/index";
import { ProverManager, createCircuitInputs } from "../../sdk/src/workers/prover";
import {
  generateKeypair,
  encrypt as elgamalEncrypt,
  serializeCiphertext,
} from "../../sdk/src/crypto/elgamal";
import path from "path";

const ZK_VERIFIER_ID = new PublicKey("AytMjF35K8xDnrs7STj3keJzEvDvHGqJv2VQBQN3yfCi");

describe("Scheme B — Basic Three-Step Flow (Real ZK Proofs)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NexumPool as Program;
  const initiator = Keypair.generate();
  const counterparty = Keypair.generate();

  let ledgerA: PublicKey;
  let ledgerB: PublicKey;
  let configPda: PublicKey;
  let commitSlotPda: PublicKey;
  let commitmentHash: Uint8Array;
  let nonce: bigint;

  const USDC_MINT = Keypair.generate().publicKey;
  const SOL_MINT = Keypair.generate().publicKey;
  const transferAmount = 1_000_000n; // 1M units

  // Prover setup
  let prover: ProverManager;
  let keypairA: ReturnType<typeof generateKeypair>;
  let keypairB: ReturnType<typeof generateKeypair>;

  before(async () => {
    // Airdrop SOL to test wallets
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(initiator.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(counterparty.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Derive PDAs
    [ledgerA] = findLedgerPDA(initiator.publicKey, USDC_MINT, program.programId);
    [ledgerB] = findLedgerPDA(counterparty.publicKey, SOL_MINT, program.programId);
    [configPda] = findConfigPDA(program.programId);

    // Initialize prover
    const projectRoot = path.resolve(__dirname, "../..");
    prover = new ProverManager({
      wasmPath: path.join(projectRoot, "circuits/build/balance_transition_js/balance_transition.wasm"),
      zkeyPath: path.join(projectRoot, "circuits/build/balance_transition_final.zkey"),
    });
    await prover.init();

    // Generate ElGamal keypairs for both parties
    keypairA = generateKeypair();
    keypairB = generateKeypair();
  });

  it("Initializes the protocol config (or skips if exists)", async () => {
    try {
      await program.methods
        .initializePool()
        .accounts({
          authority: provider.wallet.publicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (e: any) {
      if (!e.message?.includes("already in use")) throw e;
    }

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.isPaused, false);
  });

  it("Creates user ledgers for both parties", async () => {
    await program.methods
      .createUserLedger()
      .accounts({
        owner: initiator.publicKey,
        ledger: ledgerA,
        mint: USDC_MINT,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([initiator])
      .rpc();

    await program.methods
      .createUserLedger()
      .accounts({
        owner: counterparty.publicKey,
        ledger: ledgerB,
        mint: SOL_MINT,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterparty])
      .rpc();
  });

  it("Step 1: Initiator initiates commit", async () => {
    nonce = BigInt(Date.now());
    const currentSlot = await provider.connection.getSlot();
    const chainTime = await provider.connection.getBlockTime(currentSlot) || Math.floor(Date.now() / 1000);
    const expiry = chainTime + 45;
    const { lo, hi } = splitAmount(transferAmount);

    commitmentHash = await computeCommitment({
      nonce,
      transfer_amount_lo: lo,
      transfer_amount_hi: hi,
      asset_a_mint: USDC_MINT.toBytes(),
      asset_b_mint: SOL_MINT.toBytes(),
      counterparty: counterparty.publicKey.toBytes(),
      expiry_timestamp: expiry,
    });

    [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, program.programId);

    await program.methods
      .initiateCommit({
        nonce: new anchor.BN(nonce.toString()),
        counterparty: counterparty.publicKey,
        assetBMint: SOL_MINT,
        commitmentHash: Array.from(commitmentHash),
        expiryInit: new anchor.BN(expiry),
      })
      .accounts({
        s: initiator.publicKey,
        ledgerA: ledgerA,
        commitSlot: commitSlotPda,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([initiator])
      .rpc();

    const slot = await program.account.commitSlot.fetch(commitSlotPda);
    assert.equal(slot.counterparty.toBase58(), counterparty.publicKey.toBase58());
  });

  it("Step 2: Counterparty accepts commit", async () => {
    await program.methods
      .acceptCommit()
      .accounts({
        s: counterparty.publicKey,
        ledgerA: ledgerA,
        ledgerB: ledgerB,
        commitSlot: commitSlotPda,
        config: configPda,
      })
      .signers([counterparty])
      .rpc();

    const slot = await program.account.commitSlot.fetch(commitSlotPda);
    assert.exists(slot.bothLockedAt);
    assert.exists(slot.executeExpiry);
  });

  it("Step 3: Execute settlement with real ZK proofs", async () => {
    const { lo: transfer_lo, hi: transfer_hi } = splitAmount(transferAmount);

    // ── Generate real Groth16 proofs ──────────────────────────────────
    // Party A (sender): A_old=1000000, A_new=0, transfer=1000000
    // Circuit proves: A_old = A_new + transfer → 1000000 = 0 + 1000000
    const proofA = await prover.generateProof(createCircuitInputs({
      old_balance_lo: 1000000,
      old_balance_hi: 0,
      new_balance_lo: 0,
      new_balance_hi: 0,
      transfer_lo: Number(transfer_lo),
      transfer_hi: Number(transfer_hi),
    }));

    // Party B (receiver): B_old=0, B_new=1000000
    // Circuit: old=B_new=1000000, new=B_old=0, transfer=1000000
    // Proves: 1000000 = 0 + 1000000
    const proofB = await prover.generateProof(createCircuitInputs({
      old_balance_lo: 1000000,  // B's new balance (circuit "old")
      old_balance_hi: 0,
      new_balance_lo: 0,        // B's old balance (circuit "new")
      new_balance_hi: 0,
      transfer_lo: Number(transfer_lo),
      transfer_hi: Number(transfer_hi),
    }));

    // ── ElGamal encrypt new balances ──────────────────────────────────
    // A's new balance = 0 (encrypted for A)
    const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
    const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
    const audit_a_lo = elgamalEncrypt(1000000n, keypairA.publicKey); // old balance for audit
    const audit_a_hi = elgamalEncrypt(0n, keypairA.publicKey);

    // B's new balance = 1000000 (encrypted for B)
    const ct_b_lo = elgamalEncrypt(1000000n, keypairB.publicKey);
    const ct_b_hi = elgamalEncrypt(0n, keypairB.publicKey);
    const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey); // old balance for audit
    const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);

    // ── Build proof chunks ────────────────────────────────────────────
    const chunk0 = proofA.proof_a; // 256 bytes: proof_a
    const chunk1 = [ // 512 bytes: ct_a
      ...Array.from(serializeCiphertext(ct_a_lo)),
      ...Array.from(serializeCiphertext(ct_a_hi)),
      ...Array.from(serializeCiphertext(audit_a_lo)),
      ...Array.from(serializeCiphertext(audit_a_hi)),
    ];
    const chunk2 = proofB.proof_a; // 256 bytes: proof_b
    const chunk3 = [ // 512 bytes: ct_b
      ...Array.from(serializeCiphertext(ct_b_lo)),
      ...Array.from(serializeCiphertext(ct_b_hi)),
      ...Array.from(serializeCiphertext(audit_b_lo)),
      ...Array.from(serializeCiphertext(audit_b_hi)),
    ];

    // ── Create ProofData account ──────────────────────────────────────
    const [proofDataPda] = findProofDataPDA(nonce, program.programId);

    await program.methods
      .createProofData({
        nonce: new anchor.BN(nonce.toString()),
      })
      .accounts({
        proofData: proofDataPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // ── Write proof chunks (4 chunks) ────────────────────────────────
    const chunks = [chunk0, chunk1, chunk2, chunk3];
    for (let i = 0; i < 4; i++) {
      await program.methods
        .writeProofData({
          nonce: new anchor.BN(nonce.toString()),
          chunkIndex: i,
          data: Buffer.from(chunks[i]),
        })
        .accounts({
          proofData: proofDataPda,
          authority: provider.wallet.publicKey,
        })
        .rpc();
    }

    // ── Execute settlement with real proofs ───────────────────────────
    const settlementNonce = BigInt(Date.now());
    const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, program.programId);

    await program.methods
      .executeSettleB({
        nonce: new anchor.BN(nonce.toString()),
        transferLo: transfer_lo,
        transferHi: transfer_hi,
        settlementNonce: new anchor.BN(settlementNonce.toString()),
        // Party A public balance values (sender: old=1000000, new=0)
        oldALo: 1000000,
        oldAHi: 0,
        newALo: 0,
        newAHi: 0,
        // Party B public balance values (receiver: circuit old=B_new=1000000, circuit new=B_old=0)
        oldBLo: 1000000,
        oldBHi: 0,
        newBLo: 0,
        newBHi: 0,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ])
      .accounts({
        ledgerA: ledgerA,
        ledgerB: ledgerB,
        commitSlot: commitSlotPda,
        proofData: proofDataPda,
        settlementRecord: settlementPda,
        config: configPda,
        feePayer: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        zkVerifierProgram: ZK_VERIFIER_ID,
      })
      .rpc();

    // ── Verify settlement ─────────────────────────────────────────────
    const record = await program.account.settlementRecord.fetch(settlementPda);
    assert.equal(record.transferLo, transfer_lo);
    assert.equal(record.transferHi, transfer_hi);
    assert.deepEqual(record.scheme, { schemeB: {} });

    // Verify both ledgers are back to Active
    const la = await program.account.userLedger.fetch(ledgerA);
    const lb = await program.account.userLedger.fetch(ledgerB);
    // Status should be Active (variant 0)
    assert.deepEqual(la.status as any, { active: {} });
    assert.deepEqual(lb.status as any, { active: {} });
  });
});
