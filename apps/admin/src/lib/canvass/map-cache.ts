"use client";

// True per-region offline map pre-cache.
//
// mapbox-gl (vector) has no official web offline API, so we guarantee offline by
// fetching the exact resources GL JS will request for a turf — the style JSON, its
// vector-tile pyramid over the turf bbox, sprite and glyph ranges — so they land in
// the "mapbox" CacheFirst service-worker cache (see next.config.mjs). When the
// volunteer later opens the map offline, GL JS's own requests hit that cache.
//
// The pure geometry/URL helpers are unit-tested; the networked download path is not.

export type TileCoord = { z: number; x: number; y: number };
export type ZoomRange = { min: number; max: number };
export type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/** Walking-canvass default: street block (13) down to building level (16). */
export const DEFAULT_ZOOM: ZoomRange = { min: 13, max: 16 };

/** Safety cap so a huge turf can't enqueue an unbounded download. */
export const MAX_TILES = 20000;

export const MAPBOX_CACHE_NAME = "mapbox";
const STYLE = "mapbox/streets-v12"; // must match TurfMap's mapStyle
const API = "https://api.mapbox.com";

// ─── Pure geometry / tile math ───────────────────────────────────────────────

export function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Bounding box of any GeoJSON geometry, walking its coordinate arrays. */
export function bboxOfGeometry(geometry: GeoJSON.Geometry | null | undefined): Bbox | null {
  if (!geometry || !("coordinates" in geometry)) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lng, lat] = node as number[];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of node) walk(child);
  };
  walk((geometry as { coordinates: unknown }).coordinates);
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/** Every tile covering the bbox across the zoom range (inclusive). */
export function tilesForBbox(bbox: Bbox, zoom: ZoomRange = DEFAULT_ZOOM): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let z = zoom.min; z <= zoom.max; z += 1) {
    const n = 2 ** z;
    const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
    const xMin = clamp(lngToTileX(bbox[0], z));
    const xMax = clamp(lngToTileX(bbox[2], z));
    // Tile Y grows southward: maxLat → smaller y, minLat → larger y.
    const yMin = clamp(latToTileY(bbox[3], z));
    const yMax = clamp(latToTileY(bbox[1], z));
    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/** Substitute {z}/{x}/{y} into a tile template URL. */
export function fillTemplate(template: string, t: TileCoord): string {
  return template
    .replace("{z}", String(t.z))
    .replace("{x}", String(t.x))
    .replace("{y}", String(t.y));
}

// ─── Style resolution (networked) ────────────────────────────────────────────

type StyleResources = {
  tileTemplates: string[]; // vector source tile URLs with {z}/{x}/{y}
  assets: string[]; // style JSON, sprite, glyph ranges — fetched as-is
};

function tokenQ(token: string): string {
  return `access_token=${encodeURIComponent(token)}`;
}

/** Resolve a Mapbox style into the concrete URLs GL JS will request for it. */
async function resolveStyleResources(token: string, signal?: AbortSignal): Promise<StyleResources> {
  const styleUrl = `${API}/styles/v1/${STYLE}?${tokenQ(token)}`;
  const style = (await (await fetch(styleUrl, { signal })).json()) as {
    sources?: Record<string, { url?: string; tiles?: string[] }>;
    sprite?: string;
    glyphs?: string;
    layers?: Array<{ layout?: { "text-font"?: string[] } }>;
  };
  const assets: string[] = [styleUrl];
  const tileTemplates: string[] = [];

  // Vector tile sources: a mapbox:// url resolves to a TileJSON we read .tiles[] from.
  for (const source of Object.values(style.sources ?? {})) {
    if (Array.isArray(source.tiles)) {
      tileTemplates.push(...source.tiles);
    } else if (source.url?.startsWith("mapbox://")) {
      const id = source.url.replace("mapbox://", "");
      const tjUrl = `${API}/v4/${id}.json?secure&${tokenQ(token)}`;
      assets.push(tjUrl);
      try {
        const tj = (await (await fetch(tjUrl, { signal })).json()) as { tiles?: string[] };
        if (Array.isArray(tj.tiles)) tileTemplates.push(...tj.tiles);
      } catch {
        /* a missing source just means fewer tiles pre-cached, not a failure */
      }
    }
  }

  // Sprite (icons) — 1x and 2x, json + png.
  if (style.sprite) {
    const base = style.sprite.startsWith("mapbox://sprites/")
      ? `${API}/styles/v1/${style.sprite.replace("mapbox://sprites/", "")}/sprite`
      : style.sprite;
    for (const variant of ["", "@2x"]) {
      assets.push(`${base}${variant}.json?${tokenQ(token)}`, `${base}${variant}.png?${tokenQ(token)}`);
    }
  }

  // Glyphs — the Latin + extended ranges cover AU street labels.
  if (style.glyphs) {
    const fontstacks = new Set<string>();
    for (const layer of style.layers ?? []) {
      const font = layer.layout?.["text-font"];
      if (Array.isArray(font) && font.length) fontstacks.add(font.join(","));
    }
    if (fontstacks.size === 0) fontstacks.add("DIN Pro Regular,Arial Unicode MS Regular");
    const tmpl = style.glyphs.startsWith("mapbox://fonts/")
      ? `${API}/fonts/v1/${style.glyphs.replace("mapbox://fonts/", "")}`
      : style.glyphs;
    for (const stack of fontstacks) {
      for (const range of ["0-255", "256-511"]) {
        assets.push(
          tmpl
            .replace("{fontstack}", encodeURIComponent(stack))
            .replace("{range}", range) + `?${tokenQ(token)}`,
        );
      }
    }
  }

  return { tileTemplates, assets };
}

// ─── Download orchestration ──────────────────────────────────────────────────

export type DownloadPlan = { urls: string[]; tileCount: number; capped: boolean };

/** Build the full list of URLs to fetch for a turf region. */
export async function planRegionDownload(
  turfGeometry: GeoJSON.Geometry | null | undefined,
  token: string,
  zoom: ZoomRange = DEFAULT_ZOOM,
  signal?: AbortSignal,
): Promise<DownloadPlan> {
  const bbox = bboxOfGeometry(turfGeometry);
  if (!bbox || !token) return { urls: [], tileCount: 0, capped: false };

  let tiles = tilesForBbox(bbox, zoom);
  const capped = tiles.length > MAX_TILES;
  if (capped) tiles = tiles.slice(0, MAX_TILES);

  const { tileTemplates, assets } = await resolveStyleResources(token, signal);
  const tileUrls: string[] = [];
  for (const template of tileTemplates) {
    for (const t of tiles) tileUrls.push(fillTemplate(template, t));
  }
  // De-dupe (multiple templates rarely overlap, but be safe).
  const urls = Array.from(new Set([...assets, ...tileUrls]));
  return { urls, tileCount: tiles.length, capped };
}

/** True if every URL is already in the mapbox cache (region fully downloaded). */
export async function isRegionCached(urls: string[]): Promise<boolean> {
  if (typeof caches === "undefined" || urls.length === 0) return false;
  const cache = await caches.open(MAPBOX_CACHE_NAME);
  for (const url of urls) {
    if (!(await cache.match(url))) return false;
  }
  return true;
}

/**
 * Fetch every URL (skipping any already cached, so a resumed download is cheap),
 * letting the CacheFirst service worker populate the mapbox cache. Concurrency-
 * capped; reports progress after each completion. Returns the number fetched.
 */
export async function downloadRegion(
  urls: string[],
  opts: { concurrency?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ done: number; total: number }> {
  const concurrency = opts.concurrency ?? 6;
  const total = urls.length;
  let done = 0;
  let cursor = 0;
  const cache = typeof caches !== "undefined" ? await caches.open(MAPBOX_CACHE_NAME) : null;

  const worker = async (): Promise<void> => {
    while (cursor < urls.length) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const url = urls[cursor];
      cursor += 1;
      try {
        // Skip if the SW cache already holds it (resume). Otherwise fetch — the
        // SW's CacheFirst rule stores the response (opaque responses included).
        if (!cache || !(await cache.match(url))) {
          await fetch(url, { signal: opts.signal, mode: "cors" }).catch(() =>
            fetch(url, { signal: opts.signal, mode: "no-cors" }),
          );
        }
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        // A single failed tile shouldn't abort the whole region.
      } finally {
        done += 1;
        opts.onProgress?.(done, total);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  return { done, total };
}
