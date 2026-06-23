"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { submitDoorKnock, type DoorKnockInput } from "@/lib/api";
import { IndexedDbOutboxStore } from "@/lib/canvass/idb-store";
import { SyncQueue, type OutboxRecord, type OutboxStatus, type SubmitResult } from "@/lib/canvass/sync-queue";
import { useOnlineStatus } from "./use-online-status";

const EMPTY: Record<OutboxStatus, number> = { PENDING: 0, SYNCING: 0, DONE: 0, CONFLICT: 0 };

// Errors we treat as transient (retry) vs terminal (CONFLICT). The door-knock
// endpoint returns "TURF_NOT_ASSIGNED"/"CONTACT_NOT_FOUND" as terminal; anything
// that looks like a network/timeout/5xx is retriable.
function classify(error: string): SubmitResult {
  const transient = /network|fetch|timeout|Failed to fetch|Not authenticated|50\d/i.test(error);
  return { ok: false, retriable: transient, error };
}

/**
 * Wires the offline outbox: enqueue door knocks instantly, auto-flush when
 * online (on reconnect, tab focus, and a 30s interval). Returns live counts for
 * the SyncStatusBadge.
 */
export function useSyncQueue() {
  const online = useOnlineStatus();
  const queueRef = useRef<SyncQueue | null>(null);
  const [counts, setCounts] = useState<Record<OutboxStatus, number>>(EMPTY);
  const [pending, setPending] = useState<OutboxRecord[]>([]);

  if (queueRef.current === null && typeof window !== "undefined") {
    queueRef.current = new SyncQueue(new IndexedDbOutboxStore());
  }

  const [conflicts, setConflicts] = useState<OutboxRecord[]>([]);

  const refreshCounts = useCallback(async () => {
    if (!queueRef.current) return;
    const [c, p, x] = await Promise.all([
      queueRef.current.counts(),
      queueRef.current.listPending(),
      queueRef.current.listConflicts(),
    ]);
    setCounts(c);
    setPending(p);
    setConflicts(x);
  }, []);

  const flush = useCallback(async () => {
    const queue = queueRef.current;
    if (!queue) return;
    await queue.flush(async (record: OutboxRecord): Promise<SubmitResult> => {
      const res = await submitDoorKnock(record.payload as unknown as DoorKnockInput);
      if (res.ok) return { ok: true };
      return classify(res.error);
    });
    await refreshCounts();
  }, [refreshCounts]);

  const enqueue = useCallback(
    async (localId: string, payload: DoorKnockInput, clientCapturedAt: string) => {
      const queue = queueRef.current;
      if (!queue) return;
      await queue.enqueue(localId, payload as unknown as Record<string, unknown>, clientCapturedAt);
      await refreshCounts();
      if (online) void flush();
    },
    [online, flush, refreshCounts],
  );

  useEffect(() => {
    void refreshCounts();
    if (online) void flush();
  }, [online, flush, refreshCounts]);

  useEffect(() => {
    const onFocus = () => online && void flush();
    window.addEventListener("visibilitychange", onFocus);
    const timer = window.setInterval(() => online && void flush(), 30_000);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, [online, flush]);

  const retryConflict = useCallback(
    async (localId: string) => {
      const queue = queueRef.current;
      if (!queue) return;
      await queue.retry(localId);
      await refreshCounts();
      if (online) void flush();
    },
    [online, flush, refreshCounts],
  );

  const discardConflict = useCallback(
    async (localId: string) => {
      const queue = queueRef.current;
      if (!queue) return;
      await queue.discard(localId);
      await refreshCounts();
    },
    [refreshCounts],
  );

  return {
    counts,
    pending,
    conflicts,
    online,
    enqueue,
    flush,
    retryConflict,
    discardConflict,
    refresh: refreshCounts,
  };
}
