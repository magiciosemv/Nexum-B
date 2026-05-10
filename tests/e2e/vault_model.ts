/**
 * vault_model.ts — E2E Test: Shared Treasury Vault Settlement
 *
 * Tests the full vault-model flow with shared Treasury Vaults:
 *   initialize_vault → deposit → initiate_commit → accept_commit → execute_settle_b → withdraw
 *
 * Architecture:
 *   - One shared Treasury Vault per mint: seeds = ["nexum_vault", mint]
 *   - A deposits mintA to TreasuryVaultA, B deposits mintB to TreasuryVaultB
 *   - Settlement updates encrypted ElGamal balances only (no SPL transfers)
 *   - A withdraws mintB from TreasuryVaultB, B withdraws mintA from TreasuryVaultA
 *   - Real swap: A ends up with mintB, B ends up with mintA
 *
 * Uses real Groth16 proofs, ElGamal ciphertexts.
 * Requires: local validator running (solana-test-validator)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  createMint, mintTo, createAssociatedTokenAccount, getAccount,
  TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { assert } from "chai";
import { computeCommitment } from "../../sdk/src/crypto/commitment";
import {
  findCommitSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  findTreasuryVaultPDA,
  splitAmount,
} from "../../sdk/src/scheme_b/index";
import { ProverManager, createPrivateCircuitInputs } from "../../sdk/src/workers/prover";
import {
  generateKeypair,
  encrypt as elgamalEncrypt,
  serializeCiphertext,
} from "../../sdk/src/crypto/elgamal";
import path from "path";

const ZK_VERIFIER_ID = new PublicKey("HBjtDNTL5cj6oc97Gno14x8GjL6LNsZ26iRK4v52KjDA");

describe("Vault Model — Settlement with Shared Treasury Vaults", () => {
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

  // SPL Token mints
  let mintA: PublicKey;
  let mintB: PublicKey;

  // Shared Treasury Vault PDAs (one per mint, globally)
  let treasuryVaultA: PublicKey; // shared treasury for mintA
  let treasuryVaultB: PublicKey; // shared treasury for mintB

  // User ATAs
  let initiatorAtaA: PublicKey;    // initiator's ATA for mintA
  let initiatorAtaB: PublicKey;    // initiator's ATA for mintB (receives after swap)
  let counterpartyAtaA: PublicKey; // counterparty's ATA for mintA (receives after swap)
  let counterpartyAtaB: PublicKey; // counterparty's ATA for mintB

  const transferAmountA = 1_000_000n; // A sends 1M of mintA to B
  const transferAmountB = 500_000n;   // B sends 500K of mintB to A

  // Prover setup
  let prover: ProverManager;
  let keypairA: ReturnType<typeof generateKeypair>;
  let keypairB: ReturnType<typeof generateKeypair>;

  before(async () => {
    // Airdrop SOL
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(initiator.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(counterparty.publicKey, 10 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(provider.wallet.publicKey, 10 * LAMPORTS_PER_SOL)
    );

    // Create SPL token mints (decimals=0)
    mintA = await createMint(provider.connection, initiator, initiator.publicKey, null, 0);
    mintB = await createMint(provider.connection, counterparty, counterparty.publicKey, null, 0);
    console.log("  Mint A:", mintA.toBase58());
    console.log("  Mint B:", mintB.toBase58());

    // Create ATAs and mint tokens
    initiatorAtaA = await createAssociatedTokenAccount(
      provider.connection, initiator, mintA, initiator.publicKey,
    );
    await mintTo(provider.connection, initiator, mintA, initiatorAtaA, initiator, 10_000_000n);

    counterpartyAtaB = await createAssociatedTokenAccount(
      provider.connection, counterparty, mintB, counterparty.publicKey,
    );
    await mintTo(provider.connection, counterparty, mintB, counterpartyAtaB, counterparty, 10_000_000n);

    // Create cross-mint ATAs for receiving swapped tokens
    counterpartyAtaA = await createAssociatedTokenAccount(
      provider.connection, counterparty, mintA, counterparty.publicKey,
    );
    initiatorAtaB = await createAssociatedTokenAccount(
      provider.connection, initiator, mintB, initiator.publicKey,
    );

    console.log("  Initiator mintA balance: 10,000,000");
    console.log("  Counterparty mintB balance: 10,000,000");

    // Derive PDAs
    [ledgerA] = findLedgerPDA(initiator.publicKey, mintA, program.programId);
    [ledgerB] = findLedgerPDA(counterparty.publicKey, mintB, program.programId);
    [configPda] = findConfigPDA(program.programId);
    [treasuryVaultA] = findTreasuryVaultPDA(mintA, program.programId);
    [treasuryVaultB] = findTreasuryVaultPDA(mintB, program.programId);

    // Initialize prover
    prover = new ProverManager({
      wasmPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_js/balance_transition_private.wasm"),
      zkeyPath: path.join(projectRoot, "circuits/build_private/balance_transition_private_final.zkey"),
    });
    await prover.init();

    keypairA = generateKeypair();
    keypairB = generateKeypair();
  });

  it("Initializes protocol config (or skips if exists)", async () => {
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

  it("Creates shared Treasury Vaults for both mints", async () => {
    // Create shared Treasury Vault for mintA
    await program.methods
      .initializeVault()
      .accounts({
        payer: provider.wallet.publicKey,
        vault: treasuryVaultA,
        mint: mintA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Create shared Treasury Vault for mintB
    await program.methods
      .initializeVault()
      .accounts({
        payer: provider.wallet.publicKey,
        vault: treasuryVaultB,
        mint: mintB,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Verify vaults exist and are empty
    const vaultAInfo = await getAccount(provider.connection, treasuryVaultA);
    assert.equal(vaultAInfo.amount.toString(), "0", "Treasury Vault A starts empty");
    console.log("  Treasury Vault A created:", treasuryVaultA.toBase58());

    const vaultBInfo = await getAccount(provider.connection, treasuryVaultB);
    assert.equal(vaultBInfo.amount.toString(), "0", "Treasury Vault B starts empty");
    console.log("  Treasury Vault B created:", treasuryVaultB.toBase58());
  });

  it("Deposits tokens into shared Treasury Vaults", async () => {
    // Initiator deposits transferAmountA of mintA into shared Treasury Vault A
    await program.methods
      .deposit(new anchor.BN(transferAmountA.toString()))
      .accounts({
        owner: initiator.publicKey,
        userToken: initiatorAtaA,
        vault: treasuryVaultA,
        mint: mintA,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([initiator])
      .rpc();

    // Counterparty deposits transferAmountB of mintB into shared Treasury Vault B
    await program.methods
      .deposit(new anchor.BN(transferAmountB.toString()))
      .accounts({
        owner: counterparty.publicKey,
        userToken: counterpartyAtaB,
        vault: treasuryVaultB,
        mint: mintB,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([counterparty])
      .rpc();

    // Verify vault balances
    const vaultABalance = (await getAccount(provider.connection, treasuryVaultA)).amount;
    assert.equal(vaultABalance.toString(), transferAmountA.toString(), "Treasury Vault A has deposited amount");

    const vaultBBalance = (await getAccount(provider.connection, treasuryVaultB)).amount;
    assert.equal(vaultBBalance.toString(), transferAmountB.toString(), "Treasury Vault B has deposited amount");

    // Verify user balances decreased
    const userABalance = (await getAccount(provider.connection, initiatorAtaA)).amount;
    assert.equal(userABalance.toString(), (10_000_000n - transferAmountA).toString(), "Initiator mintA balance decreased");

    const userBBalance = (await getAccount(provider.connection, counterpartyAtaB)).amount;
    assert.equal(userBBalance.toString(), (10_000_000n - transferAmountB).toString(), "Counterparty mintB balance decreased");

    console.log("  Treasury Vault A balance:", vaultABalance.toString());
    console.log("  Treasury Vault B balance:", vaultBBalance.toString());
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

    console.log("  Ledger A:", ledgerA.toBase58());
    console.log("  Ledger B:", ledgerB.toBase58());
  });

  it("Step 1: Initiator commits (two-way swap)", async () => {
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
    console.log("  CommitSlot created:", commitSlotPda.toBase58());
    console.log("  Commitment hash:", Buffer.from(commitmentHash).toString("hex"));
  });

  it("Step 2: Counterparty accepts (symmetric dual-lock)", async () => {
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
    console.log("  Both ledgers locked. Execute window started.");
  });

  it("Step 3: Execute settlement (ZK proofs + encrypted balance update)", async () => {
    const { lo: a_lo, hi: a_hi } = splitAmount(transferAmountA);
    const { lo: b_lo, hi: b_hi } = splitAmount(transferAmountB);

    // Fetch CommitSlot for canonical preimage
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

    // Generate ZK proofs
    console.log("  Generating ZK proof A...");
    const proofA = await prover.generateProof(createPrivateCircuitInputs({
      old_balance_lo: Number(a_lo), old_balance_hi: Number(a_hi),
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: Number(a_lo), swap_amount_hi: Number(a_hi),
      transfer_lo: Number(a_lo), transfer_hi: Number(a_hi),
      transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
      ...preimage,
    }));
    console.log("  Proof A generated:", proofA.proof_a.length, "bytes");

    // Local verification
    const vkey = JSON.parse(require("fs").readFileSync(
      path.join(projectRoot, "circuits/build_private/verification_key.json"), "utf-8"
    ));
    const localVerifyA = await prover.verifyProof(proofA.proof_a, proofA.public_signals, vkey);
    assert.isTrue(localVerifyA, "Proof A must verify locally");

    console.log("  Generating ZK proof B...");
    const proofB = await prover.generateProof(createPrivateCircuitInputs({
      old_balance_lo: Number(b_lo), old_balance_hi: Number(b_hi),
      new_balance_lo: 0, new_balance_hi: 0,
      swap_amount_lo: Number(b_lo), swap_amount_hi: Number(b_hi),
      transfer_lo: Number(a_lo), transfer_hi: Number(a_hi),
      transfer_b_lo: Number(b_lo), transfer_b_hi: Number(b_hi),
      ...preimage,
    }));
    console.log("  Proof B generated:", proofB.proof_a.length, "bytes");

    // ElGamal encrypt
    const ct_a_lo = elgamalEncrypt(0n, keypairA.publicKey);
    const ct_a_hi = elgamalEncrypt(0n, keypairA.publicKey);
    const audit_a_lo = elgamalEncrypt(BigInt(a_lo), keypairA.publicKey);
    const audit_a_hi = elgamalEncrypt(BigInt(a_hi), keypairA.publicKey);
    const ct_b_lo = elgamalEncrypt(BigInt(b_lo), keypairB.publicKey);
    const ct_b_hi = elgamalEncrypt(BigInt(b_hi), keypairB.publicKey);
    const audit_b_lo = elgamalEncrypt(0n, keypairB.publicKey);
    const audit_b_hi = elgamalEncrypt(0n, keypairB.publicKey);
    console.log("  ElGamal ciphertexts generated");

    // Build proof data chunks
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

    // Create + write ProofData
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
    console.log("  Proof data written (4 chunks)");

    // Execute settlement (no SPL token accounts — settlement only updates encrypted balances)
    const settlementNonce = BigInt(Date.now());
    const [settlementPda] = findSettlementPDA(commitSlotPda, settlementNonce, program.programId);

    await program.methods
      .executeSettleB({
        nonce: new anchor.BN(nonce.toString()),
        commitmentHashLo: new anchor.BN(proofA.public_signals[0]),
        commitmentHashHi: new anchor.BN(proofA.public_signals[1]),
        settlementNonce: new anchor.BN(settlementNonce.toString()),
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

    // Verify settlement record
    const record = await program.account.settlementRecord.fetch(settlementPda);
    assert.deepEqual(record.scheme, { schemeB: {} });
    console.log("  Settlement record created:", settlementPda.toBase58());

    // Verify ledgers back to Active
    const la = await program.account.userLedger.fetch(ledgerA);
    const lb = await program.account.userLedger.fetch(ledgerB);
    assert.deepEqual(la.status as any, { active: {} });
    assert.deepEqual(lb.status as any, { active: {} });
    console.log("  Both ledgers returned to Active");

    // Treasury vault balances should be UNCHANGED (no SPL transfers in settlement)
    const vaultABalance = (await getAccount(provider.connection, treasuryVaultA)).amount;
    const vaultBBalance = (await getAccount(provider.connection, treasuryVaultB)).amount;
    assert.equal(vaultABalance.toString(), transferAmountA.toString(), "Treasury Vault A balance unchanged after settlement");
    assert.equal(vaultBBalance.toString(), transferAmountB.toString(), "Treasury Vault B balance unchanged after settlement");
    console.log("  Treasury vault balances unchanged (settlement only updates encrypted balances)");
  });

  it("Withdraws swapped tokens from shared Treasury Vaults", async () => {
    // Initiator withdraws mintB from Treasury Vault B (the tokens B deposited)
    await program.methods
      .withdraw(new anchor.BN(transferAmountB.toString()))
      .accounts({
        owner: initiator.publicKey,
        vault: treasuryVaultB,
        userToken: initiatorAtaB,
        mint: mintB,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([initiator])
      .rpc();

    // Counterparty withdraws mintA from Treasury Vault A (the tokens A deposited)
    await program.methods
      .withdraw(new anchor.BN(transferAmountA.toString()))
      .accounts({
        owner: counterparty.publicKey,
        vault: treasuryVaultA,
        userToken: counterpartyAtaA,
        mint: mintA,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([counterparty])
      .rpc();

    // Verify swapped balances
    // After swap: A has 10M - 1M mintA + 500K mintB
    // After swap: B has 10M - 500K mintB + 1M mintA
    const initiatorMintABalance = (await getAccount(provider.connection, initiatorAtaA)).amount;
    const initiatorMintBBalance = (await getAccount(provider.connection, initiatorAtaB)).amount;
    const counterpartyMintABalance = (await getAccount(provider.connection, counterpartyAtaA)).amount;
    const counterpartyMintBBalance = (await getAccount(provider.connection, counterpartyAtaB)).amount;

    assert.equal(initiatorMintABalance.toString(), "9000000", "A: 10M - 1M mintA");
    assert.equal(initiatorMintBBalance.toString(), "500000", "A: received 500K mintB from swap");
    assert.equal(counterpartyMintABalance.toString(), "1000000", "B: received 1M mintA from swap");
    assert.equal(counterpartyMintBBalance.toString(), "9500000", "B: 10M - 500K mintB");

    // Verify treasury vaults empty
    const vaultABalance = (await getAccount(provider.connection, treasuryVaultA)).amount;
    const vaultBBalance = (await getAccount(provider.connection, treasuryVaultB)).amount;
    assert.equal(vaultABalance.toString(), "0", "Treasury Vault A empty after withdraw");
    assert.equal(vaultBBalance.toString(), "0", "Treasury Vault B empty after withdraw");

    console.log("  Full shared treasury vault swap complete: deposit -> settle -> withdraw");
    console.log("  Initiator final balances: mintA=" + initiatorMintABalance.toString() + " mintB=" + initiatorMintBBalance.toString());
    console.log("  Counterparty final balances: mintA=" + counterpartyMintABalance.toString() + " mintB=" + counterpartyMintBBalance.toString());
  });
});
