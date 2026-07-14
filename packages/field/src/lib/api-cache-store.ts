"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * Durable last-good store for field GET responses (assignments, dispositions, surveys,
 * resident contacts). The in-memory useApi cache (use-api-cache.ts) is wiped on reload, and the
 * service-worker API cache is a network cache with its own expiry — neither survives a cold
 * offline start reliably. This mirrors every successful GET into IndexedDB, keyed by the api key
 * (the request path), so a canvasser who opened a walk list online can reopen it offline — even
 * after the tab was killed — and still see the stops.
 *
 * A SEPARATE DB from the outbox (`uprise-canvass`) so the two never contend on a version bump.
 * Best-effort throughout: any failure (no IndexedDB, private mode, quota) resolves to a no-op —
 * the cache is an optimisation, never a correctness dependency.
 */

const DB_NAME = "uprise-api-cache";
const DB_VERSION = 1;
const STORE = "responses";

type CachedResponse = { key: string; data: unknown; at: number };

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null; // SSR / unsupported
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      },
    }).catch((err) => {
      dbPromise = null; // let a later call retry rather than latch the failure
      throw err;
    });
  }
  return dbPromise;
}

/** Persist a successful GET response. Fire-and-forget; never throws. */
export async function apiCacheSet(key: string, data: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const record: CachedResponse = { key, data, at: Date.now() };
    await db.put(STORE, record);
  } catch {
    /* best-effort: a cache write must never surface to the caller */
  }
}

/** Read the last-good response for a key, or undefined. Never throws. */
export async function apiCacheGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    const row = (await db.get(STORE, key)) as CachedResponse | undefined;
    return row ? (row.data as T) : undefined;
  } catch {
    return undefined;
  }
}
