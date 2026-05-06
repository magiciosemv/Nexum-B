/**
 * cancel-stuck.js — Cancel a stuck ledger (cancel_mutual or cancel_initiate)
 *
 * Usage: node scripts/cancel-stuck.js
 */
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').filter(l => l && !l.startsWith('#')).forEach(l => {
    const [k, ...v] = l.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

// Proxy patch
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (PROXY) {
  const http = require('http'), https = require('https'), { URL } = require('url');
  const pu = new URL(PROXY), origReq = https.request;
  https.request = function (o, cb) {
    if (typeof o === 'string') o = new URL(o);
    if (o instanceof URL) o = { protocol: o.protocol, hostname: o.hostname, port: o.port, path: o.pathname + o.search, method: 'GET', headers: {} };
    if (o.hostname && o.hostname !== pu.hostname) {
      return http.request({ hostname: pu.hostname, port: pu.port, path: (o.protocol || 'https:') + '//' + o.hostname + (o.port ? ':' + o.port : '') + (o.path || '/'), method: o.method || 'GET', headers: { ...o.headers, host: o.hostname + (o.port ? ':' + o.port : '') } }, cb);
    }
    return origReq(o, cb);
  };
  console.log('Using proxy:', PROXY);
}

const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, SystemProgram, Keypair } = require('@solana/web3.js');

const RPC = process.env.ANCHOR_PROVIDER_URL;
const PROGRAM_ID = new PublicKey('BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P');
const LEDGER_A = new PublicKey('5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK');
const COUNTERPARTY = new PublicKey('A7XDkScUEunJ59cZeBJGA1WivnSc2QDp3jB5ugEf5vgR');
const MINT_B = new PublicKey('B31JoQhMFF2TrSJMdiSqCRGMj4jR8TD8sNzNGn4T4qQw');
const IDL_PATH = fs.existsSync(path.join(__dirname, '..', 'target', 'idl', 'nexum_pool.json'))
  ? path.join(__dirname, '..', 'target', 'idl', 'nexum_pool.json')
  : path.join(__dirname, '..', 'app', 'src', 'idl', 'nexum_pool.json');
const IDL = JSON.parse(fs.readFileSync(IDL_PATH, 'utf-8'));

// Status: 0=Active, 1=PendingInitiator, 2=PendingCounterparty, 3=BothPending
const STATUS_NAMES = ['Active', 'PendingInitiator', 'PendingCounterparty', 'BothPending'];

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const info = await conn.getAccountInfo(LEDGER_A);
  const status = info.data[592];
  console.log('Ledger A status:', status, '(' + (STATUS_NAMES[status] || 'Unknown') + ')');

  if (status === 0) { console.log('Already Active, nothing to do.'); return; }

  // Load default wallet (ledger owner = initiator)
  const kp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/solana/id.json'), 'utf-8')))
  );
  console.log('Wallet:', kp.publicKey.toBase58());

  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new anchor.Program(IDL, provider);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('nexum_config')], PROGRAM_ID);

  // Read nonce
  const nonce = info.data.readBigUInt64LE(730);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  const [commitSlot] = PublicKey.findProgramAddressSync(
    [Buffer.from('cslot'), LEDGER_A.toBuffer(), nonceBuf], PROGRAM_ID
  );
  console.log('CommitSlot:', commitSlot.toBase58());

  if (status === 1) {
    // PendingInitiator → cancel_initiate
    console.log('Sending cancel_initiate...');
    const sig = await program.methods.cancelInitiate().accounts({
      s: kp.publicKey, ledgerA: LEDGER_A, commitSlot,
      config: configPda, systemProgram: SystemProgram.programId,
    }).rpc({ commitment: 'confirmed' });
    console.log('cancel_initiate OK:', sig);
  } else {
    // BothPending/PendingCounterparty → cancel_mutual
    const [ledgerB] = PublicKey.findProgramAddressSync(
      [Buffer.from('ledger'), COUNTERPARTY.toBuffer(), MINT_B.toBuffer()], PROGRAM_ID
    );
    console.log('Ledger B:', ledgerB.toBase58());
    console.log('Sending cancel_mutual...');
    const sig = await program.methods.cancelMutual().accounts({
      caller: kp.publicKey, ledgerA: LEDGER_A, ledgerB, commitSlot,
      config: configPda,
    }).rpc({ commitment: 'confirmed' });
    console.log('cancel_mutual OK:', sig);
  }

  // Verify
  const after = await conn.getAccountInfo(LEDGER_A);
  console.log('Ledger A status now:', after.data[592], '(' + (STATUS_NAMES[after.data[592]] || 'Unknown') + ')');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
