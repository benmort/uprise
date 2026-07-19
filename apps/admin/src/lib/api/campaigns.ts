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
  /** Organiser-set rank; lower = higher priority (1 = top). 0 = unset. */
  priority: number;
  /** Geographic state (VIC/NSW/…), derived from the boundary. Null for drawn boundaries. */
  state: string | null;
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
  priority?: number;
};

/** Mirrors the API's BoundarySource. `type` spans every division layer plus the two
 *  whole-jurisdiction layers ("ste", "chamber_electorate"). */
export type BoundarySource =
  | { kind: "division"; type: TurfDivisionType; code: string }
  | { kind: "area"; layer: "mb" | "sa1" | "sa2" | "sa3" | "sa4"; code: string }
  | { kind: "polygon"; geometry: unknown };

/** A {@link BoundarySource} resolved to a human name (mirrors the API's DescribedSource).
 *  `key` is the geo layer key — `state`/`chamber_electorate` for the whole-jurisdiction
 *  divisions, `polygon` for a drawn area (which has no code or name). */
export type DescribedSource =
  | { kind: "division" | "area"; key: string; code: string; name: string }
  | { kind: "polygon"; key: "polygon"; name: null };

export async function getCampaignBoundary(id: string) {
  return request<{
    boundary: unknown | null;
    sources: BoundarySource[] | null;
    describedSources: DescribedSource[];
  }>(`/canvass/campaigns/${encodeURIComponent(id)}/boundary`);
}

export async function setCampaignBoundary(id: string, sources: BoundarySource[]) {
  return request<{ boundary: unknown | null; sources: BoundarySource[] }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/boundary`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) },
  );
}

/** Union the sources into a boundary WITHOUT saving — the live preview drawn as the editor builds. */
export async function previewCampaignBoundary(id: string, sources: BoundarySource[], signal?: AbortSignal) {
  return request<{ boundary: unknown | null }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/boundary/preview`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }), ...(signal ? { signal } : {}) },
  );
}

/** Areas (at `layer`: sa4/sa3/sa2/sa1/mb) intersecting the campaign boundary — the
 *  selectable layer for cutting turf inside a bounded campaign. */
export async function getCampaignAreas(id: string, layer: string) {
  return request<GeoJSON.FeatureCollection>(
    `/canvass/campaigns/${encodeURIComponent(id)}/areas/${encodeURIComponent(layer)}`,
  );
}

/** Total addresses inside the campaign's saved boundary (level-independent, spatial). */
export async function getCampaignBoundaryAddressCount(id: string) {
  return request<{ addresses: number }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/boundary/address-count`,
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

export async function deleteCampaign(id: string) {
  return request<{ id: string }>(`/canvass/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
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

/** Campaign results, or the tenant-wide aggregate across all campaigns when `id` is omitted. */
export async function getCampaignResults(id?: string) {
  return request<CampaignResults>(
    id ? `/canvass/campaigns/${encodeURIComponent(id)}/results` : "/canvass/campaigns/results",
  );
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

/** Live snapshot for a campaign, or the tenant-wide aggregate when `id` is omitted. */
export async function getCampaignLive(id?: string) {
  return request<CampaignLive>(
    id ? `/canvass/campaigns/${encodeURIComponent(id)}/live` : "/canvass/campaigns/live",
  );
}

// ── Field report (the five-number weekly field-director review) ─────────────

export type CampaignFieldReport = {
  /** The accumulation window actually used (server-clamped 1–52; default 8). */
  weeks: number;
  /** Raw door knocks against the campaign's turf contacts (a re-knock counts). */
  attempts: number;
  /** Knocks whose disposition says a human was reached (spoke_to_target / spoke_to_other). */
  conversations: number;
  /** conversations ÷ attempts. Rates are fractions (0–1); null = no denominator, not 0 %. */
  contactRate: number | null;
  idsRecorded: number;
  /** Support-levelled IDs ÷ conversations. */
  idRate: number | null;
  /** Distinct contacts with at least one survey answer. */
  surveysCompleted: number;
  /** surveysCompleted ÷ conversations. */
  qualityProxy: number | null;
  coverage: {
    /** Distinct doors attempted (not raw knocks). */
    attemptedDoors: number;
    /** Boundary spatial count, or the loaded turf contact universe; null when neither exists. */
    doorUniverse: number | null;
    source: "boundary" | "turf-contacts" | null;
    rate: number | null;
  };
  accumulation: {
    /** goals.supporters when set on the campaign. */
    goal: number | null;
    /** Supporter IDs recorded before the window — seeds the cumulative line. */
    priorSupporters: number;
    /** Oldest week first; weekStart is the local Monday (YYYY-MM-DD). */
    weekly: Array<{ weekStart: string; newSupporters: number; cumulative: number }>;
  };
  /** Per-turf five numbers on a distinct-door basis (attempts = doors attempted). */
  perTurf: Array<{
    turfId: string;
    name: string;
    doors: number;
    attempts: number;
    contactRate: number | null;
    idRate: number | null;
    coverage: number | null;
  }>;
};

/** The five-number field report for a campaign; `weeks` widens/narrows the accumulation window. */
export async function getCampaignFieldReport(id: string, opts?: { weeks?: number }) {
  const qs = opts?.weeks ? `?weeks=${opts.weeks}` : "";
  return request<CampaignFieldReport>(
    `/canvass/campaigns/${encodeURIComponent(id)}/field-report${qs}`,
  );
}

// ── Targeting heat map (SA1 "where to knock" score) ─────────────────────────

export type HeatFactor =
  | "doors"
  | "persuadability"
  | "supporter"
  | "fit"
  | "efficiency"
  | "freshness"
  // Opt-in factors — weight 0 in every preset until a slider moves:
  | "community"
  | "progressive"
  | "informality";
export type HeatPreset = "persuasion" | "gotv" | "coverage";

export type HeatConfig = {
  preset?: HeatPreset;
  weights?: Partial<Record<HeatFactor, number>>;
  pollRef?: { pollId: string; questionCode: string; responseLabel: string; geoKind?: string } | null;
  alignedPartyCodes?: string[];
  electionId?: string | null;
  fitLens?: { indicator: string; target?: number; span?: number } | null;
  /** Second demographic lens (default: CALD language-other-than-English share). */
  communityLens?: { indicator: string; target?: number; span?: number } | null;
};

export type HeatCell = {
  sa1Code: string;
  /** 0–100; null = insufficient data (hatched no-data, never cold). */
  score: number | null;
  band: number | null;
  subScores: Partial<Record<HeatFactor, number>>;
  available: HeatFactor[];
  flags: string[];
  coverageFraction: number;
};

export type HeatResponse = {
  meta: {
    campaignId: string | null;
    preset: HeatPreset;
    weights: Record<HeatFactor, number>;
    sa1Count: number;
    computedAt: string;
    stale: boolean;
    queued?: boolean;
    breaks: number[];
    factorCoverage: Record<HeatFactor, number>;
    constantFactors: HeatFactor[];
    lowResolutionFactors: Array<{ factor: HeatFactor; component: string; resolution: string }>;
    election: { id: string; note: string } | null;
    /** Effective lens/poll config (defaults resolved) — pickers hydrate from this. */
    config?: {
      fitLens: { indicator: string; target?: number; span?: number };
      communityLens: { indicator: string; target?: number; span?: number };
      pollRef: { pollId: string; questionCode: string; responseLabel: string; geoKind?: string } | null;
      alignedPartyCodes: string[];
      electionId: string | null;
    };
  };
  cells: HeatCell[];
};

/** The campaign targeting heat map (cached server-side; `meta.stale` + `queued` when recomputing). */
export async function getCampaignHeat(id: string) {
  return request<HeatResponse>(`/canvass/campaigns/${encodeURIComponent(id)}/heat`);
}

/** Save the heat config (preset/weights/poll/election/fit) and recompute. */
export async function setCampaignHeatConfig(id: string, config: HeatConfig) {
  return request<HeatResponse>(`/canvass/campaigns/${encodeURIComponent(id)}/heat-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

/** Force a recompute (the Refresh button). */
export async function refreshCampaignHeat(id: string) {
  return request<HeatResponse>(`/canvass/campaigns/${encodeURIComponent(id)}/heat/refresh`, {
    method: "POST",
  });
}

/** Boundary-editor targeting preview: score an ad-hoc source union, no campaign needed. */
export async function previewHeat(sources: BoundarySource[], config?: HeatConfig, signal?: AbortSignal) {
  return request<HeatResponse>("/canvass/heat/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources, ...(config ? { config } : {}) }),
    ...(signal ? { signal } : {}),
  });
}

// ── Evaluation mode (randomised holdouts) + score snapshots ─────────────────

export type EvaluationPower = {
  clustersPerArm: number;
  meanClusterSize: number;
  designEffect: number;
  effectivePerArm: number;
  mdePercentagePoints: number;
  refusal: string | null;
  warning: string | null;
};

export type CampaignEvaluation = {
  seed: number;
  icc: number;
  pairs: Array<{ treatment: string; holdout: string }>;
  unpaired: string | null;
  treatmentCodes: string[];
  holdoutCodes: string[];
  power: EvaluationPower;
  enabledAt: string;
};

export async function getCampaignEvaluation(id: string) {
  return request<{ evaluation: CampaignEvaluation | null }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/evaluation`,
  );
}

/** Power preview without persisting — "what could this design detect?". */
export async function getEvaluationPower(id: string, icc?: number) {
  const q = icc !== undefined ? `?icc=${encodeURIComponent(icc)}` : "";
  return request<EvaluationPower>(`/canvass/campaigns/${encodeURIComponent(id)}/evaluation/power${q}`);
}

export async function enableEvaluation(id: string, icc?: number) {
  return request<CampaignEvaluation>(`/canvass/campaigns/${encodeURIComponent(id)}/evaluation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(icc !== undefined ? { icc } : {}),
  });
}

export async function disableEvaluation(id: string) {
  return request<{ ok: true }>(`/canvass/campaigns/${encodeURIComponent(id)}/evaluation`, {
    method: "DELETE",
  });
}

/** Freeze the current score run as the pre-election snapshot (out-of-sample validation). */
export async function snapshotCampaignHeat(id: string) {
  return request<{ frozenRunId: string; computedAt: string }>(
    `/canvass/campaigns/${encodeURIComponent(id)}/heat/snapshot`,
    { method: "POST" },
  );
}
