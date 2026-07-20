"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { OutboxRecord, OutboxStatus, OutboxStore } from "./sync-queue";

// Browser IndexedDB implementation of OutboxStore. The SyncQueue logic is
// store-agnostic and unit-tested against InMemoryOutboxStore; this is the thin
// persistence layer used in the PWA.

const DB_NAME = "uprise-canvass";
// v2 adds the `photos` store (image bytes for queued DOOR_PHOTO records — kept out of the
// outbox record itself so listPending/counts stay cheap).
const DB_VERSION = 2;
const OUTBOX = "outbox";
const PHOTOS = "photos";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OUTBOX)) {
          const store = db.createObjectStore(OUTBOX, { keyPath: "localId" });
          store.createIndex("status", "status");
          store.createIndex("clientCapturedAt", "clientCapturedAt");
        }
        if (!db.objectStoreNames.contains(PHOTOS)) {
          db.createObjectStore(PHOTOS); // key = the DOOR_PHOTO record's localId; value = Blob
        }
      },
    });
  }
  return dbPromise;
}

export class IndexedDbOutboxStore implements OutboxStore {
  async put(record: OutboxRecord): Promise<void> {
    const db = await getDb();
    await db.put(OUTBOX, record);
  }

  async get(localId: string): Promise<OutboxRecord | undefined> {
    const db = await getDb();
    return db.get(OUTBOX, localId) as Promise<OutboxRecord | undefined>;
  }

  async listPending(): Promise<OutboxRecord[]> {
    const db = await getDb();
    const all = (await db.getAll(OUTBOX)) as OutboxRecord[];
    return all
      .filter((r) => r.status === "PENDING")
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
  }

  async listByStatus(status: OutboxStatus): Promise<OutboxRecord[]> {
    const db = await getDb();
    const all = (await db.getAll(OUTBOX)) as OutboxRecord[];
    return all
      .filter((r) => r.status === status)
      .sort((a, b) => a.clientCapturedAt.localeCompare(b.clientCapturedAt));
  }

  async update(localId: string, patch: Partial<OutboxRecord>): Promise<void> {
    const db = await getDb();
    const existing = (await db.get(OUTBOX, localId)) as OutboxRecord | undefined;
    if (!existing) return;
    await db.put(OUTBOX, { ...existing, ...patch });
  }

  async remove(localId: string): Promise<void> {
    const db = await getDb();
    await db.delete(OUTBOX, localId);
  }

  async counts(): Promise<Record<OutboxStatus, number>> {
    const db = await getDb();
    const all = (await db.getAll(OUTBOX)) as OutboxRecord[];
    const out: Record<OutboxStatus, number> = { PENDING: 0, SYNCING: 0, DONE: 0, CONFLICT: 0 };
    for (const r of all) out[r.status] += 1;
    return out;
  }
}

/** On-device store for queued photo bytes, keyed by the DOOR_PHOTO record's localId. Kept
 *  separate from the outbox so the record list stays small; the blob is deleted on upload. */
export interface PhotoBlobStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  remove(key: string): Promise<void>;
}

export class IndexedDbPhotoBlobStore implements PhotoBlobStore {
  async put(key: string, blob: Blob): Promise<void> {
    const db = await getDb();
    await db.put(PHOTOS, blob, key);
  }
  async get(key: string): Promise<Blob | undefined> {
    const db = await getDb();
    return db.get(PHOTOS, key) as Promise<Blob | undefined>;
  }
  async remove(key: string): Promise<void> {
    const db = await getDb();
    await db.delete(PHOTOS, key);
  }
}

/** In-memory blob store for tests / non-persistent fallback. */
export class InMemoryPhotoBlobStore implements PhotoBlobStore {
  private readonly map = new Map<string, Blob>();
  async put(key: string, blob: Blob): Promise<void> {
    this.map.set(key, blob);
  }
  async get(key: string): Promise<Blob | undefined> {
    return this.map.get(key);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
