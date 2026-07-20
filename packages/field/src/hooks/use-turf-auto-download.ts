"use client";

import { useEffect } from "react";
import { getCanvassAssignment, getCanvassAssignments } from "../api";
import { getManifest } from "../lib/tile-cache-store";
import { turfDownloadManager } from "../lib/turf-download-manager";
import { writeEntry } from "../lib/use-api-cache";
import { isFastConnection } from "../lib/connection";
import { useOnlineStatus } from "./use-online-status";
import { useIsInstalled } from "./use-is-installed";

// Once per full page load (module-level, survives remounts). We only latch once the run
// actually starts, so a first render that's offline/not-installed doesn't permanently disable it.
let sessionStarted = false;

/** Test-only reset of the once-per-session latch. */
export function __resetAutoDownload(): void {
  sessionStarted = false;
}

/**
 * Installed-app background pre-fetch. When the field PWA is running standalone, online, on a
 * fast/unmetered connection, and knows the volunteer, it pulls each assigned turf down for
 * offline use once per session: warms the full per-turf payload (so the door list works with no
 * signal) and downloads its map pack via the shared manager (so the My turf card shows the live
 * spinner then tick). Sequential — one turf at a time — to bound bandwidth and battery.
 */
export function useTurfAutoDownload(volunteerId: string | null): void {
  const online = useOnlineStatus();
  const installed = useIsInstalled();

  useEffect(() => {
    if (sessionStarted || !volunteerId || !online || !installed || !isFastConnection()) return;
    sessionStarted = true;
    let cancelled = false;
    void (async () => {
      const list = await getCanvassAssignments(volunteerId);
      if (!list.ok) return;
      for (const a of list.data) {
        if (cancelled) return;
        // Warm the full per-turf payload into the SAME cache key useAssignment reads, so opening
        // the turf offline resolves its door list from the durable cache.
        const full = await getCanvassAssignment(a.turfId, volunteerId);
        if (full.ok) {
          writeEntry(`/canvass/assignments/${encodeURIComponent(a.turfId)}?volunteerId=${volunteerId}`, full.data);
        }
        const geometry = a.turf.geometry as GeoJSON.Geometry | undefined;
        if (!geometry) continue;
        const manifest = await getManifest(a.turfId);
        if (manifest?.status === "done") continue; // already saved — skip
        await turfDownloadManager.downloadTurf(a.turfId, geometry); // sequential
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [volunteerId, online, installed]);
}
