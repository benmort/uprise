import { request } from "@/lib/api";

/** A poll's row on the /insights board. */
export type PollSummary = {
  id: string;
  slug: string;
  title: string;
  source: string;
  commissioner: string | null;
  sampleSize: number | null;
  fieldworkStart: string | null;
  fieldworkEnd: string | null;
  weighted: boolean;
  geoScope: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  attribution: string | null;
  shared: boolean;
  questionCount: number;
  lastIngestedAt: string | null;
};

/** A figure the write-up asserts, and where in the estimates to check it. */
export type EvidenceClaim = {
  percent: number;
  response?: string;
  value?: string;
  /** 1 = the largest response. Used where the response text is too long to name. */
  rank?: number;
};

/** One exhibit behind a key finding. `unverifiable` clauses carry no chart. */
export type EvidenceItem = {
  label: string;
  code?: string;
  group?: string;
  response?: string;
  headline?: boolean;
  matrix?: string[];
  claim?: EvidenceClaim;
  unverifiable?: string;
};

export type PollKeyFinding = {
  heading: string;
  body: string;
  questionCode?: string;
  /** The crosstabs that back this finding. Null for a poll the API does not recognise. */
  evidence?: { items: EvidenceItem[] } | null;
};

/** One whole-sample response row. `percent` is null when the cell was suppressed. */
export type ToplineRow = { label: string; percent: number | null; isNet: boolean };

/** A sibling block of the same question — e.g. C1 "Ranked first" + C1-2 "Ranked top 3". */
export type PollQuestionVariant = { code: string; rank: string | null };

export type PollQuestionRef = {
  code: string;
  title: string;
  category: string | null;
  /** Sub-category from the API's reading taxonomy; null when the poll is unrecognised. */
  theme: string | null;
  rank: string | null;
  variants: PollQuestionVariant[];
  hasNet: boolean;
  responseKind: string | null;
  baseN: number | null;
  /** The `Total` column of the crosstab, so the overview charts without a fetch each. */
  topline: ToplineRow[];
};

/** Two questions in a theme that are the same battery asked before and after something. */
export type PollThemeCompare = { before: string; after: string; beforeLabel: string; afterLabel: string };

/**
 * A question sub-category. The API ships the catalogue with the keys it labels, in
 * reading order, so the client keeps no second copy of the taxonomy.
 */
export type PollTheme = {
  key: string;
  label: string;
  category: string;
  blurb: string;
  compare?: PollThemeCompare;
};

export type PollDetail = {
  id: string;
  slug: string;
  title: string;
  source: string;
  commissioner: string | null;
  fieldworkStart: string | null;
  fieldworkEnd: string | null;
  sampleSize: number | null;
  methodology: string | null;
  geoScope: string | null;
  weighted: boolean;
  licence: string | null;
  attribution: string | null;
  keyFindings: PollKeyFinding[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  shared: boolean;
  /** True once made public (every tenant can read it). */
  isPublic: boolean;
  /** The acting tenant owns this poll — so an owner/organiser here may toggle its visibility. */
  owned: boolean;
  /** The owning tenant — brands the public viewer (name + slug for an initials avatar). Public reads only. */
  tenant?: { name: string; slug: string } | null;
  themes: PollTheme[];
  questions: PollQuestionRef[];
};

export type CrosstabColumn = {
  ordinal: number;
  group: string;
  value: string;
  geoKind: string | null;
  geoCode: string | null;
  baseN: number | null;
  reportable: boolean;
};
export type Crosstab = {
  poll: { id: string; title: string; attribution: string | null };
  question: { code: string; title: string; category: string | null; hasNet: boolean };
  groups: Array<{ group: string; columns: CrosstabColumn[] }>;
  responses: Array<{ label: string; ordinal: number; isNet: boolean; cells: Record<number, number | null> }>;
};

export type ChoroplethCell = {
  geoKind: string | null;
  geoCode: string | null;
  breakdownValue: string;
  percent: number | null;
  baseN: number | null;
  reportable: boolean;
};
export type Choropleth = {
  question: { code: string; title: string };
  response: string;
  cells: ChoroplethCell[];
};

/** "16 Jun – 9 Jul 2026" — the fieldwork window, year only on the end date. */
export function fieldworkWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  // Fieldwork dates are calendar dates, not instants — format in UTC so a viewer
  // (or CI runner) in a behind-UTC timezone doesn't see the day shift back one.
  const fmt = (iso: string, withYear: boolean) =>
    new Date(iso).toLocaleDateString("en-AU", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  if (start && end) return `${fmt(start, false)} – ${fmt(end, true)}`;
  return fmt((start ?? end)!, true);
}

/** "YouGov · commissioned by Common Threads · 16 Jun – 9 Jul 2026 · n=4,003 · weighted" */
export function provenanceLine(p: {
  source: string;
  commissioner: string | null;
  fieldworkStart: string | null;
  fieldworkEnd: string | null;
  sampleSize: number | null;
  weighted: boolean;
}): string {
  const parts: string[] = [p.source];
  if (p.commissioner) parts.push(`commissioned by ${p.commissioner}`);
  const window = fieldworkWindow(p.fieldworkStart, p.fieldworkEnd);
  if (window) parts.push(window);
  if (p.sampleSize) parts.push(`n=${p.sampleSize.toLocaleString()}`);
  parts.push(p.weighted ? "weighted" : "unweighted");
  return parts.join(" · ");
}

export async function listPolls() {
  return request<PollSummary[]>("/insights/polls");
}
export async function getPoll(id: string) {
  return request<PollDetail>(`/insights/polls/${encodeURIComponent(id)}`);
}
/** Make a poll public (every tenant can read it) or private again. Owner/organiser of the
 *  poll's tenant, or a super-admin. */
export async function setPollPublic(id: string, isPublic: boolean) {
  return request<{ id: string; isPublic: boolean; shared: boolean }>(
    `/insights/polls/${encodeURIComponent(id)}/public`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public: isPublic }) },
  );
}
export async function getPollQuestion(id: string, code: string) {
  return request<Crosstab>(`/insights/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}`);
}
export async function getPollChoropleth(id: string, code: string, response: string) {
  const qs = new URLSearchParams({ response });
  return request<Choropleth>(
    `/insights/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}/choropleth?${qs}`,
  );
}

// ── Public (unauthenticated) reads — same shapes, isPublic-only endpoints. The chrome-less
// public poll route swaps these in via <InsightsApiProvider mode="public">. ──
export async function getPublicPoll(id: string) {
  return request<PollDetail>(`/insights/public/polls/${encodeURIComponent(id)}`);
}
export async function getPublicPollQuestion(id: string, code: string) {
  return request<Crosstab>(
    `/insights/public/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}`,
  );
}
export async function getPublicPollChoropleth(id: string, code: string, response: string) {
  const qs = new URLSearchParams({ response });
  return request<Choropleth>(
    `/insights/public/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}/choropleth?${qs}`,
  );
}

/** Resolve a poll threshold to geo codes — the basis for turf/segment targeting. */
export async function resolvePollThreshold(input: {
  pollId: string;
  questionCode: string;
  response: string;
  op: ">" | ">=" | "<" | "<=" | "=";
  value: number;
  geoKind: string;
}) {
  return request<string[]>("/insights/resolve-threshold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
