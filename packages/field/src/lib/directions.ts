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

/** "120 m" / "1.4 km" */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** "3 min" walking duration. */
export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  return `${min} min`;
}
