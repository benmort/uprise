import { describe, expect, it } from "vitest";
import { CHAMBER_COLOURS, JURISDICTION_COLOURS, chipTint } from "./party-colours";

const HEX = /^#[0-9a-f]{6}$/;

describe("party-colours", () => {
  it("covers every Australian jurisdiction with a valid hex", () => {
    for (const key of ["FEDERAL", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]) {
      expect(JURISDICTION_COLOURS[key], key).toMatch(HEX);
    }
  });

  it("covers both chambers with a valid hex", () => {
    expect(CHAMBER_COLOURS.LOWER).toMatch(HEX);
    expect(CHAMBER_COLOURS.UPPER).toMatch(HEX);
  });

  it("chipTint derives a ~12% background from the full-strength text colour", () => {
    expect(chipTint("#4f46e5")).toEqual({ backgroundColor: "#4f46e51f", color: "#4f46e5" });
  });
});
