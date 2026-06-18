// Offline-first sync queue for door knocks. Every knock is written to an outbox
// synchronously (instant + offline-safe) and flushed to the API when online.
// The store is pluggable: an in-memory store for tests, an IndexedDB-backed one
// in the browser. Idempotency is by client `localId` so a re-synced knock is
// deduped server-side (DoorKnock unique on (org, localId)).

export type OutboxStatus = "PENDING" | "SYNCING" | "DONE" | "CONFLICT";

export type OutboxRecord = {
  localId: string;
  type: "DOOR_KNOCK";
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  clientCapturedAt: string;
};

export interface OutboxStore {
  put(record: OutboxRecord): Promise<void>;
  get(localId: string): Promise<OutboxRecord | undefined>;
  listPending(): Promise<OutboxRecord[]>; // FIFO by clientCapturedAt
  listByStatus(status: OutboxStatus): Promise<OutboxRecord[]>;
  update(localId: string, patch: Partial<OutboxRecord>): Promise<void>;
  remove(localId: string): Promise<void>;
  counts(): Promise<Record<OutboxStatus, number>>;
}

// Result the consumer's submit function returns. retriable=true means a transient
// failure (offline / 5xx) → keep PENDING; false means terminal (4xx) → CONFLICT.
export type SubmitResult = { ok: true } | { ok: false; retriable: boolean; error: string };

export class SyncQueue {
  constructor(private readonly store: OutboxStore) {}

  /** Queue a door knock. Idempotent on localId — re-enqueuing a known id is a no-op. */
  async enqueue(localId: string, payload: Record<string, unknown>, clientCapturedAt: string): Promise<void> {
    const existing = await this.store.get(localId);
    if (existing) return;
    await this.store.put({
      localId,
      type: "DOOR_KNOCK",
      payload,
      status: "PENDING",
      attempts: 0,
      clientCapturedAt,
    });
  }

  /**
   * Drain PENDING records FIFO through `submit`. Stops on the first transient
   * failure (preserves order; the next flush retries from there). Returns how
   * many synced this pass.
   */
  async flush(submit: (record: OutboxRecord) => Promise<SubmitResult>): Promise<{ synced: number }> {
    const pending = await this.store.listPending();
    let synced = 0;
    for (const record of pending) {
      await this.store.update(record.localId, { status: "SYNCING" });
      const result = await submit(record);
      if (result.ok) {
        await this.store.update(record.localId, { status: "DONE" });
        synced += 1;
        continue;
      }
      if (result.retriable) {
        // Transient: revert to PENDING, count the attempt, stop to preserve order.
        await this.store.update(record.localId, {
          status: "PENDING",
          attempts: record.attempts + 1,
        });
        break;
      }
      // Terminal (e.g. turf not assigned to this canvasser): park as CONFLICT.
      await this.store.update(record.localId, {
        status: "CONFLICT",
        attempts: record.attempts + 1,
      });
    }
    return { synced };
  }

  counts(): Promise<Record<OutboxStatus, number>> {
    return this.store.counts();
  }

  /** Records still waiting to sync (PENDING), FIFO — for the sync-centre list. */
  listPending(): Promise<OutboxRecord[]> {
    return this.store.listPending();
  }

  /** Conflicts the server rejected (terminal 4xx) — surfaced for manual resolution. */
  listConflicts(): Promise<OutboxRecord[]> {
    return this.store.listByStatus("CONFLICT");
  }

  /** Re-queue a conflicted record for another flush attempt. */
  async retry(localId: string): Promise<void> {
    await this.store.update(localId, { status: "PENDING" });
  }

  /** Drop a conflicted record permanently (canvasser chose not to keep it). */
  async discard(localId: string): Promise<void> {
    await this.store.remove(localId);
  }
}

/** In-memory store — used by tests and as a non-persistent fallback. */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly map = new Map<string, OutboxRecord>();

  async put(record: OutboxRecord): Promise<void> {
    this.map.set(record.localId, { ...record });
  }
  async get(localId: string): Promise<OutboxRecord | undefined> {
    const r = this.map.get(localId);
    return r ? { ...r } : undefined;
  }
  async listPending(): Promise<OutboxRecord[]> {
    return [...this.map.values()]
      .filter((r) => r.status === "PENDING")
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
  }
  async listByStatus(status: OutboxStatus): Promise<OutboxRecord[]> {
    return [...this.map.values()]
      .filter((r) => r.status === status)
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
  }
  async update(localId: string, patch: Partial<OutboxRecord>): Promise<void> {
    const existing = this.map.get(localId);
    if (existing) this.map.set(localId, { ...existing, ...patch });
  }
  async remove(localId: string): Promise<void> {
    this.map.delete(localId);
  }
  async counts(): Promise<Record<OutboxStatus, number>> {
    const out: Record<OutboxStatus, number> = { PENDING: 0, SYNCING: 0, DONE: 0, CONFLICT: 0 };
    for (const r of this.map.values()) out[r.status] += 1;
    return out;
  }
}
