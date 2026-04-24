#!/bin/bash
#
# devnet-auto-accept.sh — Auto-detect initiate and accept as counterparty
#
# Run this AFTER starting initiate from the frontend.
# It polls Ledger A every 2 seconds, detects when it's locked,
# derives the CommitSlot, and sends accept_commit.
#
set -e

RPC="https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5"
export ANCHOR_PROVIDER_URL="$RPC"

LEDGER_A="5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK"
LEDGER_B="CjAUG1comMvGZj5rDjGaEVSuR2Q9SyRyrhWggmNkdtbD"
CONFIG="DxqwvoyHAzzkbbpFPekfY78vgfBe7nimKMZpNGzms8jC"
CP_KEY="scripts/keys/counterparty.json"
PROGRAM_ID="BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P"

echo "============================================"
echo "  Nexum — Auto-Accept (Counterparty)"
echo "============================================"
echo ""
echo "Polling Ledger A for PendingInitiator..."
echo "Press Ctrl+C to stop."
echo ""

# Wait for Ledger A to become PendingInitiator (status=1)
while true; do
  STATUS=$(node -e "
    const { Connection, PublicKey } = require('@solana/web3.js');
    async function main() {
      const conn = new Connection('$RPC', 'confirmed');
      const info = await conn.getAccountInfo(new PublicKey('$LEDGER_A'));
      process.stdout.write(info.data[592].toString());
    }
    main().catch(() => process.stdout.write('0'));
  " 2>/dev/null)

  if [ "$STATUS" = "1" ]; then
    echo "Ledger A is PendingInitiator! Accepting immediately..."
    break
  fi
  sleep 2
done

# Accept as counterparty
npx ts-node -e "
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as idlJson from './target/idl/nexum_pool.json';

async function main() {
  const connection = new anchor.web3.Connection('$RPC', 'confirmed');
  const programId = new PublicKey('$PROGRAM_ID');
  const ledgerA = new PublicKey('$LEDGER_A');
  const ledgerB = new PublicKey('$LEDGER_B');
  const configPda = new PublicKey('$CONFIG');

  // Read pending nonce from Ledger A
  const info = await connection.getAccountInfo(ledgerA);
  const nonce = info!.data.readBigUInt64LE(730);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  const [commitSlot] = PublicKey.findProgramAddressSync(
    [Buffer.from('cslot'), ledgerA.toBuffer(), nonceBuf], programId
  );
  console.log('CommitSlot:', commitSlot.toBase58());

  // Check remaining window
  const slotInfo = await connection.getAccountInfo(commitSlot);
  const expiry = Number(slotInfo!.data.readBigInt64LE(168));
  const currentSlot = await connection.getSlot();
  const chainTime = await connection.getBlockTime(currentSlot);
  console.log('Remaining window:', expiry - chainTime, 'seconds');

  // Load counterparty keypair
  const cpKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync('$CP_KEY', 'utf-8')))
  );
  const cpWallet = new anchor.Wallet(cpKeypair);
  const provider = new anchor.AnchorProvider(connection, cpWallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(idlJson as any, provider);

  // Send accept
  const sig = await program.methods.acceptCommit().accounts({
    s: cpKeypair.publicKey,
    ledgerA,
    ledgerB,
    commitSlot,
    config: configPda,
    systemProgram: SystemProgram.programId,
  }).rpc({ commitment: 'confirmed' });

  console.log('');
  console.log('=== ACCEPT SUCCESS ===');
  console.log('TX:', sig);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
"
