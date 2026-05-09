#!/usr/bin/env node
// generate_vk.ts — Convert verification_key.json to Rust byte constants
// for groth16-solana crate (expects BIG-ENDIAN format per crate docs)

const fs = require("fs");
const path = require("path");

const vkPath = path.resolve(__dirname, "../circuits/build_private/verification_key.json");
const vk = JSON.parse(fs.readFileSync(vkPath, "utf-8"));

// Convert a decimal string to 32-byte big-endian array
function fieldToBe32(decStr: string): number[] {
  let val = BigInt(decStr);
  const p = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
  if (val < 0n) val = val + p;
  const bytes: number[] = [];
  for (let i = 0; i < 32; i++) {
    bytes.unshift(Number(val & 0xFFn));
    val >>= 8n;
  }
  return bytes;
}

// G1 point: [x_str, y_str, "1"] → 64 bytes BE
function g1ToBytes(arr: string[]): number[] {
  return [...fieldToBe32(arr[0]), ...fieldToBe32(arr[1])];
}

// G2 point: [[x_c0, x_c1], [y_c0, y_c1], [z_c0, z_c1]] → 128 bytes BE
// EIP-197/Solana BN254: c1(imaginary) before c0(real) for each Fp² coordinate
function g2ToBytes(arr: string[][]): number[] {
  return [
    ...fieldToBe32(arr[0][1]),  // x_c1 first
    ...fieldToBe32(arr[0][0]),  // x_c0 second
    ...fieldToBe32(arr[1][1]),  // y_c1 first
    ...fieldToBe32(arr[1][0]),  // y_c0 second
  ];
}

function formatBytes(bytes: number[]): string {
  return bytes.map(b => `${b}`).join(", ");
}

const vkAlphaG1 = g1ToBytes(vk.vk_alpha_1);
const vkBetaG2 = g2ToBytes(vk.vk_beta_2);
const vkGammaG2 = g2ToBytes(vk.vk_gamma_2);
const vkDeltaG2 = g2ToBytes(vk.vk_delta_2);
const vkIc = vk.IC.map((ic: string[]) => g1ToBytes(ic));

const nrPubinputs = vk.nPublic;

// Generate IC as a separate static
let icCode = `// IC points (constant terms + public input coefficients)\n`;
icCode += `// Auto-generated from circuits/build/verification_key.json\n`;
icCode += `// Regenerate with: npx ts-node scripts/generate_vk.ts\n\n`;
icCode += `pub const IC: [[u8; 64]; ${vkIc.length}] = [\n`;
for (let i = 0; i < vkIc.length; i++) {
  icCode += `    [${formatBytes(vkIc[i])}],\n`;
}
icCode += `];\n\n`;

// Note: groth16-solana has a typo in field name: vk_gamme_g2 (not gamma)
let code = `// Auto-generated from circuits/build/verification_key.json
// DO NOT EDIT — regenerate with: npx ts-node scripts/generate_vk.ts

use groth16_solana::groth16::Groth16Verifyingkey;

pub const NR_PUBINPUTS: usize = ${nrPubinputs};

pub const VERIFYING_KEY: Groth16Verifyingkey<'static> = Groth16Verifyingkey {
    nr_pubinputs: ${nrPubinputs},
    vk_alpha_g1: [${formatBytes(vkAlphaG1)}],
    vk_beta_g2: [${formatBytes(vkBetaG2)}],
    vk_gamme_g2: [${formatBytes(vkGammaG2)}],
    vk_delta_g2: [${formatBytes(vkDeltaG2)}],
    vk_ic: &IC,
};
`;

// Write output
const outputDir = path.resolve(__dirname, "../programs/zk_verifier/src");
const outputPath = path.join(outputDir, "vk.rs");

fs.writeFileSync(outputPath, icCode + code);
console.log(`Generated ${outputPath}`);
console.log(`  nPublic: ${nrPubinputs}`);
console.log(`  IC entries: ${vkIc.length}`);
console.log(`  Format: BIG-ENDIAN (as required by groth16-solana)`);
