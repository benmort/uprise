/**
 * Public poll data, fetched server-side from the API's unauthenticated `/insights/public/*`
 * surface. Server-side = no cookie, no CORS (same pattern as the campaign preview). Returns
 * null on any non-200 (a private/missing poll 404s), so pages render a clean not-found.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    // The API sometimes wraps success in { data }; accept either envelope.
    return (json && typeof json === "object" && "data" in json ? (json as { data: T }).data : (json as T)) ?? null;
  } catch {
    return null;
  }
}

export type PublicKeyFinding = { heading: string; body: string; questionCode?: string };
export type PublicQuestionRef = {
  code: string;
  title: string;
  category: string | null;
  theme: string | null;
  hasNet: boolean;
  baseN: number | null;
  topline: Array<{ label: string; percent: number | null; isNet: boolean }>;
};
export type PublicPoll = {
  id: string;
  title: string;
  source: string;
  commissioner: string | null;
  fieldworkStart: string | null;
  fieldworkEnd: string | null;
  sampleSize: number | null;
  weighted: boolean;
  geoScope: string | null;
  licence: string | null;
  attribution: string | null;
  keyFindings: PublicKeyFinding[];
  questions: PublicQuestionRef[];
};

export type PublicCrosstabColumn = {
  ordinal: number;
  group: string;
  value: string;
  geoKind: string | null;
  geoCode: string | null;
  baseN: number | null;
  reportable: boolean;
};
export type PublicCrosstab = {
  poll: { id: string; title: string; attribution: string | null };
  question: { code: string; title: string; category: string | null; hasNet: boolean };
  groups: Array<{ group: string; columns: PublicCrosstabColumn[] }>;
  responses: Array<{ label: string; ordinal: number; isNet: boolean; cells: Record<number, number | null> }>;
};

export const getPublicPoll = (id: string) =>
  getJson<PublicPoll>(`/insights/public/polls/${encodeURIComponent(id)}`);

export const getPublicPollQuestion = (id: string, code: string) =>
  getJson<PublicCrosstab>(`/insights/public/polls/${encodeURIComponent(id)}/questions/${encodeURIComponent(code)}`);

/** "YouGov · Common Threads · 16 Jun – 9 Jul 2026 · n=4,003 · weighted" */
export function provenanceLine(p: PublicPoll): string {
  const parts: string[] = [p.source];
  if (p.commissioner) parts.push(`commissioned by ${p.commissioner}`);
  const win = fieldworkWindow(p.fieldworkStart, p.fieldworkEnd);
  if (win) parts.push(win);
  if (p.sampleSize) parts.push(`n=${p.sampleSize.toLocaleString()}`);
  parts.push(p.weighted ? "weighted" : "unweighted");
  return parts.join(" · ");
}

export function fieldworkWindow(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
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
