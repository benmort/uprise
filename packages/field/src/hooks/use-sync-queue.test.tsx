import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The offline outbox is the canvasser's work. This suite exists because four components mount
 * `useSyncQueue()` at once (FieldShell, DoorEntry, AddHouseholdMember, SyncCentre) and each used
 * to build its own `SyncQueue` over the same module-scoped IndexedDB — shared data behind private
 * guards.
 *
 * `SyncQueue.flush` guards re-entrancy with an instance field, so per-instance queues meant no
 * guard at all across components. On an `online` transition every instance's effect fires in one
 * React commit; IndexedDB requests settle on a task rather than a microtask, so all of them read
 * the same PENDING snapshot before any marked a record SYNCING — and all of them POSTed it. A
 * duplicate ADD_CONTACT is a duplicate person on the doorstep record.
 */

const listPending = vi.fn(async () => []);
const flushSpy = vi.fn(async () => ({ synced: 0 }));

// Count constructions to prove one queue is shared, and route flush through a shared spy.
let constructed = 0;
vi.mock("../lib/sync-queue", async () => {
  const actual = await vi.importActual<typeof import("../lib/sync-queue")>("../lib/sync-queue");
  return {
    ...actual,
    SyncQueue: class {
      constructor() {
        constructed += 1;
      }
      flush = flushSpy;
      counts = async () => ({ PENDING: 0, SYNCING: 0, DONE: 0, CONFLICT: 0 });
      listPending = listPending;
      listConflicts = async () => [];
      get = async () => undefined;
      enqueue = async (id: string) => id;
    },
  };
});

vi.mock("../lib/idb-store", () => ({
  IndexedDbOutboxStore: class {},
  IndexedDbPhotoBlobStore: class {
    get = async () => undefined;
    remove = async () => undefined;
    put = async () => undefined;
  },
}));

vi.mock("../hooks/use-online-status", () => ({ useOnlineStatus: () => true }));

import { useSyncQueue, __resetSyncQueueSingletons } from "./use-sync-queue";

beforeEach(() => {
  constructed = 0;
  flushSpy.mockClear();
  __resetSyncQueueSingletons();
});

describe("useSyncQueue shares one queue per tab", () => {
  // The fix. Without it each mount built its own queue, so the re-entrancy guard was per-instance.
  it("builds the queue once no matter how many components mount the hook", async () => {
    const a = renderHook(() => useSyncQueue());
    const b = renderHook(() => useSyncQueue());
    const c = renderHook(() => useSyncQueue());
    await waitFor(() => expect(a.result.current).toBeTruthy());
    expect(b.result.current).toBeTruthy();
    expect(c.result.current).toBeTruthy();
    expect(constructed).toBe(1);
  });

  it("keeps the same queue across an unmount/remount", async () => {
    const first = renderHook(() => useSyncQueue());
    await waitFor(() => expect(first.result.current).toBeTruthy());
    first.unmount();
    renderHook(() => useSyncQueue());
    expect(constructed).toBe(1);
  });

  // Every instance registering its own interval + online listener is what made the concurrent
  // flush happen; sharing the queue is what makes the guard cover them.
  it("routes every instance's flush through the one guarded queue", async () => {
    const a = renderHook(() => useSyncQueue());
    const b = renderHook(() => useSyncQueue());
    await waitFor(() => expect(a.result.current).toBeTruthy());
    await Promise.all([a.result.current.flush(), b.result.current.flush()]);
    // Both calls landed on the SAME instance, so SyncQueue's own mutex applies.
    expect(constructed).toBe(1);
    expect(flushSpy).toHaveBeenCalled();
  });
});
