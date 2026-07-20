"use client";

// Single source of truth for per-turf offline-map downloads. The My turf card button, the
// walk-view OfflineMapsControl, and the installed app's background auto-downloader all talk
// to ONE manager keyed by turfId, so a turf's progress/tick is live no matter who started the
// download — a tap, the walk view, or the background loop converge on the same in-flight run
// and the same observable state.
//
// The download body is the old useTilePreCache.start logic, moved here and made subscribable.
// The networked plan/run steps are injected (TurfDownloadRunner) so the state machine is
// unit-testable without fetch/Cache Storage — mirroring map-cache's "pure tested, networked
// injected" split.

import {
  DEFAULT_ZOOM,
  downloadRegion,
  planRegionDownload,
  type DownloadPlan,
  type DownloadResult,
  type ZoomRange,
} from "./map-cache";
import { getManifest, putManifest, type TileManifest, type TileManifestStatus } from "./tile-cache-store";
import { requestPersistentStorage } from "./storage-persist";

export type TurfDownloadState = {
  status: TileManifestStatus;
  done: number;
  total: number;
  capped: boolean;
};

/** Stable shared reference for the untouched-turf case — so `useSyncExternalStore` never sees
 *  a fresh object (which would loop). Every started turf gets its own object in the map. */
export const IDLE_STATE: TurfDownloadState = Object.freeze({ status: "idle", done: 0, total: 0, capped: false });

/** The networked half, injected so the manager's state machine is testable with fakes. */
export interface TurfDownloadRunner {
  plan(geometry: GeoJSON.Geometry, zoom: ZoomRange, signal: AbortSignal): Promise<DownloadPlan>;
  run(urls: string[], opts: { signal: AbortSignal; onProgress: (done: number, total: number) => void }): Promise<DownloadResult>;
}

export interface TurfDownloadDeps {
  runner: TurfDownloadRunner;
  loadManifest: (turfId: string) => Promise<TileManifest | undefined>;
  saveManifest: (manifest: TileManifest) => Promise<void>;
  /** Best-effort durable-storage request before a download; optional (no-op in tests). */
  requestPersist?: () => Promise<unknown>;
  /** ISO timestamp source — injectable so tests are deterministic. */
  now?: () => string;
}

const PERSIST_EVERY = 25; // bound IDB writes during a long download

export class TurfDownloadManager {
  private states = new Map<string, TurfDownloadState>();
  private listeners = new Map<string, Set<() => void>>();
  private controllers = new Map<string, AbortController>();
  private inflight = new Map<string, Promise<void>>();
  private hydrated = new Set<string>();

  constructor(private readonly deps: TurfDownloadDeps) {}

  getState(turfId: string): TurfDownloadState {
    return this.states.get(turfId) ?? IDLE_STATE;
  }

  subscribe(turfId: string, cb: () => void): () => void {
    let set = this.listeners.get(turfId);
    if (!set) {
      set = new Set();
      this.listeners.set(turfId, set);
    }
    set.add(cb);
    return () => set!.delete(cb);
  }

  /** Seed a turf's state from its persisted manifest (running→idle, an interrupted download is
   *  never "still running"). Skips if the turf already has live state or a download is running. */
  async hydrate(turfId: string): Promise<void> {
    if (this.hydrated.has(turfId) || this.states.has(turfId) || this.inflight.has(turfId)) return;
    this.hydrated.add(turfId);
    const m = await this.deps.loadManifest(turfId);
    if (!m || this.states.has(turfId) || this.inflight.has(turfId)) return;
    this.replace(turfId, {
      status: m.status === "running" ? "idle" : m.status,
      done: m.done,
      total: m.total,
      capped: false,
    });
  }

  /** Start (or resume) a turf's download. If one is already in flight for this turf, returns
   *  that same promise — so concurrent callers (tap + background loop) never double-download. */
  downloadTurf(turfId: string, geometry: GeoJSON.Geometry, opts: { zoom?: ZoomRange } = {}): Promise<void> {
    const existing = this.inflight.get(turfId);
    if (existing) return existing;
    const promise = this.execute(turfId, geometry, opts.zoom ?? DEFAULT_ZOOM);
    this.inflight.set(turfId, promise);
    return promise;
  }

  cancel(turfId: string): void {
    this.controllers.get(turfId)?.abort();
  }

  private nowIso(): string {
    return this.deps.now ? this.deps.now() : new Date().toISOString();
  }

  private replace(turfId: string, next: TurfDownloadState): void {
    const prev = this.states.get(turfId);
    if (prev && prev.status === next.status && prev.done === next.done && prev.total === next.total && prev.capped === next.capped) {
      return; // no real change — don't churn subscribers
    }
    this.states.set(turfId, next);
    const set = this.listeners.get(turfId);
    if (set) for (const cb of set) cb();
  }

  private patch(turfId: string, patch: Partial<TurfDownloadState>): void {
    this.replace(turfId, { ...this.getState(turfId), ...patch });
  }

  private async execute(turfId: string, geometry: GeoJSON.Geometry, zoom: ZoomRange): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(turfId, controller);
    this.replace(turfId, { status: "running", done: 0, total: 0, capped: false });

    // Live locals so the catch block persists ACTUAL progress (state reads would be stale).
    let liveTotal = 0;
    let liveDone = 0;
    const persist = (status: TileManifestStatus) =>
      this.deps.saveManifest({
        turfId,
        total: liveTotal,
        done: liveDone,
        status,
        zoomMin: zoom.min,
        zoomMax: zoom.max,
        updatedAt: this.nowIso(),
      });

    try {
      await this.deps.requestPersist?.();
      const plan = await this.deps.runner.plan(geometry, zoom, controller.signal);
      liveTotal = plan.urls.length;
      this.patch(turfId, { total: liveTotal, capped: plan.capped });
      await persist("running");

      let lastPersist = 0;
      const result = await this.deps.runner.run(plan.urls, {
        signal: controller.signal,
        onProgress: (done, total) => {
          liveDone = done;
          liveTotal = total;
          this.patch(turfId, { done, total });
          if (done - lastPersist >= PERSIST_EVERY || done === total) {
            lastPersist = done;
            void persist(done === total ? "done" : "running");
          }
        },
      });

      // 404s (no-data tiles over water/edges) are expected — only real fetch failures block "done".
      const status: TileManifestStatus = result.failed === 0 ? "done" : "incomplete";
      liveDone = result.done;
      this.patch(turfId, { status, done: result.done });
      await persist(status);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const status: TileManifestStatus = aborted ? "cancelled" : "error";
      this.patch(turfId, { status });
      await persist(status);
    } finally {
      this.controllers.delete(turfId);
      this.inflight.delete(turfId);
    }
  }
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** The production singleton — real Mapbox plan/run + IDB manifest. Every consumer imports this. */
export const turfDownloadManager = new TurfDownloadManager({
  runner: {
    plan: (geometry, zoom, signal) => planRegionDownload(geometry, TOKEN, zoom, signal),
    run: (urls, opts) => downloadRegion(urls, opts),
  },
  loadManifest: getManifest,
  saveManifest: putManifest,
  requestPersist: requestPersistentStorage,
});
