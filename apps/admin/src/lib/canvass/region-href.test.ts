import { describe, expect, it } from "vitest";
import type { RegionKind } from "@/lib/api/geo";
import { REGION_KIND_LABEL, regionHref } from "./region-href";

/**
 * The chamber layers must route and label like every other division kind. REGION_KIND_LABEL
 * is an exhaustive `Record<RegionKind, string>`, so a missing entry is a compile error —
 * this pins the runtime half: every kind either has a detail route or is a deliberate leaf.
 */
describe("regionHref", () => {
  it.each([
    ["ced", "/data/divisions/ced/C1"],
    ["sed", "/data/divisions/sed/20106"],
    ["sed_lower", "/data/divisions/sed_lower/20106"],
    ["sed_upper", "/data/divisions/sed_upper/2-LC-SOUTHERN-METROPOLITAN"],
    ["lga", "/data/divisions/lga/20110"],
    ["ward", "/data/divisions/ward/20110-W-NORTH"],
  ] as const)("routes %s to its division detail page", (kind, expected) => {
    const code = expected.split("/").pop()!;
    expect(regionHref({ kind, code })).toBe(expected);
  });

  it("percent-encodes a code so a slug with separators survives the URL", () => {
    expect(regionHref({ kind: "sed_upper", code: "6-LC-CO/CO" })).toBe("/data/divisions/sed_upper/6-LC-CO%2FCO");
  });

  // First Nations links carry the NAME slug, so the hierarchy breadcrumb reads
  // /data/first-nations/ireg/sydney-wollongong rather than .../107.
  it.each([
    ["ireg", "107", "Sydney - Wollongong", "/data/first-nations/ireg/sydney-wollongong"],
    ["iare", "101001", "Bogan", "/data/first-nations/iare/bogan"],
    ["iloc", "10100101", "Dubbo - East", "/data/first-nations/iloc/dubbo-east"],
  ] as const)("routes %s to the First Nations explorer by slug, not to divisions", (kind, code, name, expected) => {
    const href = regionHref({ kind, code, name })!;
    expect(href).toBe(expected);
    // Reference-only: an Indigenous layer must never be reachable through the divisions
    // surface, which is where turf-cutting lives.
    expect(href).not.toContain("/data/divisions/");
  });

  it("falls back to the ABS code when a First Nations ref carries no name", () => {
    expect(regionHref({ kind: "ireg", code: "107" })).toBe("/data/first-nations/ireg/107");
  });

  it("keeps the state and ASGS routes untouched", () => {
    expect(regionHref({ kind: "state", code: "2" })).toBe("/data/states?code=2");
    expect(regionHref({ kind: "sa3", code: "20101" })).toBe("/data/areas/sa3/20101");
  });

  it("returns null for an address — a leaf with no detail route", () => {
    expect(regionHref({ kind: "address", code: "GA1" })).toBeNull();
  });
});

describe("REGION_KIND_LABEL", () => {
  it("names every region kind, and distinguishes the two state chambers", () => {
    const kinds: RegionKind[] = [
      "state", "ced", "sed", "sed_lower", "sed_upper", "lga", "ward",
      "ireg", "iare", "iloc",
      "sa4", "sa3", "sa2", "sa1", "mb", "address",
    ];
    for (const k of kinds) expect(REGION_KIND_LABEL[k]).toBeTruthy();
    expect(REGION_KIND_LABEL.sed_lower).toBe("State lower house");
    expect(REGION_KIND_LABEL.sed_upper).toBe("State upper house");
    // The raw ABS layer is labelled as such: for Tasmania its rows are neither chamber.
    expect(REGION_KIND_LABEL.sed).toContain("ABS");
    expect(REGION_KIND_LABEL.ireg).toBe("Indigenous region");
    expect(REGION_KIND_LABEL.iloc).toBe("Indigenous location");
  });
});
