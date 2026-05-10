/**
 * inspect-accounts.ts — Fetch and decode on-chain accounts after browser testing
 *
 * Usage:
 *   npx ts-node scripts/inspect-accounts.ts <settlement_pda>
 *
 * Shows: SettlementRecord fields, derives + fetches both UserLedgers, checks ciphertexts.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { Buffer } from 'buffer';
import * as fs from 'fs';
import * as path from 'path';

const RPC = 'https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5';
const PROGRAM_ID = new PublicKey('6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r');

async function main() {
  const settlementAddr = process.argv[2];
  if (!settlementAddr) {
    console.error('Usage: npx ts-node scripts/inspect-accounts.ts <SETTLEMENT_PDA>');
    process.exit(1);
  }

  const connection = new Connection(RPC, 'confirmed');

  // Load IDL
  const idlPath = path.join(__dirname, '..', 'target', 'idl', 'nexum_pool.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

  // Use a dummy provider for account decoding
  const dummyKp = anchor.web3.Keypair.generate();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(dummyKp), { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);

  // 1. Fetch SettlementRecord
  console.log('=== SettlementRecord ===');
  console.log('Address:', settlementAddr);
  const settlement = await (program.account as any).settlementRecord.fetch(new PublicKey(settlementAddr));

  const partyA = settlement.partyA.toBase58();
  const partyB = settlement.partyB.toBase58();
  const mintA = settlement.assetAMint.toBase58();
  const mintB = settlement.assetBMint.toBase58();
  const hash = Buffer.from(settlement.commitmentHash).toString('hex');
  const scheme = settlement.scheme;
  const settledAt = Number(settlement.settledAt);

  console.log('Party A:', partyA);
  console.log('Party B:', partyB);
  console.log('Asset A:', mintA);
  console.log('Asset B:', mintB);
  console.log('Commitment hash:', hash);
  console.log('Scheme:', scheme);
  console.log('Settled at:', new Date(settledAt * 1000).toISOString());
  console.log('Version A:', settlement.versionA.toString());
  console.log('Version B:', settlement.versionB.toString());

  // 2. Derive and fetch UserLedger A
  console.log('\n=== UserLedger A (Party A\'s balance) ===');
  const [ledgerAAddr] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), new PublicKey(partyA).toBuffer(), new PublicKey(mintA).toBuffer()],
    PROGRAM_ID
  );
  console.log('Ledger A:', ledgerAAddr.toBase58());

  try {
    const ledgerA = await (program.account as any).userLedger.fetch(ledgerAAddr);
    const balLo = Buffer.from(ledgerA.balanceCtLo);
    const balHi = Buffer.from(ledgerA.balanceCtHi);
    const balLoZero = balLo.every(b => b === 0);
    const balHiZero = balHi.every(b => b === 0);
    console.log('Owner:', ledgerA.owner.toBase58());
    console.log('Mint:', ledgerA.mint.toBase58());
    console.log('Balance ct_lo (128B):', balLoZero ? 'ALL ZEROS' : `non-zero (${balLo.slice(0, 8).toString('hex')}...)`);
    console.log('Balance ct_hi (128B):', balHiZero ? 'ALL ZEROS' : `non-zero (${balHi.slice(0, 8).toString('hex')}...)`);
    console.log('Version:', ledgerA.version.toString());
    const statusMap: Record<string, string> = { active: 'Active', pendingInitiator: 'PendingInitiator', bothPending: 'BothPending', pendingCounterparty: 'PendingCounterparty' };
    const statusKey = Object.keys(ledgerA.status)[0] || 'unknown';
    console.log('Status:', statusMap[statusKey] || statusKey);
    console.log('⚠  Ciphertexts are ElGamal-encrypted. Need private key to decrypt.');
  } catch (e: any) {
    console.log('Failed to fetch:', e.message);
  }

  // 3. Derive and fetch UserLedger B
  console.log('\n=== UserLedger B (Party B\'s balance) ===');
  const [ledgerBAddr] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), new PublicKey(partyB).toBuffer(), new PublicKey(mintB).toBuffer()],
    PROGRAM_ID
  );
  console.log('Ledger B:', ledgerBAddr.toBase58());

  try {
    const ledgerB = await (program.account as any).userLedger.fetch(ledgerBAddr);
    const balLo = Buffer.from(ledgerB.balanceCtLo);
    const balHi = Buffer.from(ledgerB.balanceCtHi);
    const balLoZero = balLo.every(b => b === 0);
    const balHiZero = balHi.every(b => b === 0);
    console.log('Owner:', ledgerB.owner.toBase58());
    console.log('Mint:', ledgerB.mint.toBase58());
    console.log('Balance ct_lo (128B):', balLoZero ? 'ALL ZEROS' : `non-zero (${balLo.slice(0, 8).toString('hex')}...)`);
    console.log('Balance ct_hi (128B):', balHiZero ? 'ALL ZEROS' : `non-zero (${balHi.slice(0, 8).toString('hex')}...)`);
    console.log('Version:', ledgerB.version.toString());
    const statusKey = Object.keys(ledgerB.status)[0] || 'unknown';
    console.log('Status:', statusMap[statusKey] || statusKey);
  } catch (e: any) {
    console.log('Failed to fetch:', e.message);
  }

  // 4. Summary
  console.log('\n=== Summary ===');
  console.log('What you CAN see on-chain:');
  console.log('  - Party addresses (plaintext)');
  console.log('  - Asset mints (plaintext)');
  console.log('  - Commitment hash (SHA-256, irreversible)');
  console.log('  - Version numbers, timestamps');
  console.log('  - ElGamal ciphertext bytes (encrypted balances)');
  console.log('');
  console.log('What you CANNOT see on-chain:');
  console.log('  - Transfer amounts (only hash stored)');
  console.log('  - Account balances (only ElGamal ciphertexts)');
  console.log('  - To decrypt: use regulator page with ElGamal private key');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
