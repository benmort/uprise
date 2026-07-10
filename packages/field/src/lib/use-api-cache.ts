import type { ApiResult } from "@uprise/api-client";

/**
 * Framework-free engine behind useApi: an in-memory TTL cache with in-flight
 * dedup, stale-while-revalidate and refcounted abort. Kept separate from the
 * React binding so its semantics are unit-testable in node. (Lifted from the
 * admin app so the field PWA gets the same instant-navigation behaviour.)
 */

export type Fetcher<T = unknown> = (signal: AbortSignal) => Promise<ApiResult<T>>;

export type CacheEntry = {
  data?: unknown;
  error?: string;
  status?: number;
  at: number; // last successful write (ms epoch); 0 = never
  /** Monotonic version, bumped on EVERY observable change – the snapshot
   *  primitive (Date.now() alone made same-millisecond writes invisible). */
  v: number;
  inflight?: Promise<void>;
  controller?: AbortController;
  subscribers: number;
  listeners: Set<() => void>;
  /** Latest mounted hook's fetcher – lets invalidateApi refetch without a closure. */
  fetcher?: Fetcher;
};

const cache = new Map<string, CacheEntry>();

/** Soft cap on cached keys. Some payloads (assignment lists, GeoJSON) are large, so
 *  subscriber-less entries beyond the cap are evicted oldest-first. */
const MAX_ENTRIES = 150;

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const evictable = [...cache.entries()]
    .filter(([, e]) => e.subscribers === 0 && !e.inflight)
    .sort((a, b) => a[1].at - b[1].at);
  for (const [key] of evictable) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(key);
  }
}

export function entryFor(key: string): CacheEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { at: 0, v: 0, subscribers: 0, listeners: new Set() };
    cache.set(key, entry);
    evictIfNeeded();
  }
  return entry;
}

export function peekEntry(key: string): CacheEntry | undefined {
  return cache.get(key);
}

function notify(entry: CacheEntry): void {
  entry.v += 1;
  for (const listener of entry.listeners) listener();
}

/** Write-through for optimistic mutations; notifies every subscriber of the key. */
export function writeEntry(key: string, data: unknown): void {
  const entry = entryFor(key);
  entry.data = data;
  entry.at = Date.now();
  entry.error = undefined;
  entry.status = undefined;
  notify(entry);
}

/**
 * Fetch (or join the in-flight fetch for) a key. Errors keep last-good data;
 * an aborted request never writes error state (request() flattens AbortError
 * into {ok:false}, so the signal – not the result – is the source of truth).
 */
export function revalidate(key: string, fn?: Fetcher): Promise<void> {
  const entry = entryFor(key);
  const fetcher = fn ?? entry.fetcher;
  if (!fetcher) return Promise.resolve();
  if (entry.inflight) return entry.inflight; // in-flight dedup

  const controller = new AbortController();
  entry.controller = controller;
  // `let` (not const): the async IIFE's finally reads `run`, and TS can't prove
  // the assignment happened first if the body settles synchronously.
  let run: Promise<void> | undefined;
  run = (async () => {
    try {
      const result = await fetcher(controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        entry.data = result.data;
        entry.error = undefined;
        entry.status = undefined;
        entry.at = Date.now();
      } else {
        entry.error = result.error;
        entry.status = result.status;
      }
    } catch {
      if (!controller.signal.aborted) entry.error = "Request failed";
    } finally {
      // Only the CURRENT run may clear the in-flight state – an aborted run's
      // late finally must not clobber a newer fetch's registration.
      if (entry.inflight === run) {
        entry.inflight = undefined;
        entry.controller = undefined;
        notify(entry);
      }
    }
  })();
  entry.inflight = run;
  notify(entry); // announce the in-flight state
  return run;
}

/** True when the entry has data younger than ttlMs. */
export function isFresh(key: string, ttlMs: number): boolean {
  const entry = cache.get(key);
  return Boolean(entry && entry.at > 0 && Date.now() - entry.at < ttlMs);
}

/**
 * Subscribe a listener to a key. Returns the unsubscribe. The in-flight fetch
 * is aborted only when the LAST subscriber leaves, deferred a macrotask so
 * StrictMode's synchronous unmount→remount never aborts its own fetch.
 */
export function subscribeKey(key: string, listener: () => void): () => void {
  const entry = entryFor(key);
  entry.listeners.add(listener);
  entry.subscribers += 1;
  return () => {
    entry.listeners.delete(listener);
    entry.subscribers -= 1;
    setTimeout(() => {
      if (entry.subscribers === 0 && entry.controller) {
        entry.controller.abort();
        entry.controller = undefined;
        entry.inflight = undefined;
      }
    }, 0);
  };
}

/**
 * Invalidate every cached key starting with the prefix (convention: keys are
 * request paths, so `invalidateApi("/canvass")` maps onto the REST resource).
 * Keys with live subscribers refetch immediately; unmounted keys just go stale.
 */
export function invalidateApi(keyPrefix: string): void {
  for (const [key, entry] of cache) {
    if (!key.startsWith(keyPrefix)) continue;
    entry.at = 0;
    if (entry.listeners.size > 0 && entry.fetcher) void revalidate(key);
    notify(entry);
  }
}

/** Test hook: wipe the cache between cases. */
export function __clearApiCache(): void {
  cache.clear();
}
