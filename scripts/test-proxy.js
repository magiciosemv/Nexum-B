// test-proxy.js — verify require.cache proxy patch works in .js file
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

const PROXY = process.env.HTTPS_PROXY;
console.log('Proxy:', PROXY);

const http = require('http');
const https = require('https');
const { URL } = require('url');
const pu = new URL(PROXY);
const origHttpsReq = https.request;

const proxiedReq = function (opts, cb) {
  if (typeof opts === 'string') opts = new URL(opts);
  if (opts instanceof URL) opts = { protocol: opts.protocol, hostname: opts.hostname, port: opts.port, path: opts.pathname + opts.search, method: 'GET', headers: {} };
  if (opts.hostname && opts.hostname !== pu.hostname) {
    console.log('[proxy] tunneling to', opts.hostname);
    return http.request({
      hostname: pu.hostname, port: pu.port,
      path: (opts.protocol || 'https:') + '//' + opts.hostname + (opts.port ? ':' + opts.port : '') + (opts.path || '/'),
      method: opts.method || 'GET',
      headers: { ...opts.headers, host: opts.hostname + (opts.port ? ':' + opts.port : '') },
    }, cb);
  }
  return origHttpsReq(opts, cb);
};

const mod = require.cache[require.resolve('https')];
console.log('https module cached:', !!mod);
if (mod) mod.exports.request = proxiedReq;
https.request = proxiedReq;

console.log('Loading web3...');
const { Connection, PublicKey } = require('@solana/web3.js');
console.log('web3 loaded');

(async () => {
  const conn = new Connection(process.env.ANCHOR_PROVIDER_URL, 'confirmed');
  const info = await conn.getAccountInfo(new PublicKey('5eCAa4iBa91VzX6AvueUw8MsYXuZgXwEpNMbJSZ7bqQK'));
  console.log('Status:', info.data[592]);
  console.log('SUCCESS');
})().catch(e => console.error('ERR:', e.message));
