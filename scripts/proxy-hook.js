/**
 * proxy-hook.js — Preload script for WSL2 HTTP proxy
 *
 * Patches http/https module BEFORE node-fetch caches the reference.
 * Usage: node -r ./scripts/proxy-hook.js scripts/auto-accept.js
 *
 * Reads HTTPS_PROXY or HTTP_PROXY from environment or .env file.
 */

const fs = require('fs');
const path = require('path');

// Load .env if not already set
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || (() => {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.startsWith('#') || !line.includes('=')) continue;
      const [k, ...v] = line.split('=');
      const val = v.join('=').trim();
      if (k.trim() === 'HTTPS_PROXY' || k.trim() === 'HTTP_PROXY') return val;
    }
  }
  return null;
})();

if (!PROXY) {
  // No proxy needed
  return;
}

const http = require('http');
const https = require('https');
const { URL } = require('url');

const proxyUrl = new URL(PROXY);

// Store originals
const origHttpRequest = http.request;
const origHttpsRequest = https.request;

// Create proxied https.request that tunnels through HTTP proxy
function proxiedHttpsRequest(opts, cb) {
  // Normalize opts
  if (typeof opts === 'string') opts = new URL(opts);
  if (opts instanceof URL) {
    opts = {
      protocol: opts.protocol,
      hostname: opts.hostname,
      port: opts.port,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {},
    };
  }

  // Tunnel through proxy
  if (opts.hostname && opts.hostname !== proxyUrl.hostname) {
    const tunnelOpts = {
      hostname: proxyUrl.hostname,
      port: proxyUrl.port,
      path: (opts.protocol || 'https:') + '//' + opts.hostname +
        (opts.port ? ':' + opts.port : '') + (opts.path || '/'),
      method: opts.method || 'GET',
      headers: {
        ...(opts.headers || {}),
        host: opts.hostname + (opts.port ? ':' + opts.port : ''),
      },
    };
    // Merge other opts (timeout, etc) but override connection params
    return origHttpRequest({ ...opts, ...tunnelOpts }, cb);
  }

  return origHttpsRequest(opts, cb);
}

// Replace on the module's exports object — node-fetch does `(https).request`
// so it reads the property each time from the cached module object
Object.defineProperty(https, 'request', {
  value: proxiedHttpsRequest,
  writable: true,
  configurable: true,
  enumerable: true,
});

// Also patch the module cache so future require('https') gets it
const resolved = require.resolve('https');
if (require.cache[resolved]) {
  require.cache[resolved].exports.request = proxiedHttpsRequest;
}

console.log('[proxy-hook] Using proxy:', PROXY);
