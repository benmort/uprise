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

export async function triggerGeoIngest() {
  return request<{ queued: boolean; note: string }>("/geo/ingest", { method: "POST" });
}

export async function createTurfFromDivision(input: {
  type: DivisionType;
  code: string;
  name?: string;
  campaignId?: string;
}) {
  return request<{ id: string }>("/canvass/turfs/from-division", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
