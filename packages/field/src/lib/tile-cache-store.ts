"use client";

import { openDB, type IDBPDatabase } from "idb";

// Per-turf offline-map manifest. The tile bytes live in the service-worker
// "mapbox" cache (see map-cache.ts); this just records what's been downloaded so
// the field UI can show status across reloads and resume a partial download.

// "incomplete" = the download finished but a post-download integrity check found tiles missing
// from Cache Storage (opaque-fetch failure or mid-download eviction) — so it's NOT safe to
// promise offline; the UI prompts a retry rather than a false "saved".
export type TileManifestStatus = "idle" | "running" | "done" | "incomplete" | "error" | "cancelled";

export type TileManifest = {
  turfId: string;
  total: number;
  done: number;
  status: TileManifestStatus;
  zoomMin: number;
  zoomMax: number;
  updatedAt: string;
};

const DB_NAME = "uprise-tilecache";
const DB_VERSION = 1;
const STORE = "manifests";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "turfId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getManifest(turfId: string): Promise<TileManifest | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await getDb();
  return db.get(STORE, turfId) as Promise<TileManifest | undefined>;
}

export async function putManifest(manifest: TileManifest): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await getDb();
  await db.put(STORE, manifest);
}
