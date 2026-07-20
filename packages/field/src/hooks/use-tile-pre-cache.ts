"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_ZOOM,
  downloadRegion,
  planRegionDownload,
  type ZoomRange,
} from "../lib/map-cache";
import { getManifest, putManifest, type TileManifestStatus } from "../lib/tile-cache-store";
import { requestPersistentStorage } from "../lib/storage-persist";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type TilePreCacheState = {
  /** Whether offline map download is possible (token + geometry present). */
  available: boolean;
  status: TileManifestStatus;
  done: number;
  total: number;
  /** Tile count exceeded the safety cap — only the first MAX_TILES were queued. */
  capped: boolean;
  start: () => void;
  cancel: () => void;
};

/**
 * Drives a per-turf offline-map download: plans the region's URLs, fetches them
 * into the service-worker cache with live progress, and persists a manifest so
 * the status survives reloads and a partial download can resume.
 */
export function useTilePreCache(
  turfId: string | null | undefined,
  geometry: GeoJSON.Geometry | null | undefined,
  zoom: ZoomRange = DEFAULT_ZOOM,
): TilePreCacheState {
  const [status, setStatus] = useState<TileManifestStatus>("idle");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [capped, setCapped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const available = Boolean(TOKEN && turfId && geometry);

  // Restore prior download state for this turf.
  useEffect(() => {
    if (!turfId) return;
    let alive = true;
    void getManifest(turfId).then((m) => {
      if (!alive || !m) return;
      setStatus(m.status === "running" ? "idle" : m.status);
      setDone(m.done);
      setTotal(m.total);
    });
    return () => {
      alive = false;
    };
  }, [turfId]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    if (!turfId || !geometry || !TOKEN || status === "running") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("running");
    setDone(0);

    void (async () => {
      // Track live progress in locals so the catch block persists the ACTUAL progress
      // on error — reading the `done`/`total` state here would capture the stale values
      // from when start() was called (the classic stale-closure trap).
      let liveTotal = 0;
      let liveDone = 0;
      // A download is exactly when durable storage matters — ask the OS not to evict the
      // pack we're about to write. Best-effort; never blocks the download.
      void requestPersistentStorage();
      try {
        const plan = await planRegionDownload(geometry, TOKEN, zoom, controller.signal);
        liveTotal = plan.urls.length;
        setCapped(plan.capped);
        setTotal(plan.urls.length);
        await putManifest({
          turfId,
          total: plan.urls.length,
          done: 0,
          status: "running",
          zoomMin: zoom.min,
          zoomMax: zoom.max,
          updatedAt: new Date().toISOString(),
        });

        let lastPersist = 0;
        const result = await downloadRegion(plan.urls, {
          signal: controller.signal,
          onProgress: (d, t) => {
            liveDone = d;
            liveTotal = t;
            setDone(d);
            // Persist roughly every 25 tiles to bound IDB writes.
            if (d - lastPersist >= 25 || d === t) {
              lastPersist = d;
              void putManifest({
                turfId,
                total: t,
                done: d,
                status: d === t ? "done" : "running",
                zoomMin: zoom.min,
                zoomMax: zoom.max,
                updatedAt: new Date().toISOString(),
              });
            }
          },
        });
        // Complete unless a fetch actually FAILED (network/CORS) — those are retryable. Tiles
        // that 404 (no data over water / map edges) are expected and must NOT block "done":
        // downloadRegion cached every response it received, so the pack is as complete as the
        // data allows. (The old check verified 100% of a tile sample, which the inevitable
        // no-data 404s failed every time → a permanent false "some tiles didn't save".)
        const finalStatus: TileManifestStatus = result.failed === 0 ? "done" : "incomplete";
        setStatus(finalStatus);
        setDone(result.done);
        void putManifest({
          turfId,
          total: liveTotal,
          done: result.done,
          status: finalStatus,
          zoomMin: zoom.min,
          zoomMax: zoom.max,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        setStatus(aborted ? "cancelled" : "error");
        void putManifest({
          turfId,
          total: liveTotal,
          done: liveDone,
          status: aborted ? "cancelled" : "error",
          zoomMin: zoom.min,
          zoomMax: zoom.max,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        abortRef.current = null;
      }
    })();
  }, [turfId, geometry, zoom, status]);

  return { available, status, done, total, capped, start, cancel };
}
