/**
 * Nexum Scheme B SDK — Main Entry
 *
 * Re-exports all public API from submodules.
 */

export {
  computeCommitment,
  verifyCommitment,
} from "./crypto/commitment";

export {
  generateKeypair,
  derivePublicKey,
  encrypt as elgamalEncrypt,
  decrypt as elgamalDecrypt,
  decryptU32 as elgamalDecryptU32,
  serializeCiphertext,
  deserializeCiphertext,
  clearBabyStepsCache,
} from "./crypto/elgamal";
export type { ElGamalKeypair, ElGamalCiphertext } from "./crypto/elgamal";

export {
  findCommitSlotPDA,
  findVersionSlotPDA,
  findLedgerPDA,
  findConfigPDA,
  findSettlementPDA,
  findProofDataPDA,
  splitAmount,
  bigIntToLeBytes,
  SlotStatus,
  LedgerStatus,
  VSlotStatus,
  SettlementScheme,
} from "./scheme_b/index";

export { initiateCommit } from "./scheme_b/initiate";
export { acceptCommit } from "./scheme_b/accept";
export { executeSettle, buildProofData, findAssociatedTokenAddress, findDelegatePDA } from "./scheme_b/execute";
export type { ZKProofData, ExecuteParams, ExecuteResult, BuildProofDataParams } from "./scheme_b/execute";
export { cancelInitiate, cancelMutual } from "./scheme_b/cancel";
export { VersionSlotManager } from "./scheme_b/version_slots";
export type { SlotInfo } from "./scheme_b/version_slots";
export { CommitSlotListener } from "./listeners/commit_listener";

export { ProverManager, createCircuitInputs, serializeProof } from "./workers/prover";
export type { CircuitInputs, Groth16Proof, ProverConfig } from "./workers/prover";
