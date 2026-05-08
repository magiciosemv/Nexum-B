/**
 * decode-account.ts — Decode on-chain account data from base64
 *
 * Usage:
 *   npx ts-node scripts/decode-account.ts <base64_data> <account_type>
 *
 * Account types: settlement, ledger, commit_slot, proof_data
 *
 * Example:
 *   curl ... | jq -r '.result.value.data[0]' | xargs -I{} npx ts-node scripts/decode-account.ts {} settlement
 */

import { Buffer } from 'buffer';

function decodeSettlement(buf: Buffer) {
  // disc(8) + party_a(32) + party_b(32) + asset_a(32) + asset_b(32)
  // + hash(32) + ver_a(8) + ver_b(8) + scheme(1) + settled_at(8) + bump(1) = 194B
  const disc = buf.slice(0, 8).toString('hex');
  const partyA = buf.slice(8, 40).toString('hex');
  const partyB = buf.slice(40, 72).toString('hex');
  const assetA = buf.slice(72, 104).toString('hex');
  const assetB = buf.slice(104, 136).toString('hex');
  const hash = buf.slice(136, 168).toString('hex');
  const verA = buf.readBigUInt64LE(168);
  const verB = buf.readBigUInt64LE(176);
  const scheme = buf[184];
  const settledAt = Number(buf.readBigInt64LE(185));
  const bump = buf[193];

  return {
    discriminator: disc,
    party_a: partyA,
    party_b: partyB,
    asset_a_mint: assetA,
    asset_b_mint: assetB,
    commitment_hash: hash,
    version_a: verA.toString(),
    version_b: verB.toString(),
    scheme: scheme === 0 ? 'SchemeA' : 'SchemeB',
    settled_at: new Date(settledAt * 1000).toISOString(),
    bump,
  };
}

function decodeLedger(buf: Buffer) {
  // disc(8) + owner(32) + mint(32) + balance_ct_lo(128) + balance_ct_hi(128)
  // + audit_ct_lo(128) + audit_ct_hi(128) + version(8) + status(1)
  // + last_settlement_id(32) + bump(1) + pending fields(112)
  const owner = buf.slice(8, 40).toString('hex');
  const mint = buf.slice(40, 72).toString('hex');
  const balLoFirst8 = buf.slice(72, 80).toString('hex');
  const balHiFirst8 = buf.slice(200, 208).toString('hex');
  const version = buf.readBigUInt64LE(528);
  const statusMap: Record<number, string> = {
    0: 'Active', 1: 'PendingInitiator', 2: 'BothPending',
    3: 'PendingCounterparty', 4: 'Emergency',
  };
  const status = statusMap[buf[536]] || `Unknown(${buf[536]})`;

  // Check if ciphertexts are non-zero
  const balLoNonZero = buf.slice(72, 200).some(b => b !== 0);
  const balHiNonZero = buf.slice(200, 328).some(b => b !== 0);

  return {
    owner, mint,
    balance_ct_lo: balLoNonZero ? `non-zero (${balLoFirst8}...)` : 'ALL ZEROS',
    balance_ct_hi: balHiNonZero ? `non-zero (${balHiFirst8}...)` : 'ALL ZEROS',
    version: version.toString(),
    status,
  };
}

// Main
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: npx ts-node decode-account.ts <base64_data> <settlement|ledger>');
  process.exit(1);
}

const buf = Buffer.from(args[0], 'base64');
console.log(`Raw size: ${buf.length} bytes`);
console.log(`Discriminator: ${buf.slice(0, 8).toString('hex')}`);
console.log('');

const type = args[1];
if (type === 'settlement') {
  console.log(JSON.stringify(decodeSettlement(buf), null, 2));
} else if (type === 'ledger') {
  console.log(JSON.stringify(decodeLedger(buf), null, 2));
} else {
  console.error(`Unknown type: ${type}. Use 'settlement' or 'ledger'.`);
}
