import type { FirstNationsLevel } from "@/lib/api/geo";

/**
 * URL vocabulary for the First Nations explorer.
 *
 * The ABS level codes (`ireg`/`iare`/`iloc`) and the numeric region codes (`107`) are how
 * the data is keyed, but they make for opaque links. The URL speaks names instead:
 *
 *   /data/first-nations?view=map&tab=regions&code=sydney-wollongong
 *
 * Both older forms still resolve — `?tab=ireg` and `?code=107` — because the API's detail
 * route accepts either the ABS code or the slug, and `resolveFirstNationsLevel` accepts
 * either tab vocabulary.
 */
// Per-level colour for the sub-level pills' legend dot — mirrors the divisions
// tabs (TYPE_COLORS). Coarse → fine: region ochre, area teal, location violet.
export const FN_TABS: Array<{ tab: string; level: FirstNationsLevel; label: string; color: string }> = [
  { tab: "regions", level: "ireg", label: "Regions", color: "#b45309" },
  { tab: "areas", level: "iare", label: "Areas", color: "#0d9488" },
  { tab: "locations", level: "iloc", label: "Locations", color: "#7c3aed" },
];

/** Friendly `?tab=` value for a level. */
export function firstNationsTab(level: FirstNationsLevel): string {
  return FN_TABS.find((t) => t.level === level)?.tab ?? "regions";
}

/** `?tab=` → level, accepting both the friendly name and the raw ABS level code. */
export function resolveFirstNationsLevel(tab: string | null | undefined): FirstNationsLevel {
  if (!tab) return "ireg";
  const byTab = FN_TABS.find((t) => t.tab === tab);
  if (byTab) return byTab.level;
  const byLevel = FN_TABS.find((t) => t.level === tab);
  return byLevel ? byLevel.level : "ireg";
}

/**
 * Mirror of the SQL that derives the slug in `geo.service.ts#FN_SLUG`:
 *   btrim(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '-')
 *
 * Needed because a map click hands back the boundary's NAME (the tile carries no slug), and
 * the URL must end up with exactly the slug the API would resolve. Names are unique at every
 * level, so the slug is a safe key. Drift here is a broken link, hence the unit tests.
 */
export function firstNationsSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
