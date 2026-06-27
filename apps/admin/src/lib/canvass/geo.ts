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
