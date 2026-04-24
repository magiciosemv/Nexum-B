#!/bin/bash
#
# setup-local-test.sh — One-click setup for frontend testing
#
# Prerequisites:
#   solana-test-validator --reset  (running)
#   anchor program deploy -p nexum_pool && anchor program deploy -p zk_verifier
#
# This script:
#   1. Creates ProtocolConfig on-chain
#   2. Generates test token mints
#   3. Creates UserLedger for the default wallet
#   4. Prints test data for the frontend form
#
set -e

ANCHOR_PROVIDER_URL="http://127.0.0.1:8899"
ANCHOR_WALLET="$HOME/.config/solana/id.json"
export ANCHOR_PROVIDER_URL ANCHOR_WALLET

echo "============================================"
echo "  Nexum Protocol — Local Test Setup"
echo "============================================"
echo ""

# Check validator is running
if ! curl -s http://127.0.0.1:8899 -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q "ok"; then
  echo "ERROR: Local validator not running. Start with: solana-test-validator --reset"
  exit 1
fi

echo "[1/4] Checking programs are deployed..."
nexum_id=$(anchor keys list 2>/dev/null | grep "nexum_pool" | awk '{print $2}' || echo "BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P")
if ! solana program show "$nexum_id" --url "$ANCHOR_PROVIDER_URL" >/dev/null 2>&1; then
  echo "ERROR: nexum_pool not deployed. Run: anchor program deploy -p nexum_pool"
  exit 1
fi
echo "  ✓ nexum_pool deployed: $nexum_id"

echo ""
echo "[2/4] Initializing ProtocolConfig..."
# Use ts-node to call the SDK
npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');
const IDL = require('./target/idl/nexum_pool.json');

async function main() {
  const connection = new anchor.AnchorProvider(
    new anchor.web3.Connection('http://127.0.0.1:8899'),
    { publicKey: PublicKey.unique(), signTransaction: async () => {} },
    { commitment: 'confirmed' }
  );
  const wallet = anchor.AnchorProvider.env().wallet;
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('nexum_config')],
    program.programId
  );

  try {
    const sig = await program.methods
      .initializePool()
      .accounts({ authority: provider.wallet.publicKey, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('ProtocolConfig created: ' + sig.slice(0, 16) + '...');
  } catch (e) {
    if (e.message?.includes('already in use')) {
      console.log('ProtocolConfig already exists, skipping.');
    } else {
      throw e;
    }
  }
}
main().catch(console.error);
" 2>&1

echo ""
echo "[3/4] Creating test mints and UserLedger..."
# Generate two random pubkeys as test mints (local validator doesn't need real SPL tokens)
MINT_A=$(solana-keygen new --no-bip39-passphrase --force -o /tmp/nexum_mint_a.json 2>/dev/null | grep "pubkey" | awk '{print $2}')
MINT_B=$(solana-keygen new --no-bip39-passphrase --force -o /tmp/nexum_mint_b.json 2>/dev/null | grep "pubkey" | awk '{print $2}')

echo "  Mint A: $MINT_A"
echo "  Mint B: $MINT_B"

# Create UserLedger for the default wallet
npx ts-node -e "
const anchor = require('@coral-xyz/anchor');
const { PublicKey, SystemProgram } = require('@solana/web3.js');
const IDL = require('./target/idl/nexum_pool.json');

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('nexum_config')], program.programId);

  const mintA = new PublicKey('$MINT_A');
  const mintB = new PublicKey('$MINT_B');

  const [ledgerA] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), provider.wallet.publicKey.toBuffer(), mintA.toBuffer()],
    program.programId
  );
  const [ledgerB] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), provider.wallet.publicKey.toBuffer(), mintB.toBuffer()],
    program.programId
  );

  // Create ledger for Mint A
  try {
    await program.methods.createUserLedger()
      .accounts({ owner: provider.wallet.publicKey, ledger: ledgerA, mint: mintA, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('Ledger A created: ' + ledgerA.toBase58().slice(0, 16) + '...');
  } catch (e) {
    if (e.message?.includes('already in use')) console.log('Ledger A already exists.');
    else throw e;
  }

  // Create ledger for Mint B
  try {
    await program.methods.createUserLedger()
      .accounts({ owner: provider.wallet.publicKey, ledger: ledgerB, mint: mintB, config: configPda, systemProgram: SystemProgram.programId })
      .rpc();
    console.log('Ledger B created: ' + ledgerB.toBase58().slice(0, 16) + '...');
  } catch (e) {
    if (e.message?.includes('already in use')) console.log('Ledger B already exists.');
    else throw e;
  }
}
main().catch(console.error);
" 2>&1

# Generate a counterparty keypair for testing
COUNTERPARTY=$(solana-keygen new --no-bip39-passphrase --force -o /tmp/nexum_cp.json 2>/dev/null | grep "pubkey" | awk '{print $2}')

echo ""
echo "============================================"
echo "  SETUP COMPLETE"
echo "============================================"
echo ""
echo "Frontend test data (copy into the form):"
echo ""
echo "  Counterparty:  $COUNTERPARTY"
echo "  Asset A Mint:  $MINT_A"
echo "  Asset B Mint:  $MINT_B"
echo "  Amount:        1000"
echo ""
echo "Wallet info:"
echo "  Your address:  $(solana address --url http://127.0.0.1:8899)"
echo "  Network:       localhost:8899"
echo ""
echo "Now open http://localhost:5173/ and:"
echo "  1. Click '启动结算引擎'"
echo "  2. Click '机构交易员'"
echo "  3. Connect Phantom (localhost network, import ~/.config/solana/id.json)"
echo "  4. Fill the form with the data above"
echo "  5. Click '第一步：发起承诺'"
echo ""
