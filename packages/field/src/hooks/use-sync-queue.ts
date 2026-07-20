"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDoorContact, submitDoorKnock, uploadDoorPhotoBlob, type DoorKnockInput } from "../api";
import { IndexedDbOutboxStore, IndexedDbPhotoBlobStore, type PhotoBlobStore } from "../lib/idb-store";
import { SyncQueue, type OutboxRecord, type OutboxStatus } from "../lib/sync-queue";
import { makeOutboxSubmit } from "../lib/outbox-dispatch";
import { newLocalId } from "../lib/volunteer";
import { useOnlineStatus } from "./use-online-status";

const EMPTY: Record<OutboxStatus, number> = { PENDING: 0, SYNCING: 0, DONE: 0, CONFLICT: 0 };

/**
 * Wires the offline outbox. Every interaction — a door knock, its photo, an added household
 * member — is written locally at capture (nothing needs signal), then auto-flushed when online
 * (reconnect, tab focus, a 30s interval, and right after each enqueue). A knock references its
 * photo/contact by their localId; the dispatcher (outbox-dispatch) resolves those to the server
 * url/id at flush. Returns live counts for the SyncStatusBadge.
 */
export function useSyncQueue() {
  const online = useOnlineStatus();
  const queueRef = useRef<SyncQueue | null>(null);
  const photoStoreRef = useRef<PhotoBlobStore | null>(null);
  const [counts, setCounts] = useState<Record<OutboxStatus, number>>(EMPTY);
  const [pending, setPending] = useState<OutboxRecord[]>([]);
  const [conflicts, setConflicts] = useState<OutboxRecord[]>([]);

  if (queueRef.current === null && typeof window !== "undefined") {
    queueRef.current = new SyncQueue(new IndexedDbOutboxStore());
    photoStoreRef.current = new IndexedDbPhotoBlobStore();
  }

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
    const photos = photoStoreRef.current;
    if (!queue || !photos) return;
    const submit = makeOutboxSubmit({
      uploadPhoto: (blob, filename) => uploadDoorPhotoBlob(blob, filename),
      createContact: (input) => createDoorContact(input as Parameters<typeof createDoorContact>[0]),
      submitKnock: (input) => submitDoorKnock(input as DoorKnockInput),
      getBlob: (key) => photos.get(key),
      deleteBlob: (key) => photos.remove(key),
      lookup: (localId) => queue.get(localId),
    });
    await queue.flush(submit);
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

  /** Queue a door photo offline. Stores the (compressed) bytes on-device and returns the
   *  record's localId so the knock can reference it via `photoRef`. */
  const enqueuePhoto = useCallback(
    async (blob: Blob, meta: { filename: string; mimeType: string }): Promise<string | null> => {
      const queue = queueRef.current;
      const photos = photoStoreRef.current;
      if (!queue || !photos) return null;
      const localId = newLocalId();
      await photos.put(localId, blob);
      await queue.enqueue(
        localId,
        { blobKey: localId, filename: meta.filename, mimeType: meta.mimeType },
        new Date().toISOString(),
        "DOOR_PHOTO",
      );
      await refreshCounts();
      if (online) void flush();
      return localId;
    },
    [online, flush, refreshCounts],
  );

  /** Queue an added household member offline; returns the record's localId for a knock's
   *  `contactRef`. */
  const enqueueContact = useCallback(
    async (input: Record<string, unknown>): Promise<string | null> => {
      const queue = queueRef.current;
      if (!queue) return null;
      const localId = newLocalId();
      await queue.enqueue(localId, { ...input, localId }, new Date().toISOString(), "ADD_CONTACT");
      await refreshCounts();
      if (online) void flush();
      return localId;
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
      const photos = photoStoreRef.current;
      if (!queue) return;
      // A discarded photo record leaves its bytes behind — free them too.
      const rec = await queue.get(localId);
      if (rec?.type === "DOOR_PHOTO" && photos) {
        await photos.remove((rec.payload as { blobKey?: string }).blobKey ?? localId);
      }
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
    enqueuePhoto,
    enqueueContact,
    flush,
    retryConflict,
    discardConflict,
    refresh: refreshCounts,
  };
}
