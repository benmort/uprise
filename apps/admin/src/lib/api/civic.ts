import { request } from "@/lib/api";

/** A politician synced from They Vote For You (civic domain). */
export type House = "REPS" | "SENATE";

export type PoliticianSummary = {
  id: string;
  tvfyId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  party: string | null;
  house: House;
  electorate: string | null;
  /** id-only geo reference — "ced" (Reps) | "chamber_electorate" (Senate). */
  geoKind: string | null;
  geoCode: string | null;
  rebellions: number | null;
  votesAttended: number | null;
  votesPossible: number | null;
};

export type PolicyPositionRow = {
  policyId: string;
  policyTvfyId: number;
  policyName: string;
  provisional: boolean;
  /** Agreement 0–100. */
  agreement: number | null;
  voted: boolean;
  category: string | null;
};

export type PoliticianDetail = PoliticianSummary & {
  offices: unknown;
  lastSyncedAt: string | null;
  positions: PolicyPositionRow[];
};

export type PolicySummary = {
  id: string;
  tvfyId: number;
  name: string;
  description: string | null;
  provisional: boolean;
  lastEditedAt: string | null;
};

export type PolicyDetail = PolicySummary & {
  positions: Array<{
    politicianId: string;
    politicianTvfyId: number;
    politicianName: string;
    party: string | null;
    house: House;
    electorate: string | null;
    agreement: number | null;
    voted: boolean;
    category: string | null;
  }>;
};

function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : "";
}

export async function listPoliticians(
  filters: { house?: string; party?: string; geoKind?: string; geoCode?: string; q?: string } = {},
  init?: RequestInit,
) {
  return request<PoliticianSummary[]>(`/civic/politicians${qs(filters)}`, init);
}

export async function getPolitician(id: string, init?: RequestInit) {
  return request<PoliticianDetail>(`/civic/politicians/${encodeURIComponent(id)}`, init);
}

export async function listPolicies(filters: { q?: string; provisional?: boolean } = {}, init?: RequestInit) {
  return request<PolicySummary[]>(
    `/civic/policies${qs({ q: filters.q, provisional: filters.provisional === undefined ? undefined : String(filters.provisional) })}`,
    init,
  );
}

export async function getPolicy(id: string, init?: RequestInit) {
  return request<PolicyDetail>(`/civic/policies/${encodeURIComponent(id)}`, init);
}

/** Attendance as a whole-percent, or null when the base is unknown. */
export function attendancePct(p: { votesAttended: number | null; votesPossible: number | null }): number | null {
  if (p.votesAttended == null || !p.votesPossible) return null;
  return Math.round((p.votesAttended / p.votesPossible) * 100);
}
