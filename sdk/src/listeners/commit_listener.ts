/**
 * CommitSlotListener — WebSocket + Polling Fallback
 *
 * Listens for InitiateCommitEvent on-chain to notify the counterparty
 * when a new settlement request arrives.
 *
 * Primary: WebSocket subscription via onLogs (real-time, low latency).
 * Fallback: Polling every 2 seconds if WebSocket disconnects.
 */

import { Connection, PublicKey } from "@solana/web3.js";

// Anchor discriminators (SHA-256 first 8 bytes hex)
const INITIATE_COMMIT_EVENT_DISC = "8c4a7d0a96ecc0ea";
const COMMIT_SLOT_ACCOUNT_DISC = "8f1ec79c2e50c1c3";

export interface CommitEvent {
  slot_id: PublicKey;
  initiator: PublicKey;
  counterparty: PublicKey;
  asset_a: PublicKey;
  asset_b: PublicKey;
  expiry: number;
  ts: number;
}

export type CommitEventHandler = (event: CommitEvent) => void | Promise<void>;

export class CommitSlotListener {
  private connection: Connection;
  private programId: PublicKey;
  private walletPubkey: PublicKey;
  private handler: CommitEventHandler;
  private wsSubscriptionId: number | null = null;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private processedSlots: Set<string> = new Set();
  private running = false;
  private pollIntervalMs: number;

  constructor(
    connection: Connection,
    programId: PublicKey,
    walletPubkey: PublicKey,
    handler: CommitEventHandler,
    pollIntervalMs: number = 2000
  ) {
    this.connection = connection;
    this.programId = programId;
    this.walletPubkey = walletPubkey;
    this.handler = handler;
    this.pollIntervalMs = pollIntervalMs;
  }

  async start(): Promise<void> {
    this.running = true;
    try {
      await this.startWebSocket();
    } catch {
      this.startPolling();
    }
  }

  stop(): void {
    this.running = false;
    if (this.wsSubscriptionId !== null) {
      this.connection.removeOnLogsListener(this.wsSubscriptionId);
      this.wsSubscriptionId = null;
    }
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async startWebSocket(): Promise<void> {
    this.wsSubscriptionId = this.connection.onLogs(
      this.programId,
      async (logs) => {
        if (!this.running) return;
        if (!logs.logs.some(log => log.includes(INITIATE_COMMIT_EVENT_DISC))) return;

        try {
          const tx = await this.connection.getTransaction(logs.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });

          if (!tx?.meta?.logMessages) return;

          // Parse event data from program logs
          // Anchor serializes events as base64 after the discriminator
          for (const logMsg of tx.meta.logMessages) {
            if (!logMsg.includes(INITIATE_COMMIT_EVENT_DISC)) continue;

            // Extract the base64-encoded event data
            const parts = logMsg.split("data: ");
            if (parts.length < 2) continue;

            const eventData = Buffer.from(parts[1].trim(), "base64");
            if (eventData.length < 8 + 32 + 32 + 32 + 32 + 8 + 8) continue;

            let off = 8; // skip discriminator
            const slot_id = new PublicKey(eventData.slice(off, off + 32)); off += 32;
            const initiator = new PublicKey(eventData.slice(off, off + 32)); off += 32;
            const counterparty = new PublicKey(eventData.slice(off, off + 32)); off += 32;
            const asset_a = new PublicKey(eventData.slice(off, off + 32)); off += 32;
            const asset_b = new PublicKey(eventData.slice(off, off + 32)); off += 32;
            const expiry = eventData.readBigUInt64LE(off); off += 8;
            const ts = eventData.readBigUInt64LE(off);

            // Only notify if we are the counterparty
            if (counterparty.equals(this.walletPubkey)) {
              const slotKey = slot_id.toBase58();
              if (!this.processedSlots.has(slotKey)) {
                this.processedSlots.add(slotKey);
                this.handler({
                  slot_id,
                  initiator,
                  counterparty,
                  asset_a,
                  asset_b,
                  expiry: Number(expiry),
                  ts: Number(ts),
                });
              }
            }
          }
        } catch (err) {
          console.error("[CommitSlotListener] Error parsing event:", err);
        }
      },
      "confirmed"
    );
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      if (!this.running) return;
      try {
        // CommitSlot discriminator for getProgramAccounts filter
        const discBytes = Buffer.from(COMMIT_SLOT_ACCOUNT_DISC, "hex");

        const accounts = await this.connection.getProgramAccounts(
          this.programId,
          {
            filters: [
              { memcmp: { offset: 0, bytes: discBytes.toString("base64") } },
              // counterparty at offset: disc(8) + initiator(32) = 40
              { memcmp: { offset: 40, bytes: this.walletPubkey.toBase58() } },
            ],
          }
        );

        for (const account of accounts) {
          const slotKey = account.pubkey.toBase58();
          if (this.processedSlots.has(slotKey)) continue;

          const data = account.account.data;
          if (data.length < 8 + 32 + 32 + 32 + 32 + 32 + 8) continue;

          let off = 8;
          const initiator = new PublicKey(data.slice(off, off + 32)); off += 32;
          const counterparty = new PublicKey(data.slice(off, off + 32)); off += 32;
          off += 32; // asset_a_mint
          off += 32; // asset_b_mint
          off += 32; // commitment_hash
          const expiry = data.readBigUInt64LE(off);

          this.processedSlots.add(slotKey);
          this.handler({
            slot_id: account.pubkey,
            initiator,
            counterparty,
            asset_a: PublicKey.default,
            asset_b: PublicKey.default,
            expiry: Number(expiry),
            ts: Math.floor(Date.now() / 1000),
          });
        }
      } catch (err) {
        console.error("[CommitSlotListener] Polling error:", err);
      }
    }, this.pollIntervalMs);
  }
}
