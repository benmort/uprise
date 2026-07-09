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

export type PollKeyFinding = { heading: string; body: string; questionCode?: string };

export type PollQuestionRef = {
  code: string;
  title: string;
  category: string | null;
  hasNet: boolean;
  responseKind: string | null;
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
export async function getPollQuestion(id: string, code: string) {
  return request<Crosstab>(`/insights/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}`);
}
export async function getPollChoropleth(id: string, code: string, response: string) {
  const qs = new URLSearchParams({ response });
  return request<Choropleth>(
    `/insights/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}/choropleth?${qs}`,
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
