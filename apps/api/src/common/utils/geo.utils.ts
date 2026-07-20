// Server-side port of apps/admin/src/lib/canvass/geo.ts — dependency-free
// point-in-polygon for re-bucketing contacts into a turf (which household
// falls inside a drawn turf boundary). GeoJSON [lng, lat] order throughout.

export type LngLat = [number, number]; // [lng, lat], GeoJSON order
export type Ring = LngLat[];
export type Polygon = Ring[]; // [outerRing, ...holes]

/** Ray-casting point-in-polygon over a single ring. */
function pointInRing(point: LngLat, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Point-in-polygon honouring holes: inside outer ring and outside every hole. */
export function pointInPolygon(point: LngLat, polygon: Polygon): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h += 1) {
    if (pointInRing(point, polygon[h])) return false;
  }
  return true;
}

/** Accepts a GeoJSON Polygon or MultiPolygon geometry object. */
export function pointInGeometry(
  point: LngLat,
  geometry: { type?: string; coordinates?: unknown } | null | undefined,
): boolean {
  if (!geometry || typeof geometry.type !== "string") return false;
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates as Polygon);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Polygon[]).some((poly) => pointInPolygon(point, poly));
  }
  return false;
}

/** [west, south, east, north] — the slim bounds list endpoints ship instead of full GeoJSON. */
export type GeoBBox = [number, number, number, number];

/**
 * Bounding box of a GeoJSON geometry's coordinates ([w,s,e,n]), or null when there are
 * none. Walks any Polygon/MultiPolygon nesting depth, so it doesn't care which of the
 * two turf geometry shapes it's given. Pure TS over the JSON source of truth — no
 * PostGIS round-trip, and immune to a missing `geom` mirror.
 */
export function geometryBbox(geometry: unknown): GeoBBox | null {
  const g = geometry as { coordinates?: unknown } | null | undefined;
  if (!g || typeof g !== "object" || g.coordinates === undefined) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      const [lng, lat] = node as [number, number];
      if (lng < west) west = lng;
      if (lat < south) south = lat;
      if (lng > east) east = lng;
      if (lat > north) north = lat;
      return;
    }
    for (const child of node) walk(child);
  };
  walk(g.coordinates);
  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  return [west, south, east, north];
}
