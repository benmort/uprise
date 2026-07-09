import { request } from "@/lib/api";

export type DivisionType = "ced" | "sed" | "lga";
/** Division sources that can be stacked into a turf — the electoral/LGA types
 *  plus "ste" (a whole state/territory from the derived geo.state layer). */
export type TurfDivisionType = DivisionType | "ste";

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
export type RegionKind = "state" | "ced" | "sed" | "lga" | "sa4" | "sa3" | "sa2" | "sa1" | "mb" | "address";
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
  sedCode: string | null;
  sedName: string | null;
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
