// Resolves a dynamic route pattern (e.g. `/canvass/[campaignId]/walklists`) to the real,
// openable instances behind it, by mapping the FIRST dynamic segment's prefix to an admin
// list endpoint. Only single-dynamic patterns are resolvable (a value for every segment);
// patterns with no matching endpoint (other apps' `[token]`/`[slug]`, deep multi-dynamic)
// keep their pattern + "dynamic" tag with nothing underneath.
import { listCampaigns } from "@/lib/api/campaigns";
import { listAudiences, listBlasts } from "@/lib/api";
import { listPolls } from "@/lib/api/insights";
import { searchTenants } from "@/lib/api/flags";
import { listPoliticians, listPolicies } from "@/lib/api/civic";

export type ResolvedInstance = { id: string; label: string };
type Resolver = () => Promise<ResolvedInstance[]>;

const MAX = 50;

function pick(o: unknown): ResolvedInstance | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const label = [r.name, r.title, r.displayName, r.label].find((v) => typeof v === "string");
  return { id: r.id, label: (label as string | undefined) ?? r.id };
}

const clean = (rows: unknown[]): ResolvedInstance[] =>
  rows.map(pick).filter((x): x is ResolvedInstance => x !== null).slice(0, MAX);

const polls: Resolver = async () => {
  const r = await listPolls();
  return r.ok ? clean(r.data as unknown[]) : [];
};

// Keyed by the dynamic prefix (route path up to and including the first `[segment]`).
export const SITEMAP_RESOLVERS: Record<string, Resolver> = {
  "/canvass/[campaignId]": async () => {
    const r = await listCampaigns();
    return r.ok ? clean(r.data as unknown[]) : [];
  },
  "/super/tenants/[tenantId]": async () => {
    const r = await searchTenants("");
    return r.ok ? clean(r.data as unknown[]) : [];
  },
  "/insights/[pollId]": polls,
  "/p/[pollId]": polls,
  "/embed/insights/[pollId]": polls,
  "/audience/[id]": async () => {
    const r = await listAudiences();
    return r.ok ? clean(((r.data as { rows?: unknown[] }).rows) ?? []) : [];
  },
  "/blasts/[id]": async () => {
    const r = await listBlasts();
    return r.ok ? clean(r.data as unknown[]) : [];
  },
  "/data/politicians/[id]": async () => {
    const r = await listPoliticians({});
    return r.ok ? clean(r.data as unknown[]) : [];
  },
  "/data/policies/[id]": async () => {
    const r = await listPolicies({});
    return r.ok ? clean(r.data as unknown[]) : [];
  },
};

/** The dynamic prefix of a path (`…/[seg]`), or null when there's no dynamic segment. */
export function dynamicPrefix(path: string): string | null {
  const segs = path.split("/");
  const idx = segs.findIndex((s) => s.startsWith("["));
  return idx < 0 ? null : segs.slice(0, idx + 1).join("/");
}

/** Exactly one dynamic segment → every value can be filled to a concrete URL. */
export function isSingleDynamic(path: string): boolean {
  return (path.match(/\[/g) ?? []).length === 1;
}

/** The resolver for a single-dynamic route, or null when the pattern can't be resolved. */
export function resolverFor(path: string): { prefix: string; resolve: Resolver } | null {
  if (!isSingleDynamic(path)) return null;
  const prefix = dynamicPrefix(path);
  const resolve = prefix ? SITEMAP_RESOLVERS[prefix] : undefined;
  return prefix && resolve ? { prefix, resolve } : null;
}

/** Substitute the single dynamic segment with a concrete id. */
export function concretePath(pattern: string, id: string): string {
  return pattern.replace(/\[[^\]]+\]/, encodeURIComponent(id));
}
