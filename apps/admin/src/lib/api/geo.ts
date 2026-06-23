import { request } from "@/lib/api";

export type DivisionType = "ced" | "sed" | "lga";

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
export type AreaLevel = "mb" | "sa1" | "sa2" | "sa3";
export type AreaProps = { code: string; name: string; level: AreaLevel };
export type AreaFeature = GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon, AreaProps>;
export type AreaCollection = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, AreaProps>;
export type AreaHit = { level: AreaLevel; code: string; name: string };

/** Which addresses a turf is populated with when it's cut. */
export type TurfUniverse = "existing" | "none" | "hybrid";

export async function getGeoStatus() {
  return request<GeoDataset[]>("/geo/status");
}

export async function listDivisions(type: DivisionType) {
  return request<Division[]>(`/geo/divisions?type=${type}`);
}

export async function getDivision(type: DivisionType, code: string) {
  return request<DivisionDetail>(`/geo/divisions/${type}/${encodeURIComponent(code)}`);
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

/** Type-ahead over a level's name/code for the area search box. */
export async function searchAreas(layer: AreaLevel, q: string, limit?: number) {
  const qs = new URLSearchParams({ layer, q });
  if (limit) qs.set("limit", String(limit));
  return request<AreaHit[]>(`/geo/areas/search?${qs}`);
}

/** One area's boundary — used when a search result is picked. */
export async function getArea(layer: AreaLevel, code: string) {
  return request<AreaFeature>(`/geo/areas/${layer}/${encodeURIComponent(code)}`);
}

/** Cut a turf from selected statistical areas and/or free-drawn polygons. */
export async function createTurfFromAreas(input: {
  name: string;
  campaignId?: string;
  areas: Array<{ layer: AreaLevel; code: string }>;
  polygons?: GeoJSON.Polygon[];
}) {
  return request<{ id: string }>("/canvass/turfs/from-areas", {
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
