"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { OutboxRecord, OutboxStatus, OutboxStore } from "./sync-queue";

// Browser IndexedDB implementation of OutboxStore. The SyncQueue logic is
// store-agnostic and unit-tested against InMemoryOutboxStore; this is the thin
// persistence layer used in the PWA.

const DB_NAME = "yarns-canvass";
const DB_VERSION = 1;
const OUTBOX = "outbox";

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
