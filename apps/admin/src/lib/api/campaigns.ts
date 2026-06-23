import { request } from "@/lib/api";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  surveyId: string | null;
  scriptId: string | null;
  goals: Record<string, unknown> | null;
  turfCount: number;
  walkListCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = {
  name?: string;
  status?: CampaignStatus;
  surveyId?: string | null;
  scriptId?: string | null;
  goals?: Record<string, unknown> | null;
};

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
  canvassersOut: number;
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
  canvassers: Array<{
    canvasserId: string;
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
    canvasser: string | null;
  }>;
};

export async function getCampaignLive(id: string) {
  return request<CampaignLive>(`/canvass/campaigns/${encodeURIComponent(id)}/live`);
}
