"use client";

import { useTurfDownload } from "./use-turf-download";
import { DEFAULT_ZOOM, type ZoomRange } from "../lib/map-cache";
import type { TileManifestStatus } from "../lib/tile-cache-store";

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
 * Per-turf offline-map download. Thin wrapper over the shared turf-download manager (via
 * useTurfDownload) so the walk-view control, the My turf card button, and the installed app's
 * background auto-downloader all share ONE download + one live status per turf. The return
 * shape is unchanged, so `OfflineMapsControl` needs no edits.
 */
export function useTilePreCache(
  turfId: string | null | undefined,
  geometry: GeoJSON.Geometry | null | undefined,
  zoom: ZoomRange = DEFAULT_ZOOM,
): TilePreCacheState {
  return useTurfDownload(turfId, geometry, zoom);
}
