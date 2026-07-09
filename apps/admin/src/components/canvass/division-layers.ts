import type { DivisionType } from "@/lib/api/geo";

/**
 * The division layers offered by the geo explorer, in display order.
 *
 * Labels name the CHAMBER, because "State" is ambiguous once a state has two houses (and
 * it already collided with the separate States kind). The raw ABS `sed` layer is
 * deliberately NOT offered: for Tasmania its rows are House-of-Assembly × Legislative-
 * Council intersection cells belonging to neither chamber, so showing them as "state
 * electorates" is simply wrong. It remains reachable by deep link for back-compat.
 *
 * The Senate and the NSW/SA/WA Legislative Councils are absent too — they have no
 * sub-state boundaries, so they live on the chamber-electorates surface instead.
 */
export const DIVISION_TABS: Array<{ type: DivisionType; label: string }> = [
  { type: "ced", label: "Federal – House of Reps" },
  { type: "sed_lower", label: "State – lower house" },
  { type: "sed_upper", label: "State – upper house" },
  { type: "lga", label: "Local (LGA)" },
  { type: "ward", label: "Ward" },
];

/** Just the layer keys, for the map's overlay stack and tab validation. */
export const DIVISION_TAB_TYPES: DivisionType[] = DIVISION_TABS.map((t) => t.type);

/**
 * Map colour per division layer — the legend dot on the pills uses the same palette, and
 * the map's boundary layers read it straight from here (one definition, two consumers;
 * these constants used to be copied into both divisions-panel and geo-surface).
 */
export const TYPE_COLORS: Record<DivisionType, string> = {
  ced: "#dc2626", // Federal — red
  sed: "#7c3aed", // Raw ABS state electorate — violet (deep-link only)
  sed_lower: "#7c3aed", // State lower house — violet
  sed_upper: "#0891b2", // State upper house — cyan
  lga: "#d97706", // Local (LGA) — amber
  ward: "#16a34a", // Ward — green
};

/** Old `?tab=` / `#hash` values that predate the chamber split. A bookmark pointing at the
 *  ambiguous "state" layer resolves to the lower house, which is what it always meant. */
export const LEGACY_TAB_ALIAS: Record<string, DivisionType> = {
  sed: "sed_lower",
  state: "sed_lower",
  federal: "ced",
  local: "lga",
};

/** Resolve a URL tab value to a real layer, honouring the legacy aliases. */
export function resolveDivisionTab(tab: string | null | undefined): DivisionType {
  if (tab && DIVISION_TAB_TYPES.includes(tab as DivisionType)) return tab as DivisionType;
  if (tab && LEGACY_TAB_ALIAS[tab]) return LEGACY_TAB_ALIAS[tab];
  return "ced";
}
