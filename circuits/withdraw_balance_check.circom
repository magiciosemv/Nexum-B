// withdraw_balance_check.circom — Withdraw Balance Sufficiency ZK Circuit (v2)
//
// Proves: old_balance = new_balance + withdrawal_amount
// with 32-bit range checks on all values (prevents underflow).
//
// Hashes the FULL 128-byte ElGamal ciphertexts (not plaintext balances),
// matching the on-chain contract which computes:
//   hash_lo_128 = upper 128 bits of SHA256(balance_ct_lo)
//   hash_hi_128 = upper 128 bits of SHA256(balance_ct_hi)
//
// Public inputs:  old_ct_hash_lo, old_ct_hash_hi (upper 128 bits of each SHA-256)
// Private inputs: old_ct_lo_bytes[128], old_ct_hi_bytes[128] (full ciphertexts),
//                 old_balance_lo/hi, new_balance_lo/hi, amount_lo/hi
//
// The balance values are NOT part of the hash — they are purely used for the
// transition constraint. The ciphertexts bind the proof to the on-chain state.

pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

template WithdrawBalanceCheck() {
    // === Private inputs: full 128-byte ElGamal ciphertexts ===
    signal input old_ct_lo_bytes[128];
    signal input old_ct_hi_bytes[128];

    // === Private inputs: balance values (for transition constraint) ===
    signal input old_balance_lo;
    signal input old_balance_hi;
    signal input new_balance_lo;
    signal input new_balance_hi;
    signal input amount_lo;
    signal input amount_hi;

    // === Public inputs: hash binding (upper 128 bits of SHA-256 of each ciphertext) ===
    signal input old_ct_hash_lo;
    signal input old_ct_hash_hi;

    // ── Balance transition constraint ────────────────────────────────
    // old_balance = new_balance + withdrawal_amount
    signal old_total;
    old_total <== old_balance_lo + old_balance_hi * 4294967296;

    signal new_plus_amount;
    new_plus_amount <== (new_balance_lo + new_balance_hi * 4294967296)
                      + (amount_lo + amount_hi * 4294967296);

    old_total === new_plus_amount;

    // ── Range checks (32-bit) ───────────────────────────────────────
    // Ensures all values are valid u32, preventing underflow via field wrap
    component rc0 = Num2Bits(32);  rc0.in <== old_balance_lo;
    component rc1 = Num2Bits(32);  rc1.in <== old_balance_hi;
    component rc2 = Num2Bits(32);  rc2.in <== new_balance_lo;
    component rc3 = Num2Bits(32);  rc3.in <== new_balance_hi;
    component rc4 = Num2Bits(32);  rc4.in <== amount_lo;
    component rc5 = Num2Bits(32);  rc5.in <== amount_hi;

    // ── Byte decomposition for old_ct_lo (128 bytes) ────────────────
    component b2b_lo[128];
    for (var i = 0; i < 128; i++) {
        b2b_lo[i] = Num2Bits(8);
        b2b_lo[i].in <== old_ct_lo_bytes[i];
    }

    // ── Build 1024-bit input for SHA-256(ct_lo) ─────────────────────
    // Big-endian bit order within each byte (MSB first)
    signal ct_lo_bits[1024];
    for (var b = 0; b < 128; b++) {
        for (var bit = 0; bit < 8; bit++) {
            ct_lo_bits[b*8+bit] <== b2b_lo[b].out[7-bit];
        }
    }

    // ── SHA-256 of ct_lo (circomlib handles padding internally) ─────
    component sha_lo = Sha256(1024);
    for (var i = 0; i < 1024; i++) {
        sha_lo.in[i] <== ct_lo_bits[i];
    }

    // ── Extract upper 128 bits of SHA256(ct_lo) ─────────────────────
    // Matches contract: hash_lo_128 = u128::from_be_bytes(hash[0..16])
    // sha_lo.out is MSB-first (bit 255 = most significant)
    component b2n_lo = Bits2Num(128);
    for (var i = 0; i < 128; i++) {
        b2n_lo.in[i] <== sha_lo.out[255 - i];
    }
    b2n_lo.out === old_ct_hash_lo;

    // ── Byte decomposition for old_ct_hi (128 bytes) ────────────────
    component b2b_hi[128];
    for (var i = 0; i < 128; i++) {
        b2b_hi[i] = Num2Bits(8);
        b2b_hi[i].in <== old_ct_hi_bytes[i];
    }

    // ── Build 1024-bit input for SHA-256(ct_hi) ─────────────────────
    signal ct_hi_bits[1024];
    for (var b = 0; b < 128; b++) {
        for (var bit = 0; bit < 8; bit++) {
            ct_hi_bits[b*8+bit] <== b2b_hi[b].out[7-bit];
        }
    }

    // ── SHA-256 of ct_hi ────────────────────────────────────────────
    component sha_hi = Sha256(1024);
    for (var i = 0; i < 1024; i++) {
        sha_hi.in[i] <== ct_hi_bits[i];
    }

    // ── Extract upper 128 bits of SHA256(ct_hi) ─────────────────────
    component b2n_hi = Bits2Num(128);
    for (var i = 0; i < 128; i++) {
        b2n_hi.in[i] <== sha_hi.out[255 - i];
    }
    b2n_hi.out === old_ct_hash_hi;
}

component main { public [old_ct_hash_lo, old_ct_hash_hi] } = WithdrawBalanceCheck();
