/**
 * scheme_b_basic.ts — E2E Test: Full Scheme B Two-Way Swap with Real SPL Tokens
 *
 * Tests: initiate_commit → accept_commit (with delegate approve) → execute_settle_b (with CPI transfers)
 * Uses real Groth16 proofs, ElGamal ciphertexts, and SPL token transfers.
 *
 * Party A sends transfer_amount_a of asset_a to Party B.
 * Party B sends transfer_amount_b of asset_b to Party A.
 *
 * Requires: local validator running (anchor test)
 * Requires: NODE_PATH set for snarkjs access
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createMint, mintTo, createAccount, getAccount,
  createAssociatedTokenAccount,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import { computeCommitment } from "../../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  findDelegatePDA,
  splitAmount,
} from "../../sdk/src/scheme_b/index";
import { ProverManager, createPrivateCircuitInputs } from "../../sdk/src/workers/prover";
import {
  generateKeypair,
  encrypt as elgamalEncrypt,
  serializeCiphertext,
} from "../../sdk/src/crypto/elgamal";
import path from "path";

const ZK_VERIFIER_ID = new PublicKey("6X4MCKGaZHVUpzVKJSmgZgUcK5ZTvxPixK4f3ARNfPyN");

describe("Scheme B — Two-Way Swap with Real SPL Tokens", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NexumPool as Program;
  const initiator = Keypair.generate();
  const counterparty = Keypair.generate();
  const projectRoot = path.resolve(__dirname, "../..");

  let ledgerA: PublicKey;
  let ledgerB: PublicKey;
  let configPda: PublicKey;
  let commitSlotPda: PublicKey;
  let commitmentHash: Uint8Array;
  let nonce: bigint;

  // SPL Token mints and accounts
  let mintA: PublicKey;  // Party A's asset
  let mintB: PublicKey;  // Party B's asset
  let partyATokenA: PublicKey;  // A's ATA for mintA (source: A→B)
  let partyBTokenA: PublicKey;  // B's ATA for mintA (destination: A→B)
  let partyBTokenB: PublicKey;  // B's ATA for mintB (source: B→A)
  let partyATokenB: PublicKey;  // A's ATA for mintB (destination: B→A)

  const transferAmountA = 1_000_000n; // A sends 1M of asset_a to B
  const transferAmountB = 500_000n;   // B sends 500K of asset_b to A

  // Prover setup
  let prover: ProverManager;
  let keypairA: ReturnType<typeof generateKeypair>;
  let keypairB: ReturnType<typeof generateKeypair>;

  before(async () => {
    // Airdrop SOL
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(initiator.publicKey, 5 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(counterparty.publicKey, 5 * LAMPORTS_PER_SOL)
    );
    // Airdrop to provider wallet too (for fee_payer in execute)
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(provider.wallet.publicKey, 5 * LAMPORTS_PER_SOL)
    );

    // Create SPL token mints (decimals=0 for simplicity)
    mintA = await createMint(
      provider.connection,
      initiator,
      initiator.publicKey,
      null,
      0,
    );
    mintB = await createMint(
      provider.connection,
      counterparty,
      counterparty.publicKey,
      null,
      0,
    );
    console.log("  Mint A:", mintA.toBase58());
    console.log("  Mint B:", mintB.toBase58());

    // Derive ATAs
    partyATokenA = getAssociatedTokenAddressSync(mintA, initiator.publicKey);
    partyBTokenA = getAssociatedTokenAddressSync(mintA, counterparty.publicKey);
    partyBTokenB = getAssociatedTokenAddressSync(mintB, counterparty.publicKey);
    partyATokenB = getAssociatedTokenAddressSync(mintB, initiator.publicKey);

    // Create ATAs then mint tokens
    await createAssociatedTokenAccount(
      provider.connection,
      initiator,
      mintA,
      initiator.publicKey,
    );
    await mintTo(
      provider.connection,
      initiator,
      mintA,
      partyATokenA,
      initiator,
      10_000_000n,
    );

    await createAssociatedTokenAccount(
      provider.connection,
      counterparty,
      mintB,
      counterparty.publicKey,
    );
    await mintTo(
      provider.connection,
      counterparty,
      mintB,
      partyBTokenB,
      counterparty,
      10_000_000n,
    );

    // Also create "receive" ATAs (B needs ATA for mintA, A needs ATA for mintB)
    await createAssociatedTokenAccount(
      provider.connection,
      counterparty,
      mintA,
      counterparty.publicKey,
    );
    await createAssociatedTokenAccount(
      provider.connection,
      initiator,
      mintB,
      initiator.publicKey,
    );

    console.log("  Party A token A balance: 10,000,000");
    console.log("  Party B token B balance: 10,000,000");

    // Derive PDAs
    [ledgerA] = findLedgerPDA(initiator.publicKey, mintA, program.programId);
    [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, program.programId);
    [configPda] = findConfigPDA(program.programId);

    // Initialize prover
    prover = new ProverManager({
      wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
      zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
    });
    await prover.init();

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
        mint: mintA,
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
        mint: mintB,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterparty])
      .rpc();
  });

  it("Step 1: Initiator commits (two amounts)", async () => {
    nonce = BigInt(Date.now());
    const currentSlot = await provider.connection.getSlot();
    const chainTime = await provider.connection.getBlockTime(currentSlot) || Math.floor(Date.now() / 1000);
    const expiry = chainTime + 45;

    const { lo: a_lo, hi: a_hi } = splitAmount(transferAmountA);
    const { lo: b_lo, hi: b_hi } = splitAmount(transferAmountB);

    commitmentHash = await computeCommitment({
      nonce,
      transfer_a_lo: a_lo,
      transfer_a_hi: a_hi,
      transfer_b_lo: b_lo,
      transfer_b_hi: b_hi,
      asset_a_mint: mintA.toBytes(),
      asset_b_mint: mintB.toBytes(),
      counterparty: counterparty.publicKey.toBytes(),
      expiry_timestamp: expiry,
    });

    [commitSlotPda] = findCommitSlotPDA(ledgerA, nonce, program.programId);

    await program.methods
      .initiateCommit({
        nonce: new anchor.BN(nonce.toString()),
        counterparty: counterparty.publicKey,
        assetBMint: mintB,
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

  it("Step 2: Counterparty accepts (with delegate approval)", async () => {
    const [delegatePda] = findDelegatePDA(commitSlotPda, program.programId);

    await program.methods
      .acceptCommit()
      .accounts({
        s: counterparty.publicKey,
        ledgerA: ledgerA,
        ledgerB: ledgerB,
        commitSlot: commitSlotPda,
        config: configPda,
        partyBToken: partyBTokenB,
        delegate: delegatePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([counterparty])
      .rpc();

    const slot = await program.account.commitSlot.fetch(commitSlotPda);
    assert.exists(slot.bothLockedAt);
    assert.exists(slot.executeExpiry);

    // Verify delegate was approved on Party B's token account
    const tokenAcc = await getAccount(provider.connection, partyBTokenB);
    assert.equal(tokenAcc.delegate.toBase58(), delegatePda.toBase58(), "Delegate PDA must be approved");
    console.log("  Delegate approved:", delegatePda.toBase58());
  });

  it("Step 3: Execute settlement with SPL token transfers", async () => {
    // ── Record balances before ──────────────────────────────────────
    const balABefore = (await getAccount(provider.connection, partyATokenA)).amount;
    const balBBeforeA = (await getAccount(provider.connection, partyBTokenA)).amount;
    const balBBeforeB = (await getAccount(provider.connection, partyBTokenB)).amount;
    const balABeforeB = (await getAccount(provider.connection, partyATokenB)).amount;
    console.log("  Before: A has", balABefore.toString(), "of mintA,", balABeforeB.toString(), "of mintB");
    console.log("  Before: B has", balBBeforeA.toString(), "of mintA,", balBBeforeB.toString(), "of mintB");

    const { lo: a_lo, hi: a_hi } = splitAmount(transferAmountA);
    const { lo: b_lo, hi: b_hi } = splitAmount(transferAmountB);

    // ── Fetch CommitSlot ────────────────────────────────────────────
    const slotInfo = await program.account.commitSlot.fetch(commitSlotPda);
    const slotNonce = BigInt((slotInfo.nonce as any).toString());
    const slotExpiry = (slotInfo.expiryInit as any).toNumber();
    const slotMintA = new Uint8Array(slotInfo.assetAMint.toBytes().subarray(0, 32));
    const slotMintB = new Uint8Array(slotInfo.assetBMint.toBytes().subarray(0, 32));
    const slotCounterparty = new Uint8Array(slotInfo.counterparty.toBytes().subarray(0, 32));

    const preimage = {
      nonce: slotNonce,
      asset_a_mint: slotMintA,
      asset_b_mint: slotMintB,
      counterparty: slotCounterparty,
      expiry: slotExpiry,
    };

    // ── Generate ZK proofs ──────────────────────────────────────────
    // Both proofs use the SAME canonical preimage: transfer=a_amount, transfer_b=b_amount
    // Each proof uses its own swap_amount for the balance constraint.
    const proofA = await prover.generateProof(createPrivateCircuitInputs({
      old_balance_lo: Number(a_lo),
      old_balance_hi: Number(a_hi),
      new_balance_lo: 0,
      new_balance_hi: 0,
      swap_amount_lo: Number(a_lo),
      swap_amount_hi: Number(a_hi),
      transfer_lo: Number(a_lo),
      transfer_hi: Number(a_hi),
      transfer_b_lo: Number(b_lo),
      transfer_b_hi: Number(b_hi),
      ...preimage,
    }));

    // Local verification: check proof is valid before submitting on-chain
    const vkey = JSON.parse(require("fs").readFileSync(
      path.join(projectRoot, "circuits/build_private/verification_key.json"), "utf-8"
    ));
    const localVerify = await prover.verifyProof(proofA.proof_a, proofA.public_signals, vkey);
    console.log("  Local proof A verification:", localVerify ? "PASS" : "FAIL");
    assert.isTrue(localVerify, "Proof A must verify locally");

    console.log("  Proof A public signals:", proofA.public_signals);
    console.log("  Proof A public signals (BN):", proofA.public_signals.map(s => new anchor.BN(s).toString()));

    // Party B: swap_amount=b_amount (balance constraint), same canonical preimage
    const proofB = await prover.generateProof(createPrivateCircuitInputs({
      old_balance_lo: Number(b_lo),
      old_balance_hi: Number(b_hi),
      new_balance_lo: 0,
      new_balance_hi: 0,
      swap_amount_lo: Number(b_lo),
      swap_amount_hi: Number(b_hi),
      transfer_lo: Number(a_lo),
      transfer_hi: Number(a_hi),
      transfer_b_lo: Number(b_lo),
      transfer_b_hi: Number(b_hi),
      ...preimage,
    }));

    // ── ElGamal encrypt ─────────────────────────────────────────────
    const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
    const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
    const audit_a_lo = elgamalEncrypt(BigInt(a_lo), keypairA.publicKey);
    const audit_a_hi = elgamalEncrypt(BigInt(a_hi), keypairA.publicKey);

    const ct_b_lo = elgamalEncrypt(BigInt(b_lo), keypairB.publicKey);
    const ct_b_hi = elgamalEncrypt(BigInt(b_hi), keypairB.publicKey);
    const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey);
    const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);

    // ── Build chunks ────────────────────────────────────────────────
    const chunk0 = proofA.proof_a;
    const chunk1 = [
      ...Array.from(serializeCiphertext(ct_a_lo)),
      ...Array.from(serializeCiphertext(ct_a_hi)),
      ...Array.from(serializeCiphertext(audit_a_lo)),
      ...Array.from(serializeCiphertext(audit_a_hi)),
    ];
    const chunk2 = proofB.proof_a;
    const chunk3 = [
      ...Array.from(serializeCiphertext(ct_b_lo)),
      ...Array.from(serializeCiphertext(ct_b_hi)),
      ...Array.from(serializeCiphertext(audit_b_lo)),
      ...Array.from(serializeCiphertext(audit_b_hi)),
    ];

    // ── Create + write ProofData ────────────────────────────────────
    const [proofDataPda] = findProofDataPDA(nonce, program.programId);

    await program.methods
      .createProofData({ nonce: new anchor.BN(nonce.toString()) })
      .accounts({
        proofData: proofDataPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

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

    // ── Execute with SPL transfers ──────────────────────────────────
    const settlementNonce = BigInt(Date.now());
    const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, program.programId);
    const [delegatePda] = findDelegatePDA(commitSlotPda, program.programId);

    // initiator must be fee_payer because they own partyATokenA and the
    // on-chain code uses fee_payer as authority for A→B transfer.
    await program.methods
      .executeSettleB({
        nonce: new anchor.BN(nonce.toString()),
        commitmentHashLo: new anchor.BN(proofA.public_signals[0]),
        commitmentHashHi: new anchor.BN(proofA.public_signals[1]),
        settlementNonce: new anchor.BN(settlementNonce.toString()),
        transferAmountA: new anchor.BN(transferAmountA.toString()),
        transferAmountB: new anchor.BN(transferAmountB.toString()),
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
        feePayer: initiator.publicKey,
        systemProgram: SystemProgram.programId,
        zkVerifierProgram: ZK_VERIFIER_ID,
        partyATokenA: partyATokenA,
        partyBTokenA: partyBTokenA,
        partyBTokenB: partyBTokenB,
        partyATokenB: partyATokenB,
        delegate: delegatePda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([initiator])
      .rpc();

    // ── Verify settlement record ────────────────────────────────────
    const record = await program.account.settlementRecord.fetch(settlementPda);
    assert.deepEqual(record.scheme, { schemeB: {} });

    // ── Verify token balances changed ───────────────────────────────
    const balAAfter = (await getAccount(provider.connection, partyATokenA)).amount;
    const balBAfterA = (await getAccount(provider.connection, partyBTokenA)).amount;
    const balBAfterB = (await getAccount(provider.connection, partyBTokenB)).amount;
    const balAAfterB = (await getAccount(provider.connection, partyATokenB)).amount;

    console.log("  After:  A has", balAAfter.toString(), "of mintA,", balAAfterB.toString(), "of mintB");
    console.log("  After:  B has", balBAfterA.toString(), "of mintA,", balBAfterB.toString(), "of mintB");

    // A sent transferAmountA of mintA to B
    assert.equal(balAAfter, balABefore - transferAmountA, "A must lose transferAmountA of mintA");
    assert.equal(balBAfterA, balBBeforeA + transferAmountA, "B must gain transferAmountA of mintA");

    // B sent transferAmountB of mintB to A
    assert.equal(balBAfterB, balBBeforeB - transferAmountB, "B must lose transferAmountB of mintB");
    assert.equal(balAAfterB, balABeforeB + transferAmountB, "A must gain transferAmountB of mintB");

    // Verify ledgers back to Active
    const la = await program.account.userLedger.fetch(ledgerA);
    const lb = await program.account.userLedger.fetch(ledgerB);
    assert.deepEqual(la.status as any, { active: {} });
    assert.deepEqual(lb.status as any, { active: {} });

    console.log("  ✓ Two-way swap verified: A→B", transferAmountA.toString(), "mintA, B→A", transferAmountB.toString(), "mintB");
  });
});
