import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryOutboxStore, SyncQueue, type OutboxRecord, type SubmitResult } from "./sync-queue";

describe("SyncQueue", () => {
  let store: InMemoryOutboxStore;
  let queue: SyncQueue;

  beforeEach(() => {
    store = new InMemoryOutboxStore();
    queue = new SyncQueue(store);
  });

  it("enqueues a knock as PENDING and is idempotent on localId", async () => {
    await queue.enqueue("k1", { contactId: "c1" }, "2026-06-16T10:00:00Z");
    await queue.enqueue("k1", { contactId: "c1", changed: true }, "2026-06-16T10:05:00Z");

    expect(await queue.counts()).toMatchObject({ PENDING: 1 });
    const rec = await store.get("k1");
    expect(rec?.payload).toEqual({ contactId: "c1" }); // first write wins; not overwritten
  });

  it("drains PENDING records and marks them DONE on success", async () => {
    await queue.enqueue("k1", {}, "2026-06-16T10:00:00Z");
    await queue.enqueue("k2", {}, "2026-06-16T10:01:00Z");

    const submit = vi.fn(async (): Promise<SubmitResult> => ({ ok: true }));
    const result = await queue.flush(submit);

    expect(result.synced).toBe(2);
    expect(await queue.counts()).toMatchObject({ DONE: 2, PENDING: 0 });
  });

  it("keeps a record PENDING and stops on a transient failure (preserves order)", async () => {
    await queue.enqueue("k1", {}, "2026-06-16T10:00:00Z");
    await queue.enqueue("k2", {}, "2026-06-16T10:01:00Z");

    const submit = vi.fn(async (): Promise<SubmitResult> => ({ ok: false, retriable: true, error: "offline" }));
    const result = await queue.flush(submit);

    expect(result.synced).toBe(0);
    expect(submit).toHaveBeenCalledTimes(1); // stopped after first failure
    const k1 = await store.get("k1");
    expect(k1?.status).toBe("PENDING");
    expect(k1?.attempts).toBe(1);
  });

  it("parks a terminal failure as CONFLICT and continues", async () => {
    await queue.enqueue("k1", {}, "2026-06-16T10:00:00Z");
    await queue.enqueue("k2", {}, "2026-06-16T10:01:00Z");

    const submit = vi.fn(async (r: OutboxRecord): Promise<SubmitResult> =>
      r.localId === "k1" ? { ok: false, retriable: false, error: "turf not assigned" } : { ok: true },
    );
    const result = await queue.flush(submit);

    expect(result.synced).toBe(1);
    expect((await store.get("k1"))?.status).toBe("CONFLICT");
    expect((await store.get("k2"))?.status).toBe("DONE");
  });

  it("retries previously-PENDING records on a later flush", async () => {
    await queue.enqueue("k1", {}, "2026-06-16T10:00:00Z");

    await queue.flush(async () => ({ ok: false, retriable: true, error: "offline" }));
    expect((await store.get("k1"))?.status).toBe("PENDING");

    const result = await queue.flush(async () => ({ ok: true }));
    expect(result.synced).toBe(1);
    expect((await store.get("k1"))?.status).toBe("DONE");
  });

  it("lists conflicts and resolves them via retry / discard (G4)", async () => {
    await queue.enqueue("k1", {}, "2026-06-16T10:00:00Z");
    await queue.flush(async () => ({ ok: false, retriable: false, error: "turf not assigned" }));

    const conflicts = await queue.listConflicts();
    expect(conflicts.map((c) => c.localId)).toEqual(["k1"]);

    // Retry re-queues it as PENDING for the next flush.
    await queue.retry("k1");
    expect((await store.get("k1"))?.status).toBe("PENDING");
    expect(await queue.listConflicts()).toHaveLength(0);

    // Discard removes the record entirely.
    await queue.flush(async () => ({ ok: false, retriable: false, error: "still bad" }));
    await queue.discard("k1");
    expect(await store.get("k1")).toBeUndefined();
    expect(await queue.listConflicts()).toHaveLength(0);
  });
});
