#!/bin/bash
#
# devnet-cancel-and-reset.sh — Cancel stuck CommitSlot, then recreate ProtocolConfig
#
# Prerequisites:
#   - Phantom wallet connected on devnet with keypair exported
#   - Or: ANCHOR_WALLET pointing to the keypair
#
# This script:
#   1. Sends cancel_initiate to release Ledger A from PendingInitiator
#   2. Closes old ProtocolConfig and recreates it with correct clock_tolerance=5
#
set -e

RPC="https://devnet.helius-rpc.com/?api-key=506b80b3-cae1-4a10-bd37-b048aa5dd8a5"
ANCHOR_PROVIDER_URL="$RPC"
ANCHOR_WALLET="$HOME/.config/solana/id.json"
export ANCHOR_PROVIDER_URL ANCHOR_WALLET

PROGRAM_ID="BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P"
LEDGER_A="5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK"
COMMIT_SLOT="Ak3y1RqkKhkr7fbgWcpwoLbUCQ6cnS1hTWRZzqWji4Yq"
CONFIG_PDA="DxqwvoyHAzzkbbpFPekfY78vgfBe7nimKMZpNGzms8jC"
NONCE="1777028688438"

echo "============================================"
echo "  Nexum Protocol — Devnet Cancel & Reset"
echo "============================================"

# Step 1: Check if cancel is possible
echo ""
echo "[1/3] Checking if cancel window is open..."
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
async function main() {
  const connection = new Connection('$RPC', 'confirmed');
  const slot = await connection.getSlot();
  const time = await connection.getBlockTime(slot);
  const cancelAt = 1777030013;
  if (time < cancelAt) {
    const wait = cancelAt - time;
    console.log('NOT YET. Wait', Math.ceil(wait / 60), 'minutes', '(' + wait + 's)');
    process.exit(1);
  }
  console.log('Cancel window is OPEN. Chain time:', time, '> Cancel at:', cancelAt);
}
main().catch(e => { console.error(e.message); process.exit(1); });
" 2>&1

if [ $? -ne 0 ]; then
  echo "Cancel window not yet open. Wait and try again."
  exit 1
fi

# Step 2: Send cancel_initiate
echo ""
echo "[2/3] Sending cancel_initiate..."
npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');
const idl = require('./target/idl/nexum_pool.json');

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  console.log('Wallet:', provider.wallet.publicKey.toBase58());

  const tx = await program.methods
    .cancelInitiate()
    .accounts({
      s: provider.wallet.publicKey,
      ledgerA: new PublicKey('$LEDGER_A'),
      commitSlot: new PublicKey('$COMMIT_SLOT'),
      config: new PublicKey('$CONFIG_PDA'),
    })
    .rpc({ commitment: 'confirmed' });

  console.log('cancel_initiate TX:', tx);
  console.log('Ledger A should now be Active.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
" 2>&1

echo ""
echo "[3/3] Verifying Ledger A status..."
node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
async function main() {
  const connection = new Connection('$RPC', 'confirmed');
  const info = await connection.getAccountInfo(new PublicKey('$LEDGER_A'));
  const status = info.data[592];
  console.log('Ledger A status:', status, '(0=Active)');
  if (status !== 0) {
    console.error('WARNING: Ledger A is still not Active!');
    process.exit(1);
  }
  console.log('SUCCESS: Ledger A is now Active.');
}
main().catch(console.error);
" 2>&1

echo ""
echo "============================================"
echo "  Cancel complete. Ledger A is Active again."
echo ""
echo "  NOTE: ProtocolConfig.clock_tolerance is 1280 (should be 5)."
echo "  To fix this, close and reinitialize ProtocolConfig."
echo "  Run: bash scripts/devnet-reset-config.sh"
echo "============================================"
