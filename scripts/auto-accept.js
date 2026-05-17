/**
 * auto-accept.js — Accept a pending initiate_commit as counterparty
 *
 * Reads proxy from .env, patches https.request for WSL2 proxy support,
 * polls Ledger A for PendingInitiator, then sends accept_commit.
 *
 * Usage: node scripts/auto-accept.js
 */

// ── 1. Load .env ──────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .forEach(l => {
      const [k, ...v] = l.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
}

// ── 2. Patch https for WSL2 proxy (MUST be before any require of node-fetch/web3/anchor) ─
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
console.log('[debug] PROXY=', PROXY);
if (PROXY) {
  const http = require('http');
  const https = require('https');
  const { URL } = require('url');
  const pu = new URL(PROXY);
  const origHttpsReq = https.request;

  const proxiedReq = function (opts, cb) {
    if (typeof opts === 'string') opts = new URL(opts);
    if (opts instanceof URL) opts = { protocol: opts.protocol, hostname: opts.hostname, port: opts.port, path: opts.pathname + opts.search, method: 'GET', headers: {} };
    if (opts.hostname && opts.hostname !== pu.hostname) {
      return http.request({
        hostname: pu.hostname, port: pu.port,
        path: (opts.protocol || 'https:') + '//' + opts.hostname + (opts.port ? ':' + opts.port : '') + (opts.path || '/'),
        method: opts.method || 'GET',
        headers: { ...opts.headers, host: opts.hostname + (opts.port ? ':' + opts.port : '') },
      }, cb);
    }
    return origHttpsReq(opts, cb);
  };

  // Patch the module cache so node-fetch gets our proxied version
  const httpsModule = require.cache[require.resolve('https')];
  if (httpsModule) httpsModule.exports.request = proxiedReq;
  https.request = proxiedReq;

  console.log('Using proxy:', PROXY);
} else {
  console.log('No proxy configured');
}

// ── 3. Import modules AFTER proxy patch ────────────────────────────────
const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, SystemProgram, Keypair } = require('@solana/web3.js');

// ── 4. Config ──────────────────────────────────────────────────────────
const RPC = process.env.ANCHOR_PROVIDER_URL || 'REDACTED_HELIUS_URL';
const PROGRAM_ID = new PublicKey('6n1NbHJuEkyaJZtnHqrExBk2BD6HyujvntbTE5ZSeX9r');
const LEDGER_A = new PublicKey(process.argv[2] || (() => { console.error('Usage: node auto-accept.js <LEDGER_A_ADDRESS>'); process.exit(1); })());
const CONFIG = new PublicKey('CNM1YpLiFdeKj2MC3F6q18fUhpCkADXScGciz9C7Lmm5');
const CP_KEY_PATH = path.join(__dirname, 'keys', 'counterparty.json');
const IDL_PATH = path.join(__dirname, '..', 'target', 'idl', 'nexum_pool.json');

// ── 5. Main ────────────────────────────────────────────────────────────
async function main() {
  const connection = new Connection(RPC, 'confirmed');
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

  // Load counterparty keypair
  const cpKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(CP_KEY_PATH, 'utf-8')))
  );
  console.log('Counterparty keypair:', cpKeypair.publicKey.toBase58());

  // Poll Ledger A for PendingInitiator
  console.log('\nPolling Ledger A for PendingInitiator...');
  let ledgerInfo;
  while (true) {
    ledgerInfo = await connection.getAccountInfo(LEDGER_A);
    if (ledgerInfo && ledgerInfo.data[592] === 1) {
      console.log('Ledger A is PendingInitiator!');
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // Check if initiate has already expired → cancel it and re-poll
  const checkNonce = ledgerInfo.data.readBigUInt64LE(730);
  const checkNb = Buffer.alloc(8);
  checkNb.writeBigUInt64LE(checkNonce);
  const [checkCs] = PublicKey.findProgramAddressSync(
    [Buffer.from('cslot'), LEDGER_A.toBuffer(), checkNb], PROGRAM_ID
  );
  const checkSlot = await connection.getAccountInfo(checkCs);
  if (checkSlot) {
    const exp = Number(checkSlot.data.readBigInt64LE(168));
    const slot = await connection.getSlot();
    const now = await connection.getBlockTime(slot);
    if (now > exp + 5) {
      console.log('Initiate expired, cancelling...');
      // Use default wallet (Ledger A owner = initiator)
      const defaultKpPath = path.join(
        process.env.HOME || '/home/magic',
        '.config/solana/id.json'
      );
      if (fs.existsSync(defaultKpPath)) {
        const defKp = Keypair.fromSecretKey(
          new Uint8Array(JSON.parse(fs.readFileSync(defaultKpPath, 'utf-8')))
        );
        const defWallet = new anchor.Wallet(defKp);
        const defProvider = new anchor.AnchorProvider(connection, defWallet, { commitment: 'confirmed' });
        const defProgram = new anchor.Program(idl, defProvider);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('nexum_config')], PROGRAM_ID);
        await defProgram.methods.cancelInitiate().accounts({
          s: defKp.publicKey, ledgerA: LEDGER_A, commitSlot: checkCs,
          config: configPda, systemProgram: SystemProgram.programId,
        }).rpc({ commitment: 'confirmed' });
        console.log('Expired initiate cancelled. Waiting for new initiate...');
        // Re-poll
        while (true) {
          ledgerInfo = await connection.getAccountInfo(LEDGER_A);
          if (ledgerInfo && ledgerInfo.data[592] === 1) {
            console.log('Ledger A is PendingInitiator again!');
            break;
          }
          await new Promise(r => setTimeout(r, 2000));
        }
      } else {
        console.error('Default wallet not found. Cancel the expired initiate manually from frontend.');
        process.exit(1);
      }
    }
  }

  // Read pending nonce from Ledger A (offset 730)
  ledgerInfo = await connection.getAccountInfo(LEDGER_A);
  const nonce = ledgerInfo.data.readBigUInt64LE(730);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  console.log('Pending nonce:', nonce.toString());

  // Derive CommitSlot PDA
  const [commitSlot] = PublicKey.findProgramAddressSync(
    [Buffer.from('cslot'), LEDGER_A.toBuffer(), nonceBuf], PROGRAM_ID
  );
  console.log('CommitSlot:', commitSlot.toBase58());

  // Read CommitSlot on-chain data
  const slotInfo = await connection.getAccountInfo(commitSlot);
  if (!slotInfo) { console.error('CommitSlot not found'); process.exit(1); }
  const sd = slotInfo.data;

  // CommitSlot (202B): disc(8)+initiator(32)+counterparty(32)+mint_a(32)+mint_b(32)
  //   +hash(32)+expiry_init(8)+exec_expiry(8)+nonce(8)+locked_at(8)+status(1)+bump(1)
  const onChainInitiator = new PublicKey(sd.slice(8, 40));
  const onChainCounterparty = new PublicKey(sd.slice(40, 72));
  const onChainMintA = new PublicKey(sd.slice(72, 104));
  const onChainMintB = new PublicKey(sd.slice(104, 136));
  const expiryInit = Number(sd.readBigInt64LE(168));

  console.log('Initiator:', onChainInitiator.toBase58());
  console.log('Counterparty:', onChainCounterparty.toBase58());
  console.log('Mint A:', onChainMintA.toBase58());
  console.log('Mint B:', onChainMintB.toBase58());

  // Check remaining window
  const currentSlot = await connection.getSlot();
  const chainTime = await connection.getBlockTime(currentSlot);
  console.log('Remaining window:', expiryInit - chainTime, 'seconds');

  // Verify keypair matches on-chain counterparty
  if (cpKeypair.publicKey.toBase58() !== onChainCounterparty.toBase58()) {
    console.error('\nERROR: Keypair does not match CommitSlot counterparty!');
    console.error('  Keypair:', cpKeypair.publicKey.toBase58());
    console.error('  Expected:', onChainCounterparty.toBase58());
    console.error('  Fix: the frontend Counterparty field must be filled with the correct pubkey');
    process.exit(1);
  }

  // Derive Ledger B dynamically from on-chain counterparty + mintB
  const [ledgerB] = PublicKey.findProgramAddressSync(
    [Buffer.from('ledger'), onChainCounterparty.toBuffer(), onChainMintB.toBuffer()],
    PROGRAM_ID
  );
  console.log('Ledger B (derived):', ledgerB.toBase58());

  // Build Anchor provider + program
  const wallet = new anchor.Wallet(cpKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(idl, provider);

  // Auto-create Ledger B if it doesn't exist
  const ledgerBInfo = await connection.getAccountInfo(ledgerB);
  if (!ledgerBInfo) {
    console.log('Ledger B does not exist, creating...');
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('nexum_config')], PROGRAM_ID
    );
    const createSig = await program.methods.createUserLedger().accounts({
      owner: cpKeypair.publicKey,
      ledger: ledgerB,
      mint: onChainMintB,
      config: configPda,
      systemProgram: SystemProgram.programId,
    }).rpc({ commitment: 'confirmed' });
    console.log('Ledger B created! TX:', createSig);
  }

  // Send accept_commit
  console.log('\nSending accept_commit...');
  const sig = await program.methods.acceptCommit().accounts({
    s: cpKeypair.publicKey,
    ledgerA: LEDGER_A,
    ledgerB,
    commitSlot,
    config: CONFIG,
    systemProgram: SystemProgram.programId,
  }).rpc({ commitment: 'confirmed' });

  console.log('\n=== ACCEPT SUCCESS ===');
  console.log('TX:', sig);
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
