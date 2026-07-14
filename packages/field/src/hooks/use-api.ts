"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ApiResult } from "@uprise/api-client";
import {
  entryFor,
  hydrateFromStore,
  invalidateApi,
  isFresh,
  peekEntry,
  revalidate,
  subscribeKey,
  writeEntry,
  type Fetcher,
} from "../lib/use-api-cache";

export { invalidateApi };

/**
 * The field PWA's data-fetching primitive – a thin React binding over the
 * use-api-cache engine (TTL cache, in-flight dedup, stale-while-revalidate,
 * refcounted abort). Lifted from admin so a canvasser revisiting a screen sees
 * cached data instantly while it revalidates in the background, and the shared
 * assignments payload is fetched once across every screen.
 *
 * - fetch on mount and on key change; a `null` key skips entirely;
 * - cached data renders instantly and revalidates in the background –
 *   `loading` is true ONLY while there is no data for the key yet;
 * - errors keep the last-good data (screens can show both);
 * - StrictMode-safe: reads via useSyncExternalStore, fetches only in effects.
 *
 * Keys are request paths by convention (e.g. "/canvass/assignments?volunteerId=x")
 * so `invalidateApi("/canvass")` after a mutation maps onto the REST resource.
 */
export type UseApiOptions = {
  /** Serve cached data without revalidating when younger than this. Default 0 (always revalidate). */
  ttlMs?: number;
  /** Poll cadence; false/undefined = no polling. Paused while the tab is hidden. */
  refetchInterval?: number | false;
  /** Revalidate when the window regains focus. Default false. */
  revalidateOnFocus?: boolean;
};

export type UseApiState<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  /** True when the last failure was a 403 – render the no-permission state. */
  noPermission: boolean;
  refetch: () => Promise<void>;
  /** Optimistically write the cache (notifies all subscribers of the key). */
  mutate: (next: T | ((current: T | undefined) => T)) => void;
};

export function useApi<T>(
  key: string | null,
  fn: (signal: AbortSignal) => Promise<ApiResult<T>>,
  opts: UseApiOptions = {},
): UseApiState<T> {
  const { ttlMs = 0, refetchInterval = false, revalidateOnFocus = false } = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Keep the entry's fetcher pointing at the latest mounted hook's fn so
  // invalidateApi can refetch without a subscriber closure.
  useEffect(() => {
    if (key === null) return;
    entryFor(key).fetcher = ((signal) => fnRef.current(signal)) as Fetcher;
  }, [key]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => (key === null ? () => {} : subscribeKey(key, onStoreChange)),
    [key],
  );
  // Monotonic-version snapshot (React compares with Object.is) – the entry's
  // v bumps on every observable change, so same-millisecond writes re-render.
  const getSnapshot = useCallback(() => {
    if (key === null) return null;
    return peekEntry(key)?.v ?? null;
  }, [key]);
  useSyncExternalStore(subscribe, getSnapshot, () => null);

  // Fetch on mount / key change (respecting TTL). Also hydrate from the durable IndexedDB
  // store: on a cold offline start the revalidate fails, and hydrateFromStore fills in the
  // last-good data (e.g. the walk-list stops) so the screen isn't empty. No-ops if a live
  // fetch has already populated the entry.
  useEffect(() => {
    if (key === null) return;
    void hydrateFromStore(key);
    if (!isFresh(key, ttlMs)) void revalidate(key, (signal) => fnRef.current(signal));
  }, [key, ttlMs]);

  // Polling – paused when hidden, immediate revalidate on becoming visible.
  useEffect(() => {
    if (key === null || !refetchInterval) return;
    const tick = () => {
      if (document.hidden) return;
      void revalidate(key, (signal) => fnRef.current(signal));
    };
    const id = window.setInterval(tick, refetchInterval);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, refetchInterval]);

  useEffect(() => {
    if (key === null || !revalidateOnFocus) return;
    const onFocus = () => void revalidate(key, (signal) => fnRef.current(signal));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [key, revalidateOnFocus]);

  const refetch = useCallback(async () => {
    if (key === null) return;
    await revalidate(key, (signal) => fnRef.current(signal));
  }, [key]);

  const mutate = useCallback(
    (next: T | ((current: T | undefined) => T)) => {
      if (key === null) return;
      const current = peekEntry(key)?.data as T | undefined;
      writeEntry(key, typeof next === "function" ? (next as (c: T | undefined) => T)(current) : next);
    },
    [key],
  );

  const entry = key === null ? undefined : peekEntry(key);
  const data = entry?.data as T | undefined;
  return useMemo(
    () => ({
      data,
      // No data and no error means we are (or are about to be) fetching – this
      // covers the pre-effect first render (entry not created yet) and goes
      // FALSE the moment a fetch fails, so the error/retry state is reachable.
      loading: key !== null && data === undefined && entry?.error === undefined,
      error: entry?.error,
      noPermission: entry?.status === 403,
      refetch,
      mutate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, data, entry?.error, entry?.status, entry?.inflight, refetch, mutate],
  );
}
