// balance_transition_private.circom — Privacy-Preserving ZK Circuit
//
// ALL balance/amount values are PRIVATE inputs.
// Only commitment_hash (split into two 128-bit limbs) is PUBLIC.
// SHA-256 of the 120-byte commitment preimage is computed inside the circuit.
//
// Public inputs:  commitment_hash_lo, commitment_hash_hi (two 128-bit limbs)
// Private inputs: old_balance_lo/hi, new_balance_lo/hi, transfer_lo/hi,
//                 nonce_bits[64], asset_a_mint_bytes[32], asset_b_mint_bytes[32],
//                 counterparty_bytes[32], expiry_bits[64]

pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

template BalanceTransitionPrivate() {
    // === Private inputs: balance values ===
    signal input old_balance_lo;
    signal input old_balance_hi;
    signal input transfer_lo;
    signal input transfer_hi;
    signal input new_balance_lo;
    signal input new_balance_hi;

    // === Private inputs: commitment preimage ===
    signal input nonce_bits[64];
    signal input asset_a_mint_bytes[32];
    signal input asset_b_mint_bytes[32];
    signal input counterparty_bytes[32];
    signal input expiry_bits[64];

    // === Public inputs: commitment hash as two 128-bit field elements ===
    signal input commitment_hash_lo;
    signal input commitment_hash_hi;

    // ── Balance transition constraint ────────────────────────────────
    signal old_total;
    old_total <== old_balance_lo + old_balance_hi * 4294967296;

    signal new_plus_transfer;
    new_plus_transfer <== (new_balance_lo + new_balance_hi * 4294967296)
                        + (transfer_lo + transfer_hi * 4294967296);

    old_total === new_plus_transfer;

    // ── Range checks (32-bit) ───────────────────────────────────────
    component rc0 = Num2Bits(32);  rc0.in <== old_balance_lo;
    component rc1 = Num2Bits(32);  rc1.in <== old_balance_hi;
    component rc2 = Num2Bits(32);  rc2.in <== new_balance_lo;
    component rc3 = Num2Bits(32);  rc3.in <== new_balance_hi;
    component rc4 = Num2Bits(32);  rc4.in <== transfer_lo;
    component rc5 = Num2Bits(32);  rc5.in <== transfer_hi;

    // ── Byte decomposition for pubkey fields (96 bytes) ─────────────
    component b2b[96];
    for (var i = 0; i < 32; i++) { b2b[i] = Num2Bits(8);     b2b[i].in <== asset_a_mint_bytes[i]; }
    for (var i = 0; i < 32; i++) { b2b[32+i] = Num2Bits(8);   b2b[32+i].in <== asset_b_mint_bytes[i]; }
    for (var i = 0; i < 32; i++) { b2b[64+i] = Num2Bits(8);   b2b[64+i].in <== counterparty_bytes[i]; }

    // ── Build 960-bit preimage in big-endian bit order ──────────────
    // Layout (120 bytes): nonce(8B LE) + transfer_lo(4B LE) + transfer_hi(4B LE)
    //         + asset_a_mint(32B) + asset_b_mint(32B) + counterparty(32B)
    //         + expiry(8B LE)
    signal preimage[960];

    // Nonce: 8 bytes LE → reverse bits per byte for big-endian bit stream
    for (var b = 0; b < 8; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[b*8+bit] <== nonce_bits[b*8+(7-bit)];
        }
    }
    // transfer_lo: 4 bytes LE
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[64+b*8+bit] <== rc4.out[b*8+(7-bit)];
        }
    }
    // transfer_hi: 4 bytes LE
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[96+b*8+bit] <== rc5.out[b*8+(7-bit)];
        }
    }
    // asset_a_mint: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[128+b*8+bit] <== b2b[b].out[7-bit];
        }
    }
    // asset_b_mint: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[384+b*8+bit] <== b2b[32+b].out[7-bit];
        }
    }
    // counterparty: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[640+b*8+bit] <== b2b[64+b].out[7-bit];
        }
    }
    // expiry: 8 bytes LE
    for (var b = 0; b < 8; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[896+b*8+bit] <== expiry_bits[b*8+(7-bit)];
        }
    }

    // ── SHA-256 via circomlib (handles padding + chaining) ──────────
    component sha = Sha256(960);
    for (var i = 0; i < 960; i++) {
        sha.in[i] <== preimage[i];
    }

    // ── Convert 256-bit hash to two 128-bit field elements ──────────
    // circomlib Sha256 output: sha.out[w*32+k] = bit (31-k) of hash word w (MSB-first per word)
    // Standard hash: hash_lo = bytes 16..31 as 128-bit BE, hash_hi = bytes 0..15 as 128-bit BE
    // Reverse entire 128-bit segment for Bits2Num (LSB-first input)
    component b2n_lo = Bits2Num(128);
    component b2n_hi = Bits2Num(128);
    for (var i = 0; i < 128; i++) {
        b2n_lo.in[i] <== sha.out[255 - i];  // lower 128 bits → LSB-first
        b2n_hi.in[i] <== sha.out[127 - i];  // upper 128 bits → LSB-first
    }

    // Constrain: computed hash must match public input
    b2n_lo.out === commitment_hash_lo;
    b2n_hi.out === commitment_hash_hi;
}

component main { public [commitment_hash_lo, commitment_hash_hi] } = BalanceTransitionPrivate();
