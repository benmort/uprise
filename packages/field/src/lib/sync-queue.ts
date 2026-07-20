// Offline-first sync queue for door interactions. Every interaction — a knock, its photo,
// or an added household member — is written to an outbox synchronously (instant + offline-safe)
// and flushed to the API when online, so nothing at the door ever needs signal. The store is
// pluggable: an in-memory store for tests, an IndexedDB-backed one in the browser. Idempotency
// is by client `localId` so a re-synced knock is deduped server-side (DoorKnock unique on
// (org, localId)). A knock references its photo/contact by their localId (`photoRef`/
// `contactRef` in its payload); the dispatcher resolves those to the server url/id at flush,
// which is why FIFO order (a photo/contact enqueued before the knock that names it) matters.

export type OutboxStatus = "PENDING" | "SYNCING" | "DONE" | "CONFLICT";

/** The kinds of interaction the outbox carries. All flush through one queue, FIFO. */
export type OutboxType = "DOOR_KNOCK" | "DOOR_PHOTO" | "ADD_CONTACT";

export type OutboxRecord = {
  localId: string;
  type: OutboxType;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  clientCapturedAt: string;
  /** Server outcome persisted on DONE (a photo's `url`, a contact's `id`) so a later knock
   *  can resolve its `photoRef`/`contactRef` to the real value. */
  result?: Record<string, unknown>;
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
// `result` (on ok) is the server outcome persisted for later refs (photo url / contact id).
export type SubmitResult =
  | { ok: true; result?: Record<string, unknown> }
  | { ok: false; retriable: boolean; error: string };

export class SyncQueue {
  // Guards against concurrent drains (post-enqueue + 30s interval + focus can overlap once
  // photo uploads make a flush slow). The SYNCING status alone has a check-then-act window
  // that would double-POST a non-idempotent record (an added contact). Set/checked
  // synchronously, so there is no await between the check and the set.
  private flushing = false;

  constructor(private readonly store: OutboxStore) {}

  /** Queue an interaction (default a door knock). Idempotent on localId — re-enqueuing a
   *  known id is a no-op. Returns the localId so a caller can reference it (photo/contact). */
  async enqueue(
    localId: string,
    payload: Record<string, unknown>,
    clientCapturedAt: string,
    type: OutboxType = "DOOR_KNOCK",
  ): Promise<string> {
    const existing = await this.store.get(localId);
    if (existing) return localId;
    await this.store.put({
      localId,
      type,
      payload,
      status: "PENDING",
      attempts: 0,
      clientCapturedAt,
    });
    return localId;
  }

  /**
   * Drain PENDING records FIFO through `submit`. Stops on the first transient
   * failure (preserves order; the next flush retries from there). Returns how
   * many synced this pass. Re-entrancy is guarded — a second concurrent flush is a no-op.
   */
  async flush(submit: (record: OutboxRecord) => Promise<SubmitResult>): Promise<{ synced: number }> {
    if (this.flushing) return { synced: 0 };
    this.flushing = true;
    try {
      return await this.drain(submit);
    } finally {
      this.flushing = false;
    }
  }

  private async drain(submit: (record: OutboxRecord) => Promise<SubmitResult>): Promise<{ synced: number }> {
    const pending = await this.store.listPending();
    let synced = 0;
    for (const record of pending) {
      await this.store.update(record.localId, { status: "SYNCING" });
      const result = await submit(record);
      if (result.ok) {
        await this.store.update(record.localId, { status: "DONE", result: result.result });
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
      // Terminal (e.g. turf not assigned to this volunteer): park as CONFLICT.
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

  /** Read one record by localId — used to resolve a knock's photo/contact references at flush. */
  get(localId: string): Promise<OutboxRecord | undefined> {
    return this.store.get(localId);
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

  /** Drop a conflicted record permanently (volunteer chose not to keep it). */
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
