import "fake-indexeddb/auto"; // real in-memory IndexedDB for the node test env
import { describe, expect, it } from "vitest";
import { IndexedDbOutboxStore, IndexedDbPhotoBlobStore, InMemoryPhotoBlobStore } from "./idb-store";
import type { OutboxRecord } from "./sync-queue";

const knock = (localId: string): OutboxRecord => ({
  localId,
  type: "DOOR_KNOCK",
  payload: { contactId: "c1" },
  status: "PENDING",
  attempts: 0,
  clientCapturedAt: "2026-06-16T10:00:00Z",
});

describe("IndexedDbOutboxStore", () => {
  it("round-trips a record and reports pending", async () => {
    const store = new IndexedDbOutboxStore();
    await store.put(knock("k1"));
    expect((await store.get("k1"))?.payload).toEqual({ contactId: "c1" });
    expect((await store.listPending()).map((r) => r.localId)).toContain("k1");
  });
});

describe("photo blob stores", () => {
  it("round-trips and removes a Blob in IndexedDB (v2 photos store)", async () => {
    const store = new IndexedDbPhotoBlobStore();
    const blob = new Blob(["image-bytes"], { type: "image/jpeg" });
    await store.put("p1", blob);
    const got = await store.get("p1");
    expect(got).toBeInstanceOf(Blob);
    expect(await got!.text()).toBe("image-bytes");
    await store.remove("p1");
    expect(await store.get("p1")).toBeUndefined();
  });

  it("in-memory store round-trips too (test/fallback impl)", async () => {
    const store = new InMemoryPhotoBlobStore();
    const blob = new Blob(["x"]);
    await store.put("p1", blob);
    expect(await store.get("p1")).toBe(blob);
    await store.remove("p1");
    expect(await store.get("p1")).toBeUndefined();
  });
});
