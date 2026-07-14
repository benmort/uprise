import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bboxOfGeometry,
  fillTemplate,
  latToTileY,
  lngToTileX,
  planRegionDownload,
  tilesForBbox,
  verifyRegionCached,
  type Bbox,
} from "./map-cache";

describe("tile math", () => {
  it("maps lng/lat 0,0 to the expected tile at z1", () => {
    expect(lngToTileX(0, 1)).toBe(1);
    expect(latToTileY(0, 1)).toBe(1);
  });

  it("places the prime meridian/equator at tile 0 for z0", () => {
    expect(lngToTileX(0, 0)).toBe(0);
    expect(latToTileY(0, 0)).toBe(0);
  });
});

describe("tilesForBbox", () => {
  it("returns a single tile for a degenerate bbox at one zoom", () => {
    const tiles = tilesForBbox([0, 0, 0, 0], { min: 1, max: 1 });
    expect(tiles).toEqual([{ z: 1, x: 1, y: 1 }]);
  });

  it("adds more tiles as the zoom range widens", () => {
    const bbox: Bbox = [150.9, -33.9, 151.3, -33.7]; // inner Sydney
    const oneLevel = tilesForBbox(bbox, { min: 13, max: 13 });
    const threeLevels = tilesForBbox(bbox, { min: 13, max: 15 });
    expect(threeLevels.length).toBeGreaterThan(oneLevel.length);
  });

  it("clamps tile indices to valid range and counts the full grid", () => {
    const tiles = tilesForBbox([-180, -85, 180, 85], { min: 1, max: 1 });
    // Whole world at z1 → the full 2×2 grid.
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(1);
    }
  });

  it("grid size equals (xspan)·(yspan) at a single zoom", () => {
    const bbox: Bbox = [150.9, -33.9, 151.3, -33.7];
    const z = 14;
    const xSpan = lngToTileX(bbox[2], z) - lngToTileX(bbox[0], z) + 1;
    const ySpan = latToTileY(bbox[1], z) - latToTileY(bbox[3], z) + 1;
    expect(tilesForBbox(bbox, { min: z, max: z })).toHaveLength(xSpan * ySpan);
  });
});

describe("bboxOfGeometry", () => {
  it("computes the bbox of a polygon", () => {
    const geometry: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[150, -34], [151, -34], [151, -33], [150, -33], [150, -34]]],
    };
    expect(bboxOfGeometry(geometry)).toEqual([150, -34, 151, -33]);
  });

  it("returns null for missing geometry", () => {
    expect(bboxOfGeometry(null)).toBeNull();
    expect(bboxOfGeometry(undefined)).toBeNull();
  });
});

describe("fillTemplate", () => {
  it("substitutes z/x/y", () => {
    expect(fillTemplate("https://t/{z}/{x}/{y}.pbf", { z: 14, x: 1, y: 2 })).toBe(
      "https://t/14/1/2.pbf",
    );
  });
});

// ── Networked helpers (mocked fetch + Cache Storage) ──────────────────────────

const jsonRes = (body: unknown) => ({ json: async () => body }) as unknown as Response;

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error test cleanup
  delete globalThis.caches;
});

describe("planRegionDownload — both themes", () => {
  it("resolves both styles, de-dupes the shared tiles, and keeps both styles' assets", async () => {
    // Both styles share one vector source (same tile template) but differ in sprite.
    global.fetch = vi.fn(async (url: unknown) => {
      const u = String(url);
      const sprite = u.includes("dark-v11") ? "mapbox://sprites/mapbox/dark-v11" : "mapbox://sprites/mapbox/streets-v12";
      return jsonRes({
        sources: { composite: { tiles: ["https://tiles/{z}/{x}/{y}.mvt"] } },
        sprite,
        glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
        layers: [],
      });
    }) as unknown as typeof fetch;

    const geometry: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[151.2, -33.87], [151.21, -33.87], [151.21, -33.86], [151.2, -33.86], [151.2, -33.87]]],
    };
    const plan = await planRegionDownload(geometry, "tok", { min: 14, max: 14 });

    // Two style JSONs fetched (one per theme).
    const styleAssets = plan.assets.filter((a) => a.includes("/styles/v1/"));
    expect(styleAssets.some((a) => a.includes("streets-v12"))).toBe(true);
    expect(styleAssets.some((a) => a.includes("dark-v11"))).toBe(true);
    // Both sprites present (they differ per theme).
    expect(plan.assets.some((a) => a.includes("streets-v12/sprite"))).toBe(true);
    expect(plan.assets.some((a) => a.includes("dark-v11/sprite"))).toBe(true);
    // The shared tile template is expanded ONCE despite both styles listing it.
    expect(plan.tileUrls.length).toBe(plan.tileCount);
    expect(new Set(plan.tileUrls).size).toBe(plan.tileUrls.length);
    expect(plan.urls.length).toBe(plan.assets.length + plan.tileUrls.length);
  });

  it("returns an empty plan with no token or geometry", async () => {
    expect(await planRegionDownload(null, "tok")).toMatchObject({ urls: [], tileUrls: [], assets: [] });
  });
});

describe("verifyRegionCached", () => {
  // A fake Cache Storage holding an exact set of URLs.
  const withCache = (present: Set<string>) => {
    globalThis.caches = {
      open: async () => ({ match: async (url: string) => (present.has(url) ? new Response("x") : undefined) }),
    } as unknown as CacheStorage;
  };

  it("passes only when every asset + the tile sample are present", async () => {
    const assets = ["style.json", "sprite.png"];
    const tiles = Array.from({ length: 100 }, (_v, i) => `tile/${i}`);
    withCache(new Set([...assets, ...tiles]));
    expect(await verifyRegionCached(assets, tiles, 40)).toBe(true);
  });

  it("fails when an asset is missing (assets are always fully checked)", async () => {
    const assets = ["style.json", "sprite.png"];
    const tiles = Array.from({ length: 100 }, (_v, i) => `tile/${i}`);
    withCache(new Set([assets[0], ...tiles])); // sprite.png missing
    expect(await verifyRegionCached(assets, tiles, 40)).toBe(false);
  });

  it("samples tiles — a gap OUTSIDE the stride doesn't fail the check", async () => {
    const assets = ["style.json"];
    const tiles = Array.from({ length: 100 }, (_v, i) => `tile/${i}`);
    // stride = floor(100/40) = 2 → sampled indices 0,2,4,…; index 1 is never checked.
    const present = new Set([...assets, ...tiles.filter((_t, i) => i !== 1)]);
    withCache(present);
    expect(await verifyRegionCached(assets, tiles, 40)).toBe(true);
  });

  it("fails when a SAMPLED tile is missing", async () => {
    const assets = ["style.json"];
    const tiles = Array.from({ length: 100 }, (_v, i) => `tile/${i}`);
    const present = new Set([...assets, ...tiles.filter((_t, i) => i !== 0)]); // index 0 is sampled
    withCache(present);
    expect(await verifyRegionCached(assets, tiles, 40)).toBe(false);
  });
});
