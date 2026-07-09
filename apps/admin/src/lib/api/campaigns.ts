import { request } from "@/lib/api";
import type { TurfDivisionType } from "@/lib/api/geo";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
/** Outreach medium a campaign runs on — door-knock, SMS, or both. */
export type CampaignChannel = "DOOR" | "SMS" | "BOTH";

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: CampaignChannel;
  surveyId: string | null;
  scriptId: string | null;
  goals: Record<string, unknown> | null;
  openJoinEnabled: boolean;
  volunteerCanSelfClaimTurf?: boolean;
  selfClaimModes?: string[] | null;
  hasBoundary?: boolean;
  turfCount: number;
  walkListCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = {
  name?: string;
  status?: CampaignStatus;
  channel?: CampaignChannel;
  surveyId?: string | null;
  scriptId?: string | null;
  goals?: Record<string, unknown> | null;
  openJoinEnabled?: boolean;
  volunteerCanSelfClaimTurf?: boolean;
  selfClaimModes?: string[] | null;
};

/** Mirrors the API's BoundarySource. `type` spans every division layer plus the two
 *  whole-jurisdiction layers ("ste", "chamber_electorate"). */
export type BoundarySource =
  | { kind: "division"; type: TurfDivisionType; code: string }
  | { kind: "area"; layer: "mb" | "sa1" | "sa2" | "sa3" | "sa4"; code: string }
  | { kind: "polygon"; geometry: unknown };

export async function getCampaignBoundary(id: string) {
  return request<{ boundary: unknown | null; sources: BoundarySource[] | null }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/boundary`,
  );
}

export async function setCampaignBoundary(id: string, sources: BoundarySource[]) {
  return request<{ boundary: unknown | null; sources: BoundarySource[] }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/boundary`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) },
  );
}

/** Areas (at `layer`: sa4/sa3/sa2/sa1/mb) intersecting the campaign boundary — the
 *  selectable layer for cutting turf inside a bounded campaign. */
export async function getCampaignAreas(id: string, layer: string) {
  return request<GeoJSON.FeatureCollection>(
    `/canvass/campaigns/${encodeURIComponent(id)}/areas/${encodeURIComponent(layer)}`,
  );
}

export async function listCampaigns() {
  return request<CampaignSummary[]>("/canvass/campaigns");
}

export async function getCampaign(id: string) {
  return request<CampaignSummary>(`/canvass/campaigns/${encodeURIComponent(id)}`);
}

export async function createCampaign(input: CampaignInput & { name: string }) {
  return request<CampaignSummary>("/canvass/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateCampaign(id: string, input: CampaignInput) {
  return request<CampaignSummary>(`/canvass/campaigns/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type CampaignKpis = {
  doorsToday: number;
  turfCompletePct: number;
  contactRate: number;
  volunteersOut: number;
  knockedStops: number;
  totalStops: number;
};

export async function getCampaignSummary(id: string) {
  return request<CampaignKpis>(`/canvass/campaigns/${encodeURIComponent(id)}/summary`);
}

export type CampaignResults = {
  dispositionBreakdown: Array<{ code: string; count: number }>;
  supportDistribution: Array<{ supportLevel: string | null; count: number }>;
  funnel: { doorsAttempted: number; contacted: number; surveyed: number; newSupporters: number };
};

export async function getCampaignResults(id: string) {
  return request<CampaignResults>(`/canvass/campaigns/${encodeURIComponent(id)}/results`);
}

export type CampaignLive = {
  doorsToday: number;
  volunteers: Array<{
    volunteerId: string;
    name: string;
    turf: string;
    doorsToday: number;
    lastActionAt: string | null;
    idle: boolean;
  }>;
  recentKnocks: Array<{
    id: string;
    at: string;
    dispositionCode: string | null;
    volunteer: string | null;
  }>;
};

export async function getCampaignLive(id: string) {
  return request<CampaignLive>(`/canvass/campaigns/${encodeURIComponent(id)}/live`);
}
