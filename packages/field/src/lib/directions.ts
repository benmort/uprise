// Walking turn-by-turn directions via the Mapbox Directions API (walking profile).
// Client-side, using the public NEXT_PUBLIC_MAPBOX_TOKEN — consistent with the rest
// of the field app's Mapbox usage (no backend proxy). The Walk-view Map tab draws
// `geometry` as a route line to the next stop and lists `steps`. Network-only: the
// caller must guard on online status (the map is a download-required enhancement).

export type LatLng = { lat: number; lng: number };

export type DirectionStep = {
  instruction: string;
  distanceM: number;
};

export type WalkingDirections = {
  geometry: GeoJSON.LineString;
  steps: DirectionStep[];
  distanceM: number;
  durationS: number;
};

const MAPBOX_DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox/walking";

/** Round a coordinate to ~1m so tiny GPS jitter doesn't refetch the route. */
export function coordKey(p: LatLng): string {
  return `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/**
 * Fetch a walking route from `from` to `to`. Returns null on any failure (no token,
 * offline, no route, HTTP error) so the caller can fall back to pins + the address.
 */
export async function fetchWalkingDirections(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<WalkingDirections | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url =
    `${MAPBOX_DIRECTIONS}/${coords}` +
    `?steps=true&geometries=geojson&overview=full&access_token=${token}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: GeoJSON.LineString;
        legs?: Array<{ steps?: Array<{ maneuver?: { instruction?: string }; distance?: number }> }>;
      }>;
    };
    const route = json.routes?.[0];
    if (!route) return null;
    const steps: DirectionStep[] = (route.legs ?? []).flatMap((leg) =>
      (leg.steps ?? []).map((s) => ({
        instruction: s.maneuver?.instruction ?? "",
        distanceM: Math.round(s.distance ?? 0),
      })),
    );
    return {
      geometry: route.geometry,
      steps,
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
    };
  } catch {
    return null;
  }
}

/** The Directions API's hard limit: 25 coordinates per request. */
const MAX_WAYPOINTS = 25;

/**
 * The street-following walk line through EVERY point, in order — the client-side twin of
 * the server's windowed `routeLegsAndGeometry`, on the public token. Used when the server
 * walk-route didn't deliver geometry, so the map's full-route line still follows footpaths
 * instead of drawing beelines. Windows of 25 coordinates overlapping by one; each window's
 * first geometry point after the first window duplicates the seam and is dropped. Null on
 * any failure (no token, <2 points, any window failing) — a partial line must not
 * masquerade as the route; the caller falls back to the dashed beeline.
 */
export async function fetchWalkingRouteGeometry(
  points: LatLng[],
  signal?: AbortSignal,
): Promise<GeoJSON.LineString | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  const located = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (located.length < 2) return null;

  const windows: LatLng[][] = [];
  for (let i = 0; i < located.length - 1; i += MAX_WAYPOINTS - 1) {
    windows.push(located.slice(i, i + MAX_WAYPOINTS));
  }

  const coordinates: [number, number][] = [];
  for (const window of windows) {
    const coords = window.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${MAPBOX_DIRECTIONS}/${coords}?overview=full&geometries=geojson&access_token=${token}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const json = (await res.json()) as { routes?: Array<{ geometry?: GeoJSON.LineString }> };
      const line = json.routes?.[0]?.geometry;
      if (line?.type !== "LineString" || !Array.isArray(line.coordinates) || line.coordinates.length < 2) {
        return null;
      }
      const pts = coordinates.length ? line.coordinates.slice(1) : line.coordinates;
      coordinates.push(...(pts as [number, number][]));
    } catch {
      return null;
    }
  }
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

/** "120 m" / "1.4 km" */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** "3 min" walking duration. */
export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return `${min} min`;
}
