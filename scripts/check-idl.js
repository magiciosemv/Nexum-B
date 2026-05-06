/**
 * check-idl.js — Fetch on-chain IDL directly via RPC
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').filter(l => l && !l.startsWith('#')).forEach(l => {
    const [k, ...v] = l.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (PROXY) {
  const http = require('http'), https = require('https'), { URL } = require('url');
  const pu = new URL(PROXY), origReq = https.request;
  const mod = require.cache[require.resolve('https')];
  const proxiedReq = function (o, cb) {
    if (typeof o === 'string') o = new URL(o);
    if (o instanceof URL) o = { protocol: o.protocol, hostname: o.hostname, port: o.port, path: o.pathname + o.search, method: 'GET', headers: {} };
    if (o.hostname && o.hostname !== pu.hostname) {
      return http.request({ hostname: pu.hostname, port: pu.port, path: (o.protocol || 'https:') + '//' + o.hostname + (o.port ? ':' + o.port : '') + (o.path || '/'), method: o.method || 'GET', headers: { ...o.headers, host: o.hostname + (o.port ? ':' + o.port : '') } }, cb);
    }
    return origReq(o, cb);
  };
  if (mod) mod.exports.request = proxiedReq;
  https.request = proxiedReq;
}

const { Connection, PublicKey } = require('@solana/web3.js');

const PROGRAM_ID = new PublicKey('BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P');
const RPC = process.env.ANCHOR_PROVIDER_URL;

async function main() {
  const conn = new Connection(RPC, 'confirmed');

  // Anchor IDL account PDA: seeds = ["anchor:idl"], program = PROGRAM_ID
  const [idlPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("anchor:idl")],
    PROGRAM_ID
  );
  console.log('IDL PDA:', idlPda.toBase58());

  const idlAccount = await conn.getAccountInfo(idlPda);
  if (!idlAccount) {
    console.log('IDL account NOT FOUND at this address. Trying alternative...');
    // Try with programId as second seed
    const [idlPda2] = PublicKey.findProgramAddressSync(
      [Buffer.from("anchor:idl"), PROGRAM_ID.toBuffer()],
      PROGRAM_ID
    );
    console.log('Alternative PDA:', idlPda2.toBase58());
    const idlAccount2 = await conn.getAccountInfo(idlPda2);
    if (!idlAccount2) {
      console.log('Alternative also not found.');
      // Just dump the discriminator and first bytes for debugging
      return;
    }
  }

  if (!idlAccount) return;

  const data = idlAccount.data;
  console.log('IDL account data length:', data.length);
  console.log('First 20 bytes:', Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // Anchor IDL format: discriminator(8) + length(4) + idl_json
  // But newer Anchor might use different format
  try {
    // Try format: disc(8) + len(4) + JSON
    const jsonLen = data.readUInt32LE(8);
    console.log('Reported JSON length:', jsonLen);
    if (jsonLen > 0 && jsonLen < data.length) {
      const jsonStr = data.slice(12, 12 + jsonLen).toString('utf-8');
      const idl = JSON.parse(jsonStr);
      console.log('\n=== ON-CHAIN IDL SettleAtomicParams ===');
      const params = idl.types?.find(t => t.name === 'SettleAtomicParams');
      if (params) {
        params.type?.fields?.forEach(f => console.log(`  ${f.name}: ${JSON.stringify(f.type)}`));
      } else {
        console.log('Not found. Available types:', idl.types?.map(t => t.name).join(', '));
      }
    }
  } catch (e) {
    console.log('Parse attempt 1 failed:', e.message);
    // Try: no discriminator, raw JSON
    try {
      const jsonStr = data.toString('utf-8');
      const idl = JSON.parse(jsonStr);
      console.log('\nRaw JSON IDL found!');
      const params = idl.types?.find(t => t.name === 'SettleAtomicParams');
      if (params) {
        params.type?.fields?.forEach(f => console.log(`  ${f.name}: ${JSON.stringify(f.type)}`));
      }
    } catch (e2) {
      console.log('Parse attempt 2 failed:', e2.message);
    }
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
