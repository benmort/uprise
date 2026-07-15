// Reverse-geocode a GPS coordinate to a short human place label, client-side via the public
// NEXT_PUBLIC_MAPBOX_TOKEN (same pattern as directions.ts). Returns null on any failure — no
// token, bad coords, network error, or no result — so the caller falls back gracefully.

const MAPBOX_GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

/**
 * A concise "street, suburb" label for `lat,lng` — e.g. "46 Simmons Street, Newtown" — so the field
 * app can tell the volunteer where it thinks they are. Trims the state/postcode/country off Mapbox's
 * full place name to keep it chip-sized. Null on any failure.
 */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url =
    `${MAPBOX_GEOCODE}/${lng},${lat}.json` +
    `?types=address,locality,place&limit=1&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: GeocodeFeature[] };
    const f = json.features?.[0];
    if (!f) return null;
    return labelFor(f);
  } catch {
    return null;
  }
}

type GeocodeFeature = {
  place_name?: string;
  place_type?: string[];
  text?: string;
  address?: string; // house number, for an address feature
  context?: Array<{ id?: string; text?: string }>;
};

/** Build a "street, suburb" label from a Mapbox feature's STRUCTURED fields (not the noisy full
 *  place_name, which jams state + postcode + country on the end). Street line = house number + road;
 *  suburb from the locality/place context. Falls back to the first two place_name segments. */
function labelFor(f: GeocodeFeature): string | null {
  const parts: string[] = [];
  if (f.text) parts.push(f.place_type?.includes("address") && f.address ? `${f.address} ${f.text}` : f.text);
  const suburb = f.context?.find((c) => c.id?.startsWith("locality") || c.id?.startsWith("place"))?.text;
  if (suburb && suburb !== parts[0]) parts.push(suburb);
  if (parts.length) return parts.join(", ");
  return f.place_name ? f.place_name.split(", ").slice(0, 2).join(", ") : null;
}
