"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { IDLE_STATE, turfDownloadManager } from "../lib/turf-download-manager";
import type { ZoomRange } from "../lib/map-cache";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/**
 * Bind a component to the shared turf-download manager for one turf. Whoever starts the
 * download — this component's Start button, the walk-view control, or the background
 * auto-downloader — updates the same manager state, so every mounted view of this turf shows
 * the same live progress/tick. Returns the exact shape `useTilePreCache` did, so existing
 * consumers (OfflineMapsControl) are unchanged.
 */
export function useTurfDownload(
  turfId: string | null | undefined,
  geometry: GeoJSON.Geometry | null | undefined,
  zoom?: ZoomRange,
) {
  const key = turfId ?? "";
  const state = useSyncExternalStore(
    useCallback((cb) => turfDownloadManager.subscribe(key, cb), [key]),
    () => (key ? turfDownloadManager.getState(key) : IDLE_STATE),
    () => IDLE_STATE, // SSR snapshot
  );

  useEffect(() => {
    if (key) void turfDownloadManager.hydrate(key);
  }, [key]);

  const start = useCallback(() => {
    if (turfId && geometry) void turfDownloadManager.downloadTurf(turfId, geometry, zoom ? { zoom } : {});
  }, [turfId, geometry, zoom]);

  const cancel = useCallback(() => {
    if (turfId) turfDownloadManager.cancel(turfId);
  }, [turfId]);

  return {
    available: Boolean(TOKEN && turfId && geometry),
    status: state.status,
    done: state.done,
    total: state.total,
    capped: state.capped,
    start,
    cancel,
  };
}
