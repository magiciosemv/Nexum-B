#!/bin/bash
#
# devnet-unlock.sh — Cancel stuck dual-lock and reset both ledgers to Active
#
# Usage: bash scripts/devnet-unlock.sh
#
set -e

cd "$(dirname "$0")/.."

NODE_PATH=/home/magic/.nvm/versions/node/v20.20.0/lib/node_modules

echo "=== Checking ledger states ==="

# Check and display current status
$NODE_PATH/../../bin/node -e "
const { Connection, PublicKey } = require('@solana/web3.js');
const RPC = process.env.ANCHOR_PROVIDER_URL || 'https://devnet.helius-rpc.com';
const PROGRAM_ID = new PublicKey('BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P');
const MINT_A = new PublicKey('B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw');
const MINT_B = new PublicKey('Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k');
const PHANTOM = new PublicKey('CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue');
const CP = new PublicKey('A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR');
const conn = new Connection(RPC, 'confirmed');

async function main() {
  const [la] = PublicKey.findProgramAddressSync([Buffer.from('ledger'), PHANTOM.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID);
  const [lb] = PublicKey.findProgramAddressSync([Buffer.from('ledger'), CP.toBuffer(), MINT_B.toBuffer()], PROGRAM_ID);
  const laInfo = await conn.getAccountInfo(la);
  const lbInfo = await conn.getAccountInfo(lb);
  const names = ['Active','PendingInitiator','BothPending','PendingCounterparty','Emergency'];
  const sa = laInfo ? names[laInfo.data[592]] : 'NOT FOUND';
  const sb = lbInfo ? names[lbInfo.data[592]] : 'NOT FOUND';
  console.log('Ledger A:', la.toBase58(), sa);
  console.log('Ledger B:', lb.toBase58(), sb);

  if (laInfo && laInfo.data[592] !== 0) {
    const nonce = laInfo.data.readBigUInt64LE(730);
    const buf = Buffer.alloc(8); buf.writeBigUInt64LE(nonce);
    const [cs] = PublicKey.findProgramAddressSync([Buffer.from('cslot'), la.toBuffer(), buf], PROGRAM_ID);
    console.log('CommitSlot:', cs.toBase58());
    const csInfo = await conn.getAccountInfo(cs);
    if (csInfo) console.log('CS status:', csInfo.data[200], ['WaitAccept','BothLocked','Settled','Cancelled'][csInfo.data[200]] || '');
  }
}
main();
" 2>/dev/null

echo ""
echo "=== Cancelling via counterparty ==="

$NODE_PATH/../../bin/node -e "
const anchor = require('@coral-xyz/anchor');
const { Keypair, PublicKey, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');
const idlJson = require('./target/idl/nexum_pool.json');
const RPC = process.env.ANCHOR_PROVIDER_URL || 'https://devnet.helius-rpc.com';
const PROGRAM_ID = new PublicKey('BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P');
const MINT_A = new PublicKey('B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw');
const MINT_B = new PublicKey('Pxm31BeJ9rKsHVjrRedNZse4qTxKpFzG8v2NE87JP6k');
const PHANTOM = new PublicKey('CjnKTv7fxuEDU91n1nkcLe536kfbvV7o4cA9mJAA68Ue');
const CP = new PublicKey('A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR');

async function main() {
  const cpBytes = JSON.parse(fs.readFileSync('scripts/keys/counterparty.json','utf8'));
  const cpKp = Keypair.fromSecretKey(Uint8Array.from(cpBytes));
  const conn = new anchor.web3.Connection(RPC, 'confirmed');
  const wallet = new anchor.Wallet(cpKp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(idlJson, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('nexum_config')], PROGRAM_ID);
  const [la] = PublicKey.findProgramAddressSync([Buffer.from('ledger'), PHANTOM.toBuffer(), MINT_A.toBuffer()], PROGRAM_ID);
  const [lb] = PublicKey.findProgramAddressSync([Buffer.from('ledger'), CP.toBuffer(), MINT_B.toBuffer()], PROGRAM_ID);

  // Read ledger A status
  const laInfo = await conn.getAccountInfo(la);
  if (!laInfo || laInfo.data[592] === 0) {
    console.log('Ledger A already Active, nothing to do.');
    return;
  }

  const status = laInfo.data[592];
  const nonce = laInfo.data.readBigUInt64LE(730);
  const buf = Buffer.alloc(8); buf.writeBigUInt64LE(nonce);
  const [csPda] = PublicKey.findProgramAddressSync([Buffer.from('cslot'), la.toBuffer(), buf], PROGRAM_ID);

  if (status === 1) {
    // PendingInitiator — cancel_initiate
    console.log('Status: PendingInitiator — sending cancel_initiate...');
    const sig = await program.methods.cancelInitiate().accounts({
      s: cpKp.publicKey,  // won't work — need initiator
      ledgerA: la,
      commitSlot: csPda,
      config: configPda,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: 'confirmed' }).catch(() => null);

    if (!sig) {
      console.log('cancel_initiate failed (not initiator). Trying cancel_mutual...');
      const sig2 = await program.methods.cancelMutual().accounts({
        s: cpKp.publicKey,
        ledgerA: la, ledgerB: lb, commitSlot: csPda, config: configPda,
        systemProgram: SystemProgram.programId,
      }).rpc({ commitment: 'confirmed' });
      console.log('cancel_mutual TX:', sig2);
    } else {
      console.log('cancel_initiate TX:', sig);
    }
  } else {
    // BothPending or PendingCounterparty — cancel_mutual
    console.log('Status:', ['','PendingInitiator','BothPending','PendingCounterparty'][status], '— sending cancel_mutual...');
    const sig = await program.methods.cancelMutual().accounts({
      s: cpKp.publicKey,
      ledgerA: la, ledgerB: lb, commitSlot: csPda, config: configPda,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: 'confirmed' });
    console.log('cancel_mutual TX:', sig);
  }

  // Verify
  const la2 = await conn.getAccountInfo(la);
  const lb2 = await conn.getAccountInfo(lb);
  console.log('Ledger A:', la2.data[592] === 0 ? 'Active' : 'Still locked');
  console.log('Ledger B:', lb2.data[592] === 0 ? 'Active' : 'Still locked');
}
main().catch(e => console.log('Error:', e.message));
" 2>&1

echo ""
echo "=== Done ==="
