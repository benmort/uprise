/**
 * Mapbox forward-geocoding for the address forms – turns what someone types into "Address Line 1"
 * into a picklist of real addresses, and a picked suggestion into the structured parts (suburb,
 * city, state, postcode, country) the rest of the form needs.
 *
 * Client-side against the public NEXT_PUBLIC_MAPBOX_TOKEN, the same pattern as the canvass geo
 * panels (`components/canvass/geo-panels/addresses-panel.tsx`) and `@uprise/field`'s geocode.
 */

const MAPBOX_GEOCODE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/** Below this the picklist stays closed – shorter queries return noise. */
export const MIN_ADDRESS_QUERY = 3;

/** ISO alpha-2 → the country `<select>` option values used by the address forms. */
const COUNTRY_BY_CODE: Record<string, string> = {
  au: 'australia',
  us: 'america',
  gb: 'england',
  nz: 'new-zealand',
  ca: 'canada',
  de: 'germany',
  fr: 'france',
  jp: 'japan',
};

const CODE_BY_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_BY_CODE).map(([code, value]) => [value, code])
);

/** The form's country option for an ISO code (`"au"` → `"australia"`), or `""` when unmapped. */
export function countryForIsoCode(code: string | undefined): string {
  return COUNTRY_BY_CODE[(code ?? '').toLowerCase()] ?? '';
}

/** The ISO code for a form country option (`"australia"` → `"au"`), or `""` when unmapped. */
export function isoCodeForCountry(country: string | undefined): string {
  return CODE_BY_COUNTRY[(country ?? '').toLowerCase()] ?? '';
}

/** One row of the address picklist – the street line plus the parts it fills in on pick. */
export interface AddressSuggestion {
  id: string;
  /** Street line, e.g. "12 Glebe Point Road" – what Address Line 1 becomes. */
  line1: string;
  /** The rest of the place name, e.g. "Glebe, New South Wales 2037, Australia". */
  context: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  /** Country `<select>` option value (e.g. "australia"), or "" when Mapbox names one we don't list. */
  country: string;
}

/** The slice of a Mapbox geocoding feature we read. */
export interface MapboxFeature {
  id?: string;
  place_name?: string;
  place_type?: string[];
  text?: string;
  /** House number, on an `address` feature. */
  address?: string;
  context?: Array<{ id?: string; text?: string; short_code?: string }>;
}

export interface AddressSearchOptions {
  /** ISO alpha-2 to bias results to (from the form's country select). */
  country?: string;
  /** Overrides the public token – tests pass it explicitly. */
  token?: string;
  signal?: AbortSignal;
  limit?: number;
}

/** The public browser token, or "" when unset (the field then degrades to a plain text input). */
export function addressSearchToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
}

/** Whether address search can run at all – false when no public Mapbox token is configured. */
export function hasAddressSearch(): boolean {
  return addressSearchToken().length > 0;
}

/** The forward-geocoding URL for `query`, address-biased and optionally scoped to one country. */
export function buildAddressSearchUrl(
  query: string,
  { country = '', token = '', limit = 6 }: Omit<AddressSearchOptions, 'signal'> = {}
): string {
  const params = new URLSearchParams({
    access_token: token,
    types: 'address,place,locality,postcode',
    autocomplete: 'true',
    limit: String(limit),
  });
  if (country) params.set('country', country.toLowerCase());
  return `${MAPBOX_GEOCODE}/${encodeURIComponent(query)}.json?${params.toString()}`;
}

/** First context entry whose id is in the `prefix` namespace (`"place"` → `place.9171`). */
function contextPart(feature: MapboxFeature, prefix: string) {
  return feature.context?.find((c) => c.id?.startsWith(`${prefix}.`));
}

/** "NSW" from a region's `AU-NSW` short code, falling back to the region's full name. */
function stateFrom(region: { text?: string; short_code?: string } | undefined): string {
  if (!region) return '';
  const code = region.short_code ?? '';
  const suffix = code.includes('-') ? code.slice(code.indexOf('-') + 1) : '';
  return suffix ? suffix.toUpperCase() : (region.text ?? '');
}

/**
 * A Mapbox feature as a picklist row. Street line = house number + road for an `address` feature,
 * otherwise the feature's own name. Returns null for a feature with nothing to show.
 */
export function toSuggestion(feature: MapboxFeature, index = 0): AddressSuggestion | null {
  const isAddress = feature.place_type?.includes('address') ?? false;
  const name = feature.text ?? '';
  const line1 = isAddress && feature.address ? `${feature.address} ${name}` : name;
  const placeName = feature.place_name ?? '';
  if (!line1 && !placeName) return null;

  const locality = contextPart(feature, 'locality')?.text ?? '';
  const neighbourhood = contextPart(feature, 'neighborhood')?.text ?? '';
  const place = contextPart(feature, 'place')?.text ?? '';
  const isPostcode = feature.place_type?.includes('postcode') ?? false;

  const head = line1 || placeName.split(', ')[0];
  const context = placeName.startsWith(`${head}, `) ? placeName.slice(head.length + 2) : placeName;

  return {
    id: feature.id ?? `${head}-${index}`,
    line1: head,
    context,
    suburb: locality || neighbourhood || place,
    city: place || locality,
    state: stateFrom(contextPart(feature, 'region')),
    postcode: isPostcode ? name : (contextPart(feature, 'postcode')?.text ?? ''),
    country: countryForIsoCode(contextPart(feature, 'country')?.short_code),
  };
}

/**
 * Forward-geocode `query` into address suggestions. Returns [] for a too-short query or a missing
 * token; throws on an HTTP failure so the caller can show the error row (an aborted fetch rejects
 * with the caller's own AbortError).
 */
export async function searchAddresses(
  query: string,
  { country = '', token, signal, limit }: AddressSearchOptions = {}
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  const accessToken = token ?? addressSearchToken();
  if (!accessToken || q.length < MIN_ADDRESS_QUERY) return [];

  const res = await fetch(
    buildAddressSearchUrl(q, { country, token: accessToken, limit }),
    signal ? { signal } : undefined
  );
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);

  const body = (await res.json()) as { features?: MapboxFeature[] };
  return (body.features ?? [])
    .map((f, i) => toSuggestion(f, i))
    .filter((s): s is AddressSuggestion => s !== null);
}
