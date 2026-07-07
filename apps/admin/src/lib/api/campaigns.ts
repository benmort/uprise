import { request } from "@/lib/api";

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

export type BoundarySource =
  | { kind: "division"; type: "ced" | "sed" | "lga"; code: string }
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
