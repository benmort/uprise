import { request } from "@/lib/api";

/** A politician in the civic domain (federal from They Vote For You, state from Wikidata). */
export type House = "REPS" | "SENATE";
export type Chamber = "LOWER" | "UPPER";

/** Jurisdictions in display order (Federal first, then states/territories). */
export const JURISDICTIONS: Array<{ code: string; label: string }> = [
  { code: "FEDERAL", label: "Federal" },
  { code: "NSW", label: "New South Wales" },
  { code: "VIC", label: "Victoria" },
  { code: "QLD", label: "Queensland" },
  { code: "SA", label: "South Australia" },
  { code: "WA", label: "Western Australia" },
  { code: "TAS", label: "Tasmania" },
  { code: "ACT", label: "ACT" },
  { code: "NT", label: "Northern Territory" },
];
const JURISDICTION_LABEL = new Map(JURISDICTIONS.map((j) => [j.code, j.label]));
export const jurisdictionLabel = (code: string): string => JURISDICTION_LABEL.get(code) ?? code;

/** The chamber's proper name, which depends on jurisdiction (federal vs state; SA/TAS lower). */
export function chamberLabel(jurisdiction: string, chamber: Chamber | null): string {
  if (!chamber) return "—";
  if (jurisdiction === "FEDERAL") return chamber === "LOWER" ? "House of Representatives" : "Senate";
  if (chamber === "UPPER") return "Legislative Council";
  return jurisdiction === "SA" || jurisdiction === "TAS" ? "House of Assembly" : "Legislative Assembly";
}

export type PoliticianSummary = {
  id: string;
  tvfyId: number | null;
  wikidataId: string | null;
  name: string;
  firstName: string | null;
  lastName: string | null;
  party: string | null;
  jurisdiction: string;
  chamber: Chamber | null;
  house: House | null;
  electorate: string | null;
  /** id-only geo reference — "ced" | "sed_lower" | "sed_upper" | "chamber_electorate". */
  geoKind: string | null;
  geoCode: string | null;
  rebellions: number | null;
  votesAttended: number | null;
  votesPossible: number | null;
  /** Re-hosted Commons headshot (null → show initials) + the attribution its licence needs. */
  imageUrl: string | null;
  imageCredit: string | null;
  imageSourceUrl: string | null;
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
    house: House | null;
    electorate: string | null;
    imageUrl: string | null;
    imageCredit: string | null;
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
  filters: {
    jurisdiction?: string;
    chamber?: string;
    house?: string;
    party?: string;
    geoKind?: string;
    geoCode?: string;
    q?: string;
  } = {},
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

export type CivicStatus = {
  politicians: { count: number; withImage: number; lastSyncedAt: string | null };
  policies: { count: number; lastSyncedAt: string | null };
};

/** Dataset-level civic counts for the Datasets page. */
export async function getCivicStatus(init?: RequestInit) {
  return request<CivicStatus>("/civic/status", init);
}

/** Attendance as a whole-percent, or null when the base is unknown. */
export function attendancePct(p: { votesAttended: number | null; votesPossible: number | null }): number | null {
  if (p.votesAttended == null || !p.votesPossible) return null;
  return Math.round((p.votesAttended / p.votesPossible) * 100);
}
