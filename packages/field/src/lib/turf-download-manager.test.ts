import { describe, expect, it, vi } from "vitest";
import { TurfDownloadManager, type TurfDownloadRunner } from "./turf-download-manager";
import type { DownloadPlan, DownloadResult } from "./map-cache";
import type { TileManifest } from "./tile-cache-store";

const GEOM = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } as GeoJSON.Geometry;

function plan(urls: string[], capped = false): DownloadPlan {
  return { urls, assets: [], tileUrls: urls, tileCount: urls.length, capped };
}
function result(over: Partial<DownloadResult> = {}): DownloadResult {
  return { done: 0, total: 0, cached: 0, empty: 0, failed: 0, ...over };
}

/** Build a manager with an injected runner + in-memory manifest store. */
function makeManager(runner: TurfDownloadRunner) {
  const saved: TileManifest[] = [];
  const store = new Map<string, TileManifest>();
  const mgr = new TurfDownloadManager({
    runner,
    loadManifest: async (id) => store.get(id),
    saveManifest: async (m) => {
      saved.push(m);
      store.set(m.turfId, m);
    },
    now: () => "2026-01-01T00:00:00.000Z",
  });
  return { mgr, saved, store };
}

describe("TurfDownloadManager", () => {
  it("runs plan→download and lands on done, persisting a done manifest", async () => {
    const runner: TurfDownloadRunner = {
      plan: async () => plan(["a", "b", "c"]),
      run: async (urls, { onProgress }) => {
        onProgress(3, 3);
        return result({ done: 3, total: 3 });
      },
    };
    const { mgr, saved } = makeManager(runner);
    await mgr.downloadTurf("t1", GEOM);
    expect(mgr.getState("t1")).toMatchObject({ status: "done", done: 3, total: 3 });
    expect(saved.at(-1)).toMatchObject({ turfId: "t1", status: "done", done: 3, total: 3 });
  });

  it("marks incomplete when some tiles failed", async () => {
    const runner: TurfDownloadRunner = {
      plan: async () => plan(["a", "b"]),
      run: async () => result({ done: 2, total: 2, failed: 1 }),
    };
    const { mgr } = makeManager(runner);
    await mgr.downloadTurf("t1", GEOM);
    expect(mgr.getState("t1").status).toBe("incomplete");
  });

  it("dedupes concurrent downloads to a single in-flight run", async () => {
    let planCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const runner: TurfDownloadRunner = {
      plan: async () => {
        planCalls += 1;
        return plan(["a"]);
      },
      run: async () => {
        await gate;
        return result({ done: 1, total: 1 });
      },
    };
    const { mgr } = makeManager(runner);
    const p1 = mgr.downloadTurf("t1", GEOM);
    const p2 = mgr.downloadTurf("t1", GEOM);
    expect(p1).toBe(p2); // same in-flight promise
    release();
    await Promise.all([p1, p2]);
    expect(planCalls).toBe(1);
  });

  it("notifies subscribers on state transitions with a stable idle ref beforehand", async () => {
    const runner: TurfDownloadRunner = {
      plan: async () => plan(["a"]),
      run: async (_u, { onProgress }) => {
        onProgress(1, 1);
        return result({ done: 1, total: 1 });
      },
    };
    const { mgr } = makeManager(runner);
    const cb = vi.fn();
    mgr.subscribe("t1", cb);
    expect(mgr.getState("t1")).toBe(mgr.getState("t1")); // stable ref while idle
    await mgr.downloadTurf("t1", GEOM);
    expect(cb).toHaveBeenCalled();
    expect(mgr.getState("t1").status).toBe("done");
  });

  it("cancel aborts the run and lands on cancelled", async () => {
    const runner: TurfDownloadRunner = {
      plan: async () => plan(["a", "b"]),
      run: (_urls, { signal }) =>
        new Promise((_res, rej) => {
          const fail = () => rej(new DOMException("Aborted", "AbortError"));
          if (signal.aborted) return fail(); // cancel may land before run is even reached
          signal.addEventListener("abort", fail);
        }),
    };
    const { mgr } = makeManager(runner);
    const p = mgr.downloadTurf("t1", GEOM);
    mgr.cancel("t1");
    await p;
    expect(mgr.getState("t1").status).toBe("cancelled");
  });

  it("lands on error when plan throws a non-abort error", async () => {
    const runner: TurfDownloadRunner = {
      plan: async () => {
        throw new Error("boom");
      },
      run: async () => result(),
    };
    const { mgr } = makeManager(runner);
    await mgr.downloadTurf("t1", GEOM);
    expect(mgr.getState("t1").status).toBe("error");
  });

  it("hydrate seeds from a saved manifest and maps running→idle", async () => {
    const runner: TurfDownloadRunner = { plan: async () => plan([]), run: async () => result() };
    const { mgr, store } = makeManager(runner);
    store.set("t1", { turfId: "t1", total: 10, done: 4, status: "running", zoomMin: 13, zoomMax: 16, updatedAt: "x" });
    store.set("t2", { turfId: "t2", total: 8, done: 8, status: "done", zoomMin: 13, zoomMax: 16, updatedAt: "x" });
    await mgr.hydrate("t1");
    await mgr.hydrate("t2");
    expect(mgr.getState("t1")).toMatchObject({ status: "idle", done: 4, total: 10 });
    expect(mgr.getState("t2")).toMatchObject({ status: "done", done: 8, total: 8 });
  });
});
