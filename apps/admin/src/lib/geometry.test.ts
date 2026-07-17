import { describe, it, expect } from "vitest";
import { outerRing } from "./geometry";

describe("outerRing", () => {
  it("returns the outer ring of a Polygon", () => {
    const ring: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 0]];
    expect(outerRing({ type: "Polygon", coordinates: [ring] })).toEqual(ring);
  });

  it("returns the first polygon's outer ring of a MultiPolygon", () => {
    const ring: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 0]];
    expect(outerRing({ type: "MultiPolygon", coordinates: [[ring]] })).toEqual(ring);
  });

  it("returns undefined for null, non-objects, or unsupported geometry types", () => {
    expect(outerRing(null)).toBeUndefined();
    expect(outerRing(undefined)).toBeUndefined();
    expect(outerRing({})).toBeUndefined();
    expect(outerRing({ type: "Point", coordinates: [0, 0] })).toBeUndefined();
  });
});
