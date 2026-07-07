/**
 * The shared `?state=` token for the geo explorer is the state ABBREVIATION
 * (NSW/VIC/…) so it round-trips readably and carries across kinds: divisions
 * store the full state name (`Division.state`), areas are keyed by the ASGS
 * state digit (first digit of every area/mb code). This module maps both onto
 * the one abbreviation vocabulary.
 */

export const STATE_ABBREVS = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;
export type StateAbbrev = (typeof STATE_ABBREVS)[number];

const NAME_TO_ABBREV: Record<string, StateAbbrev> = {
  "New South Wales": "NSW",
  Victoria: "VIC",
  Queensland: "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  Tasmania: "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT",
};

/** `Division.state` full name → abbreviation (null if unknown/absent). */
export function stateNameToAbbrev(name?: string | null): StateAbbrev | null {
  return name ? (NAME_TO_ABBREV[name] ?? null) : null;
}

// ASGS state digit = the first digit of every SA/meshblock code.
const ABBREV_TO_ASGS: Record<StateAbbrev, string> = {
  NSW: "1",
  VIC: "2",
  QLD: "3",
  SA: "4",
  WA: "5",
  TAS: "6",
  NT: "7",
  ACT: "8",
};

/** Abbreviation → ASGS state digit for `searchAreas(state)` (undefined if unknown). */
export function stateAbbrevToAsgsDigit(abbrev?: string | null): string | undefined {
  return abbrev && abbrev in ABBREV_TO_ASGS ? ABBREV_TO_ASGS[abbrev as StateAbbrev] : undefined;
}

const ASGS_TO_ABBREV: Record<string, StateAbbrev> = Object.fromEntries(
  (Object.entries(ABBREV_TO_ASGS) as Array<[StateAbbrev, string]>).map(([a, d]) => [d, a]),
) as Record<string, StateAbbrev>;

/** ASGS state digit (e.g. geo.state.code "1") → abbreviation ("NSW"). Digit 9
 *  ("Other Territories") has no abbreviation → undefined. */
export function stateAsgsDigitToAbbrev(digit?: string | null): StateAbbrev | undefined {
  return digit && digit in ASGS_TO_ABBREV ? ASGS_TO_ABBREV[digit] : undefined;
}

/** Rough per-state bounding box `[west, south, east, north]` for framing the geo
 *  explorer map when the shared State Filter picks a state. */
const STATE_BBOX: Record<StateAbbrev, [number, number, number, number]> = {
  NSW: [141.0, -37.51, 153.55, -28.16],
  VIC: [140.96, -39.14, 149.98, -33.98],
  QLD: [138.0, -29.18, 153.55, -10.5],
  SA: [129.0, -38.06, 141.0, -25.99],
  WA: [112.92, -35.2, 129.0, -13.69],
  TAS: [143.8, -43.65, 148.52, -39.5],
  NT: [129.0, -26.0, 138.0, -10.9],
  ACT: [148.76, -35.95, 149.4, -35.1],
};

/** Abbreviation ("NSW") → `[w, s, e, n]` bounds for the map, or undefined when
 *  no state is selected / the abbreviation is unknown. */
export function stateBounds(abbrev?: string | null): [number, number, number, number] | undefined {
  return abbrev && abbrev in STATE_BBOX ? STATE_BBOX[abbrev as StateAbbrev] : undefined;
}
