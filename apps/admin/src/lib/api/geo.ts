import { request } from "@/lib/api";
import type { DensityScale } from "@/lib/canvass/density";

/**
 * A division layer. `sed` is the raw ABS "State Electoral Division" layer; `sed_lower`
 * and `sed_upper` are the chamber-pure layers derived from it. Prefer the derived pair
 * when showing a state seat: for Tasmania the raw `sed` rows are House-of-Assembly ×
 * Legislative-Council intersection cells and belong to neither chamber.
 */
export type DivisionType = "ced" | "sed" | "sed_lower" | "sed_upper" | "lga" | "ward";
/** Division sources that can be stacked into a turf — the division layers plus "ste" (a
 *  whole state/territory) and "chamber_electorate" (the Senate, or a state-wide
 *  Legislative Council, whose boundary is the jurisdiction itself). */
export type TurfDivisionType = DivisionType | "ste" | "chamber_electorate";

/** A legislative chamber, including the ones that do not exist — Queensland abolished its
 *  Legislative Council in 1922, the ACT and NT are unicameral, councils have no upper
 *  house, and the ACT has no local government at all. */
export type Chamber = {
  key: string;
  jurisdiction: string;
  level: "federal" | "state" | "local";
  chamber: "lower" | "upper" | "unicameral";
  name: string;
  exists: boolean;
  electorateLayer: string | null;
  subElectorateLayer: string | null;
  memberCount: number | null;
  note: string | null;
};

/** An electorate of a chamber with no sub-state boundaries: the Senate, or the NSW/SA/WA
 *  Legislative Councils. Its boundary is the state itself. */
export type ChamberElectorate = {
  code: string;
  name: string;
  state: string | null;
  chamberKey: string;
  memberCount: number | null;
  addressCount: number;
};

export type GeoDataset = {
  key: string;
  label: string;
  sourceUrl: string | null;
  releaseDate: string | null;
  licence: string | null;
  rowCount: number;
  status: string;
  lastIngested: string | null;
};

export type Division = { code: string; name: string; state: string | null; addressCount: number };
export type DivisionDetail = Division & {
  geometry: unknown;
  contactCount: number;
  withoutContacts: number;
};
export type UniverseAddress = { gnafPid: string; address: string | null; lat: number | null; lng: number | null };

/** ASGS statistical-area levels selectable on the turf-cut map. */
export type AreaLevel = "mb" | "sa1" | "sa2" | "sa3" | "sa4";
export type AreaProps = { code: string; name: string; level: AreaLevel };
export type AreaFeature = GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon, AreaProps>;
export type AreaCollection = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, AreaProps>;
export type AreaHit = { level: AreaLevel; code: string; name: string };
/** One area's boundary + org address/contact coverage — the area twin of DivisionDetail. */
export type AreaDetail = {
  code: string;
  name: string;
  level: AreaLevel;
  geometry: unknown;
  addressCount: number;
  contactCount: number;
  withoutContacts: number;
};

/** Which addresses a turf is populated with when it's cut. */
export type TurfUniverse = "existing" | "none" | "hybrid";

// ── Containment hierarchy (state → SA4 → … → meshblock → address, + divisions) ──
export type RegionKind =
  | "state"
  | "ced"
  | "sed"
  | "sed_lower"
  | "sed_upper"
  | "lga"
  | "ward"
  | "ireg"
  | "iare"
  | "iloc"
  | "sa4"
  | "sa3"
  | "sa2"
  | "sa1"
  | "mb"
  | "address";
export type RegionRef = { kind: RegionKind; code: string; name: string; addressCount?: number };
export type RegionHierarchy = {
  region: RegionRef;
  parents: RegionRef[];
  childGroups: Array<{ kind: RegionKind; label: string; total: number; rows: RegionRef[] }>;
};

/** One region's place in the containment tree — parents (breadcrumb up) +
 *  contained regions (lists down). Backs the <RegionHierarchy> panel. */
export async function getRegionHierarchy(kind: RegionKind, code: string) {
  const qs = new URLSearchParams({ kind, code });
  return request<RegionHierarchy>(`/geo/hierarchy?${qs}`);
}

/** Poll estimates attached to a geo region (Insights) — the `<RegionPolling>` panel.
 *  Empty `polls` when the region has no estimates (e.g. any kind but sed_upper today). */
export type RegionPolling = {
  region: { geoKind: string; geoCode: string };
  polls: Array<{
    pollId: string;
    title: string;
    attribution: string | null;
    questions: Array<{
      code: string;
      title: string;
      ordinal: number;
      rows: Array<{ responseLabel: string; isNet: boolean; regionPercent: number | null; totalPercent: number | null }>;
    }>;
  }>;
};

export async function getRegionPolling(kind: RegionKind, code: string) {
  const qs = new URLSearchParams({ geoKind: kind, geoCode: code });
  return request<RegionPolling>(`/insights/region?${qs}`);
}

export async function getGeoStatus(opts?: { signal?: AbortSignal }) {
  return request<GeoDataset[]>("/geo/status", opts?.signal ? { signal: opts.signal } : undefined);
}

export async function listDivisions(type: DivisionType) {
  return request<Division[]>(`/geo/divisions?type=${type}`);
}

export async function getDivision(type: DivisionType, code: string) {
  return request<DivisionDetail>(`/geo/divisions/${type}/${encodeURIComponent(code)}`);
}

/** The states + territories (derived geo.state layer) — the divisions twin for
 *  the explorer's States kind. Same row shape as Division. */
export async function listStates() {
  return request<Division[]>("/geo/states");
}

export async function getState(code: string) {
  return request<DivisionDetail>(`/geo/states/${encodeURIComponent(code)}`);
}

/** The chamber catalogue — read this to explain a gap rather than render an empty tab. */
export async function listChambers() {
  return request<Chamber[]>("/geo/chambers");
}

/** Electorates of the chambers whose boundary is the whole jurisdiction. */
export async function listChamberElectorates() {
  return request<ChamberElectorate[]>("/geo/chamber-electorates");
}

export async function getChamberElectorate(code: string) {
  return request<DivisionDetail>(`/geo/chamber-electorates/${encodeURIComponent(code)}`);
}

// ── First Nations (ABS Indigenous Structure) — reference-only ────────────────
/**
 * The three levels of the ASGS Indigenous Structure: Regions ⊃ Areas ⊃ Locations.
 * These are ABS **statistical** geographies, not cultural, language or nation boundaries.
 *
 * Deliberately NOT part of `DivisionType`/`TurfDivisionType`: a First Nations layer can be
 * browsed, mapped and inspected, but never cut into a turf or stacked into a campaign
 * boundary. The API enforces it; a unit test on the service pins it.
 */
export type FirstNationsLevel = "ireg" | "iare" | "iloc";
export type FirstNationsRow = {
  level: FirstNationsLevel;
  /** The ABS code ('107'). Numeric and state-digit-prefixed — the map keys on this. */
  code: string;
  name: string;
  state: string | null;
  /** URL-friendly name ('sydney-wollongong'). Unique per level; what the URLs carry. */
  slug: string;
  addressCount: number;
};
export type FirstNationsDetail = FirstNationsRow & {
  geometry: unknown;
  contactCount: number;
  withoutContacts: number;
};

export async function listFirstNations(
  level: FirstNationsLevel,
  params: { q?: string; state?: string; limit?: number; offset?: number } = {},
) {
  const qs = new URLSearchParams({ level });
  if (params.q) qs.set("q", params.q);
  if (params.state) qs.set("state", params.state);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<{ rows: FirstNationsRow[]; total: number }>(`/geo/first-nations?${qs}`);
}

/** `key` is the slug ('sydney-wollongong') or the ABS code ('107') — the API resolves both. */
export async function getFirstNations(level: FirstNationsLevel, key: string) {
  return request<FirstNationsDetail>(`/geo/first-nations/${level}/${encodeURIComponent(key)}`);
}

export async function listUniverseAddresses(params: {
  turfId?: string;
  divisionType?: DivisionType;
  divisionCode?: string;
  withoutContacts?: boolean;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params.turfId) q.set("turfId", params.turfId);
  if (params.divisionType) q.set("divisionType", params.divisionType);
  if (params.divisionCode) q.set("divisionCode", params.divisionCode);
  if (params.withoutContacts) q.set("withoutContacts", "true");
  if (params.limit) q.set("limit", String(params.limit));
  return request<UniverseAddress[]>(`/geo/addresses?${q}`);
}

/** Statistical-area boundaries intersecting a viewport, for the clickable map layer. */
export async function listAreas(params: { layer: AreaLevel; bbox: [number, number, number, number]; limit?: number }) {
  const q = new URLSearchParams({ layer: params.layer, bbox: params.bbox.join(",") });
  if (params.limit) q.set("limit", String(params.limit));
  return request<AreaCollection>(`/geo/areas?${q}`);
}

/** Type-ahead over a level's name/code for the area search box. `state` is the
 *  ASGS state digit (1–9) to restrict results to one state. */
export async function searchAreas(layer: AreaLevel, q: string, limit?: number, state?: string) {
  const qs = new URLSearchParams({ layer, q });
  if (limit) qs.set("limit", String(limit));
  if (state) qs.set("state", state);
  return request<AreaHit[]>(`/geo/areas/search?${qs}`);
}

export type AreaRow = AreaHit & { addressCount: number };

/** Paged national browse for the areas list view — the divisions-table
 *  equivalent. `state` is the ASGS state digit (1–9); `q` optionally filters
 *  name/code. Returns one page + the total match count. */
export async function browseAreas(params: {
  layer: AreaLevel;
  q?: string;
  state?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams({ layer: params.layer });
  if (params.q) qs.set("q", params.q);
  if (params.state) qs.set("state", params.state);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<{ rows: AreaRow[]; total: number }>(`/geo/areas/browse?${qs}`);
}

/** One area's boundary — used when a search result is picked. */
export async function getArea(layer: AreaLevel, code: string) {
  return request<AreaFeature>(`/geo/areas/${layer}/${encodeURIComponent(code)}`);
}

/** One area's boundary + address/contact KPIs — backs the area detail page. */
export async function getAreaDetail(layer: AreaLevel, code: string) {
  return request<AreaDetail>(`/geo/areas/${layer}/${encodeURIComponent(code)}/detail`);
}

/** Cut a turf from selected statistical areas and/or free-drawn polygons. */
export async function createTurfFromAreas(input: {
  name: string;
  campaignId?: string;
  universe?: TurfUniverse;
  areas: Array<{ layer: AreaLevel; code: string }>;
  polygons?: GeoJSON.Polygon[];
}) {
  return request<{ id: string }>("/canvass/turfs/from-areas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Cut one turf from a stacked "my turf" basket — any mix of divisions, areas,
 *  drawn polygons and individually-picked G-NAF doors. */
export async function createTurfFromSources(input: {
  name: string;
  campaignId?: string;
  universe?: TurfUniverse;
  divisions?: Array<{ type: TurfDivisionType; code: string }>;
  areas?: Array<{ layer: AreaLevel; code: string }>;
  polygons?: GeoJSON.Polygon[];
  gnafPids?: string[];
}) {
  return request<{ id: string }>("/canvass/turfs/from-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function triggerGeoIngest() {
  return request<{ queued: boolean; note: string }>("/geo/ingest", { method: "POST" });
}

export async function createTurfFromDivision(input: {
  type: DivisionType;
  code: string;
  name?: string;
  campaignId?: string;
  universe?: TurfUniverse;
}) {
  return request<{ id: string }>("/canvass/turfs/from-division", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ── Addresses page (live geocode search → nearest real doors) ───────────────
/** A G-NAF door near a searched point, with its electorates + contact linkage. */
export type NearbyAddress = {
  gnafPid: string;
  address: string;
  state: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  cedCode: string | null;
  cedName: string | null;
  /** The raw ABS division. For Tasmania this is an intersection cell, not a seat — use
   *  sedLower/sedUpper to name the chamber the door actually votes in. */
  sedCode: string | null;
  sedName: string | null;
  sedLowerCode: string | null;
  sedLowerName: string | null;
  sedUpperCode: string | null;
  sedUpperName: string | null;
  wardCode: string | null;
  wardName: string | null;
  sa1Code: string | null;
  sa2Code: string | null;
  sa3Code: string | null;
  sa4Code: string | null;
  lgaCode: string | null;
  hasContact: boolean;
};

/** The nearest G-NAF addresses to a point (KNN over the national set). */
export async function nearbyAddresses(lat: number, lng: number, limit = 25) {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
  return request<NearbyAddress[]>(`/geo/addresses/near?${qs}`);
}

// ── Polling places (booths) — federal (AEC) + state/territory (The Tally Room) ──

/** The nine electoral jurisdictions a booth can belong to. "all" is the unfiltered
 *  UI sentinel (never sent to the API). */
export type PollingJurisdiction = "federal" | "nsw" | "vic" | "qld" | "wa" | "sa" | "tas" | "act" | "nt";

/** One polling place with its resolved federal division + state electorate. */
export type PollingPlace = {
  id: string;
  jurisdiction: PollingJurisdiction;
  name: string | null;
  premises: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  divisionName: string | null;
  placeType: string | null;
  lat: number;
  lng: number;
  cedCode: string | null;
  cedName: string | null;
  sedCode: string | null;
  sedName: string | null;
};

export type PollingPlaceDetail = PollingPlace & { sourceId: string | null };

/** Minimal map-layer shape — one clustered pin per booth. */
export type PollingPlacePoint = {
  id: string;
  lat: number;
  lng: number;
  jurisdiction: PollingJurisdiction;
  name: string | null;
};

/** Paged, filterable booth list for the polling-places explorer list view. */
export async function browsePollingPlaces(params: {
  jurisdiction?: string;
  state?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params.jurisdiction && params.jurisdiction !== "all") qs.set("jurisdiction", params.jurisdiction);
  if (params.state) qs.set("state", params.state);
  if (params.q) qs.set("q", params.q);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return request<{ rows: PollingPlace[]; total: number }>(`/geo/polling-places?${qs}`);
}

/** All booth points for the map layer (one cached request; mapbox clusters). */
export async function listPollingPlacePoints(params: { jurisdiction?: string; state?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params.jurisdiction && params.jurisdiction !== "all") qs.set("jurisdiction", params.jurisdiction);
  if (params.state) qs.set("state", params.state);
  if (params.limit) qs.set("limit", String(params.limit));
  return request<PollingPlacePoint[]>(`/geo/polling-places/points?${qs}`);
}

/** One booth's full detail (backs the selected-booth card). */
export async function getPollingPlace(id: string) {
  return request<PollingPlaceDetail>(`/geo/polling-places/${encodeURIComponent(id)}`);
}

/**
 * The colour breaks for a layer's address-density choropleth — four national quantiles.
 * The density itself rides on each vector tile feature; this is only the scale to paint it
 * with, fixed nationally so a colour means the same thing wherever the map is panned.
 */
export async function getDensityScale(kind: string) {
  return request<DensityScale>(`/geo/density/scale?kind=${encodeURIComponent(kind)}`);
}
