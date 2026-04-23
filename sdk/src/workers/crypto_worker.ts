/**
 * crypto_worker.ts — Web Worker wrapper for ZK proof generation
 *
 * Usage in browser:
 *   const worker = new Worker(new URL('./crypto_worker.ts', import.meta.url), { type: 'module' });
 *   worker.postMessage({ type: 'init', wasmPath, zkeyPath });
 *   worker.postMessage({ type: 'prove', inputs: {...} });
 *   worker.onmessage = (e) => { ... };
 *
 * Messages:
 *   → { type: 'init', wasmPath: string, zkeyPath: string }
 *   → { type: 'prove', inputs: CircuitInputs }
 *   ← { type: 'ready' }
 *   ← { type: 'proof', proof: Groth16Proof }
 *   ← { type: 'error', error: string }
 */

import { ProverManager, CircuitInputs, Groth16Proof } from "./prover";

let prover: ProverManager | null = null;

export interface WorkerMessage {
  type: "init" | "prove";
  wasmPath?: string;
  zkeyPath?: string;
  inputs?: CircuitInputs;
}

export interface WorkerResponse {
  type: "ready" | "proof" | "error";
  proof?: Groth16Proof;
  error?: string;
}

// ── Main thread helper ───────────────────────────────────────────────

/**
 * CryptoWorkerClient — manages a Web Worker for proof generation.
 *
 * Usage:
 *   const client = new CryptoWorkerClient('/circuits/balance_transition_js/balance_transition.wasm', '/circuits/balance_transition_final.zkey');
 *   await client.init();
 *   const proof = await client.generateProof(inputs);
 */
export class CryptoWorkerClient {
  private worker: Worker | null = null;
  private pendingResolve: ((proof: Groth16Proof) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private wasmPath: string;
  private zkeyPath: string;

  constructor(wasmPath: string, zkeyPath: string) {
    this.wasmPath = wasmPath;
    this.zkeyPath = zkeyPath;
  }

  /**
   * Initialize the worker. Must be called before generateProof.
   * Falls back to main-thread ProverManager if Web Workers are not available.
   */
  async init(): Promise<void> {
    try {
      // Try to create a Web Worker
      // In a bundler context, use the URL constructor for the worker script
      this.worker = new Worker(
        new URL("./crypto_worker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleMessage(e.data);
      };

      this.worker.onerror = (e: ErrorEvent) => {
        if (this.pendingReject) {
          this.pendingReject(new Error(e.message));
          this.pendingResolve = null;
          this.pendingReject = null;
        }
      };

      // Send init message
      this.worker.postMessage({
        type: "init",
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
      } as WorkerMessage);
    } catch {
      // Web Workers not available (e.g., Node.js environment)
      // Fall back to main-thread ProverManager
      this.worker = null;
    }
  }

  /**
   * Generate a ZK proof. Uses Web Worker if available, otherwise runs on main thread.
   */
  async generateProof(inputs: CircuitInputs): Promise<Groth16Proof> {
    if (this.worker) {
      // Use Web Worker
      return new Promise<Groth16Proof>((resolve, reject) => {
        this.pendingResolve = resolve;
        this.pendingReject = reject;
        this.worker!.postMessage({ type: "prove", inputs } as WorkerMessage);
      });
    } else {
      // Fallback: run on main thread
      const prover = new ProverManager({
        wasmPath: this.wasmPath,
        zkeyPath: this.zkeyPath,
      });
      await prover.init();
      return prover.generateProof(inputs);
    }
  }

  /**
   * Terminate the worker. Call when done to free resources.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private handleMessage(response: WorkerResponse): void {
    if (response.type === "proof" && this.pendingResolve) {
      this.pendingResolve(response.proof!);
      this.pendingResolve = null;
      this.pendingReject = null;
    } else if (response.type === "error" && this.pendingReject) {
      this.pendingReject(new Error(response.error!));
      this.pendingResolve = null;
      this.pendingReject = null;
    }
  }
}

// ── Web Worker entry point ───────────────────────────────────────────
// This code runs inside the Web Worker when loaded as a module worker.

if (typeof self !== "undefined" && typeof (self as any).onmessage !== "undefined") {
  // We're inside a Web Worker
  (self as any).onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    if (msg.type === "init") {
      try {
        prover = new ProverManager({
          wasmPath: msg.wasmPath!,
          zkeyPath: msg.zkeyPath!,
        });
        await prover.init();
        (self as any).postMessage({ type: "ready" } as WorkerResponse);
      } catch (err: any) {
        (self as any).postMessage({
          type: "error",
          error: err.message || "Init failed",
        } as WorkerResponse);
      }
    }

    if (msg.type === "prove") {
      if (!prover) {
        (self as any).postMessage({
          type: "error",
          error: "Prover not initialized. Send 'init' message first.",
        } as WorkerResponse);
        return;
      }

      try {
        const result = await prover.generateProof(msg.inputs!);
        (self as any).postMessage({
          type: "proof",
          proof: result,
        } as WorkerResponse);
      } catch (err: any) {
        (self as any).postMessage({
          type: "error",
          error: err.message || "Proof generation failed",
        } as WorkerResponse);
      }
    }
  };
}
