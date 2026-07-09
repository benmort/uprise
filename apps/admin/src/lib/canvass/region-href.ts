import type { RegionKind, RegionRef } from "@/lib/api/geo";
import { stateAsgsDigitToAbbrev } from "@/lib/canvass/states";
import { firstNationsSlug } from "@/lib/canvass/first-nations";

/**
 * The single source of truth for where each region kind links in the explorer.
 * The geo explorer lives under /data/* (recently moved from /canvass/*); keeping
 * every hierarchy link here means a future route move is a one-file change.
 * Returns null for kinds with no detail target (an address is a leaf — the
 * addresses explorer is geocode-driven, not per-door).
 */
export function regionHref(ref: Pick<RegionRef, "kind" | "code"> & { name?: string }): string | null {
  const code = encodeURIComponent(ref.code);
  switch (ref.kind) {
    case "state":
      return `/data/states?code=${code}`;
    case "ced":
    case "sed":
    case "sed_lower":
    case "sed_upper":
    case "lga":
    case "ward":
      return `/data/divisions/${ref.kind}/${code}`;
    case "ireg":
    case "iare":
    case "iloc":
      // First Nations URLs carry the name slug, not the ABS code. The hierarchy always
      // supplies a name; fall back to the code, which the API also resolves.
      return `/data/first-nations/${ref.kind}/${
        ref.name ? encodeURIComponent(firstNationsSlug(ref.name)) : code
      }`;
    case "sa4":
    case "sa3":
    case "sa2":
    case "sa1":
    case "mb":
      return `/data/areas/${ref.kind}/${code}`;
    case "address":
      return null;
    default:
      return null;
  }
}

/** "View all areas in <state>" — the Areas explorer filtered to a state digit
 *  (uses the shared ?state= abbreviation filter). Null for digit 9 (no abbrev). */
export function areasInStateHref(stateDigit: string): string | null {
  const abbrev = stateAsgsDigitToAbbrev(stateDigit);
  return abbrev ? `/data/areas?state=${abbrev}` : null;
}

/** "View divisions in <state>" — the Divisions explorer filtered to a state. */
export function divisionsInStateHref(stateDigit: string): string | null {
  const abbrev = stateAsgsDigitToAbbrev(stateDigit);
  return abbrev ? `/data/divisions?state=${abbrev}` : null;
}

/** Short label per kind for breadcrumb chips / group tags. Exhaustive by construction —
 *  widening RegionKind breaks the build here until the new kind is named. */
export const REGION_KIND_LABEL: Record<RegionKind, string> = {
  state: "State",
  ced: "Federal",
  // The raw ABS layer. Kept for back-compat and deep links; the chamber-pure pair below is
  // what an organiser should normally see.
  sed: "State electorate (ABS)",
  sed_lower: "State lower house",
  sed_upper: "State upper house",
  lga: "LGA",
  ward: "Ward",
  // ABS Indigenous Structure — statistical geographies, not nation or language boundaries.
  ireg: "Indigenous region",
  iare: "Indigenous area",
  iloc: "Indigenous location",
  sa4: "SA4",
  sa3: "SA3",
  sa2: "SA2",
  sa1: "SA1",
  mb: "Meshblock",
  address: "Address",
};
