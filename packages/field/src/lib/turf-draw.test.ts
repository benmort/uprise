import { describe, expect, it } from "vitest";
import {
  addVertex,
  doorsInsideRing,
  formatArea,
  MIN_TURF_AREA_SQM,
  outerRingCentroid,
  ringAreaSqM,
  ringIsSimple,
  ringToPolygon,
  segmentsCross,
  undoVertex,
  validateRing,
} from "./turf-draw";
import type { LngLat, Ring } from "./geo";

// A ~440 m × ~440 m block in inner Melbourne — comfortably a real turf.
const BLOCK: Ring = [
  [144.95, -37.81],
  [144.955, -37.81],
  [144.955, -37.814],
  [144.95, -37.814],
];

describe("addVertex", () => {
  it("appends a corner", () => {
    expect(addVertex([], [144.95, -37.81])).toEqual([[144.95, -37.81]]);
  });

  it("ignores a double-tap on the corner just placed", () => {
    const ring: Ring = [[144.95, -37.81]];
    // ~2 m away — inside the 3 m gap, so it's the same tap.
    const same = addVertex(ring, [144.950022, -37.81]);
    expect(same).toBe(ring); // same reference: nothing to re-render
  });

  it("accepts a corner beyond the minimum gap", () => {
    const ring: Ring = [[144.95, -37.81]];
    expect(addVertex(ring, [144.9502, -37.81])).toHaveLength(2);
  });
});

describe("undoVertex", () => {
  it("drops the last corner", () => {
    expect(undoVertex(BLOCK)).toHaveLength(3);
  });

  it("is a no-op on an empty ring", () => {
    const empty: Ring = [];
    expect(undoVertex(empty)).toBe(empty);
  });
});

describe("segmentsCross", () => {
  it("detects a proper crossing", () => {
    expect(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
  });

  it("ignores segments that merely share an endpoint (adjacent edges)", () => {
    expect(segmentsCross([0, 0], [1, 1], [1, 1], [2, 0])).toBe(false);
  });

  it("returns false for disjoint segments", () => {
    expect(segmentsCross([0, 0], [1, 0], [0, 1], [1, 1])).toBe(false);
  });
});

describe("ringIsSimple", () => {
  it("accepts a plain rectangle", () => {
    expect(ringIsSimple(BLOCK)).toBe(true);
  });

  it("accepts any triangle without testing edges", () => {
    expect(ringIsSimple([[0, 0], [1, 0], [0, 1]])).toBe(true);
  });

  it("rejects a figure-of-eight", () => {
    expect(ringIsSimple([[0, 0], [2, 2], [2, 0], [0, 2]])).toBe(false);
  });
});

describe("ringAreaSqM", () => {
  it("is zero for fewer than three corners", () => {
    expect(ringAreaSqM([[144.95, -37.81], [144.955, -37.81]])).toBe(0);
  });

  it("measures a rectangle to within a percent of its true size", () => {
    // 0.005° lng at -37.81° ≈ 440 m; 0.004° lat ≈ 442 m.
    const expected = 0.005 * 111_320 * Math.cos((37.81 * Math.PI) / 180) * 0.004 * 110_540;
    expect(ringAreaSqM(BLOCK)).toBeCloseTo(expected, -3);
  });

  it("is unsigned, and identical whichever corner the drawing started from", () => {
    expect(ringAreaSqM([...BLOCK].reverse())).toBeCloseTo(ringAreaSqM(BLOCK), 5);
    const rotated: Ring = [...BLOCK.slice(2), ...BLOCK.slice(0, 2)];
    expect(ringAreaSqM(rotated)).toBeCloseTo(ringAreaSqM(BLOCK), 5);
  });
});

describe("formatArea", () => {
  it("uses square metres below the km² threshold", () => {
    expect(formatArea(8_400)).toBe("8,400 m²");
  });

  it("switches to km² for a big turf", () => {
    expect(formatArea(420_000)).toBe("0.42 km²");
  });
});

describe("ringToPolygon", () => {
  it("closes the ring by repeating the first corner", () => {
    const poly = ringToPolygon(BLOCK)!;
    expect(poly.type).toBe("Polygon");
    expect(poly.coordinates[0]).toHaveLength(BLOCK.length + 1);
    expect(poly.coordinates[0]![0]).toEqual(poly.coordinates[0]![BLOCK.length]);
  });

  it("returns null when there aren't enough corners to enclose anything", () => {
    expect(ringToPolygon([[0, 0], [1, 1]])).toBeNull();
  });
});

describe("validateRing", () => {
  const boundary = {
    type: "Polygon",
    coordinates: [[[144.94, -37.82], [144.96, -37.82], [144.96, -37.80], [144.94, -37.80], [144.94, -37.82]]],
  };

  it("passes a real block inside the campaign", () => {
    expect(validateRing(BLOCK, boundary)).toBeNull();
  });

  it("passes when no boundary is set at all", () => {
    expect(validateRing(BLOCK, null)).toBeNull();
  });

  it("reports too-few corners first", () => {
    expect(validateRing([[144.95, -37.81], [144.955, -37.81]], boundary)).toBe("too-few");
  });

  it("reports a self-crossing outline", () => {
    const bowtie: Ring = [
      [144.95, -37.81],
      [144.955, -37.814],
      [144.955, -37.81],
      [144.95, -37.814],
    ];
    expect(validateRing(bowtie, boundary)).toBe("self-crossing");
  });

  it("rejects a tap-wobble triangle as too small", () => {
    const speck: Ring = [
      [144.95, -37.81],
      [144.95005, -37.81],
      [144.95005, -37.81005],
    ];
    expect(ringAreaSqM(speck)).toBeLessThan(MIN_TURF_AREA_SQM);
    expect(validateRing(speck, boundary)).toBe("too-small");
  });

  it("warns when a corner falls outside the campaign boundary", () => {
    const straddling: Ring = [
      [144.95, -37.81],
      [144.99, -37.81], // east of the boundary
      [144.955, -37.814],
    ];
    expect(validateRing(straddling, boundary)).toBe("outside-boundary");
  });

  it("ignores a malformed boundary rather than blocking the claim", () => {
    expect(validateRing(BLOCK, { type: "Polygon" })).toBeNull();
  });
});

describe("outerRingCentroid", () => {
  it("averages a Polygon's outer ring", () => {
    expect(outerRingCentroid({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] })).toEqual([1, 1]);
  });

  it("uses the first polygon of a MultiPolygon", () => {
    const g = { type: "MultiPolygon", coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2]]], [[[10, 10], [11, 10], [11, 11]]]] };
    expect(outerRingCentroid(g)).toEqual([1, 1]);
  });

  it("returns null for anything that isn't an area", () => {
    expect(outerRingCentroid(null)).toBeNull();
    expect(outerRingCentroid({ type: "LineString", coordinates: [[0, 0], [1, 1]] })).toBeNull();
    expect(outerRingCentroid({ type: "Polygon", coordinates: [[]] })).toBeNull();
  });
});

describe("doorsInsideRing", () => {
  const areaAt = (lng: number, lat: number, addresses: number) => ({
    geometry: { type: "Polygon", coordinates: [[[lng, lat], [lng + 0.0001, lat], [lng + 0.0001, lat + 0.0001], [lng, lat + 0.0001]]] },
    properties: { addresses },
  });

  it("sums the areas whose centroid falls inside the drawing", () => {
    const inside = areaAt(144.952, -37.812, 40);
    const outside = areaAt(144.97, -37.812, 500);
    expect(doorsInsideRing(BLOCK, [inside, outside])).toBe(40);
  });

  it("treats an area with no count as zero doors", () => {
    const noCount = { geometry: areaAt(144.952, -37.812, 0).geometry, properties: {} };
    expect(doorsInsideRing(BLOCK, [noCount])).toBe(0);
  });

  it("is zero before the ring encloses anything", () => {
    const partial: LngLat[] = [[144.95, -37.81], [144.955, -37.81]];
    expect(doorsInsideRing(partial, [areaAt(144.952, -37.812, 40)])).toBe(0);
  });
});
