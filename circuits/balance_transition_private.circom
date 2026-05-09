// balance_transition_private.circom — Privacy-Preserving ZK Circuit (v3.2 Two-Way Swap)
//
// ALL balance/amount values are PRIVATE inputs.
// Only commitment_hash (split into two 128-bit limbs) is PUBLIC.
// SHA-256 of the 128-byte commitment preimage is computed inside the circuit.
//
// Public inputs:  commitment_hash_lo, commitment_hash_hi (two 128-bit limbs)
// Private inputs: old_balance_lo/hi, new_balance_lo/hi, swap_amount_lo/hi,
//                 transfer_lo/hi (preimage), transfer_b_lo/hi (preimage),
//                 nonce_bits[64], asset_a_mint_bytes[32], asset_b_mint_bytes[32],
//                 counterparty_bytes[32], expiry_bits[64]
//
// v3.2 Layout (128 bytes):
//   nonce(8B LE) + transfer_lo(4B LE) + transfer_hi(4B LE)
//   + transfer_b_lo(4B LE) + transfer_b_hi(4B LE)
//   + asset_a_mint(32B) + asset_b_mint(32B) + counterparty(32B)
//   + expiry(8B LE)

pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

template BalanceTransitionPrivate() {
    // === Private inputs: balance values ===
    signal input old_balance_lo;
    signal input old_balance_hi;
    signal input new_balance_lo;
    signal input new_balance_hi;

    // === Private input: this party's swap amount (for balance constraint) ===
    // transfer_lo/hi and transfer_b_lo/hi are preimage-only fields (canonical order: a, b).
    // swap_amount is the actual amount this party is transferring (used in balance check).
    signal input swap_amount_lo;
    signal input swap_amount_hi;

    // === Private inputs: commitment preimage fields ===
    // transfer_lo/hi = Party A's amount (preimage bytes 8-15, canonical)
    // transfer_b_lo/hi = Party B's amount (preimage bytes 16-23, canonical)
    signal input transfer_lo;
    signal input transfer_hi;

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
    // old_balance = new_balance + swap_amount (this party's actual transfer)
    signal old_total;
    old_total <== old_balance_lo + old_balance_hi * 4294967296;

    signal new_plus_swap;
    new_plus_swap <== (new_balance_lo + new_balance_hi * 4294967296)
                    + (swap_amount_lo + swap_amount_hi * 4294967296);

    old_total === new_plus_swap;

    // ── Range checks (32-bit) ───────────────────────────────────────
    component rc0 = Num2Bits(32);  rc0.in <== old_balance_lo;
    component rc1 = Num2Bits(32);  rc1.in <== old_balance_hi;
    component rc2 = Num2Bits(32);  rc2.in <== new_balance_lo;
    component rc3 = Num2Bits(32);  rc3.in <== new_balance_hi;
    component rc4 = Num2Bits(32);  rc4.in <== swap_amount_lo;
    component rc5 = Num2Bits(32);  rc5.in <== swap_amount_hi;
    component rc8 = Num2Bits(32);  rc8.in <== transfer_lo;
    component rc9 = Num2Bits(32);  rc9.in <== transfer_hi;

    // ── Byte decomposition for pubkey fields (96 bytes) ─────────────
    component b2b[96];
    for (var i = 0; i < 32; i++) { b2b[i] = Num2Bits(8);     b2b[i].in <== asset_a_mint_bytes[i]; }
    for (var i = 0; i < 32; i++) { b2b[32+i] = Num2Bits(8);   b2b[32+i].in <== asset_b_mint_bytes[i]; }
    for (var i = 0; i < 32; i++) { b2b[64+i] = Num2Bits(8);   b2b[64+i].in <== counterparty_bytes[i]; }

    // transfer_b_lo/hi: Party B's amount (preimage bytes 16-23, canonical)
    signal input transfer_b_lo;
    signal input transfer_b_hi;

    component rc6 = Num2Bits(32);  rc6.in <== transfer_b_lo;
    component rc7 = Num2Bits(32);  rc7.in <== transfer_b_hi;

    // ── Build 1024-bit preimage (128 bytes) ─────────────────────────
    // Canonical order: transfer_lo/hi = Party A's amount, transfer_b_lo/hi = Party B's amount
    // Both proofs use the SAME preimage to produce the SAME commitment hash.
    signal preimage[1024];

    // Nonce: 8 bytes LE → reverse bits per byte for big-endian bit stream
    for (var b = 0; b < 8; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[b*8+bit] <== nonce_bits[b*8+(7-bit)];
        }
    }
    // transfer_lo: 4 bytes LE (Party A's amount, preimage-only)
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[64+b*8+bit] <== rc8.out[b*8+(7-bit)];
        }
    }
    // transfer_hi: 4 bytes LE (Party A's amount, preimage-only)
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[96+b*8+bit] <== rc9.out[b*8+(7-bit)];
        }
    }
    // transfer_b_lo: 4 bytes LE
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[128+b*8+bit] <== rc6.out[b*8+(7-bit)];
        }
    }
    // transfer_b_hi: 4 bytes LE
    for (var b = 0; b < 4; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[160+b*8+bit] <== rc7.out[b*8+(7-bit)];
        }
    }
    // asset_a_mint: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[192+b*8+bit] <== b2b[b].out[7-bit];
        }
    }
    // asset_b_mint: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[448+b*8+bit] <== b2b[32+b].out[7-bit];
        }
    }
    // counterparty: 32 bytes
    for (var b = 0; b < 32; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[704+b*8+bit] <== b2b[64+b].out[7-bit];
        }
    }
    // expiry: 8 bytes LE
    for (var b = 0; b < 8; b++) {
        for (var bit = 0; bit < 8; bit++) {
            preimage[960+b*8+bit] <== expiry_bits[b*8+(7-bit)];
        }
    }

    // ── SHA-256 via circomlib (handles padding + chaining) ──────────
    component sha = Sha256(1024);
    for (var i = 0; i < 1024; i++) {
        sha.in[i] <== preimage[i];
    }

    // ── Convert 256-bit hash to two 128-bit field elements ──────────
    component b2n_lo = Bits2Num(128);
    component b2n_hi = Bits2Num(128);
    for (var i = 0; i < 128; i++) {
        b2n_lo.in[i] <== sha.out[255 - i];
        b2n_hi.in[i] <== sha.out[127 - i];
    }

    // Constrain: computed hash must match public input
    b2n_lo.out === commitment_hash_lo;
    b2n_hi.out === commitment_hash_hi;
}

component main { public [commitment_hash_lo, commitment_hash_hi] } = BalanceTransitionPrivate();
