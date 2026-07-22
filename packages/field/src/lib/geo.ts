// Dependency-free geo helpers for turf work. The full app also pulls in
// @turf/turf for richer geometry; these cover the two operations the volunteer
// flow needs offline: point-in-polygon (which turf a household falls in) and a
// bounding box (for the offline tile-pack download).

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
  geometry: { type: string; coordinates: unknown },
): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates as Polygon);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Polygon[]).some((poly) => pointInPolygon(point, poly));
  }
  return false;
}

/**
 * Closed outer ring [[lng,lat],…] for a server [w,s,e,n] bbox — the assignments /
 * recommended / self-serve lists ship a bbox instead of boundary GeoJSON, and this feeds
 * MapThumbnail (a pure SVG polygon) the rectangle to draw. Undefined for a missing or
 * malformed bbox so the thumbnail falls back to its stock shape.
 */
export function bboxRing(bbox: unknown): LngLat[] | undefined {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return undefined;
  }
  const [w, s, e, n] = bbox as [number, number, number, number];
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

/** Approximate metres between two points (equirectangular — fine at street scale). */
export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.sqrt(dLat * dLat + dLng * dLng) * 6371000;
}

/** Compass bearing (0–360°, 0 = north) from `a` to `b` — the street-view camera heading. */
export function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const φ1 = a.lat * (Math.PI / 180);
  const φ2 = b.lat * (Math.PI / 180);
  const Δλ = (b.lng - a.lng) * (Math.PI / 180);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Bearing a→b, but null unless they're at least `minMetres` apart — GPS jitter while
 *  standing still must not spin the follow camera. */
export function bearingIfMoved(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  minMetres = 5,
): number | null {
  return metresBetween(a, b) >= minMetres ? bearingBetween(a, b) : null;
}

export type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Bounding box of a set of points — used to enumerate offline tiles for a turf. */
export function boundingBox(points: LngLat[]): BBox | null {
  if (points.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}
