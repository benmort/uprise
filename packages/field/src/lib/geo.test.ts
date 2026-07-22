import { describe, expect, it } from "vitest";
import { bboxRing, bearingBetween, bearingIfMoved, boundingBox, metresBetween, pointInGeometry, pointInPolygon, type Polygon } from "./geo";

const square: Polygon = [
  [
    [0, 0],
    [0, 4],
    [4, 4],
    [4, 0],
    [0, 0],
  ],
];

describe("pointInPolygon", () => {
  it("detects a point inside", () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
  });

  it("detects a point outside", () => {
    expect(pointInPolygon([5, 5], square)).toBe(false);
  });

  it("excludes points inside a hole", () => {
    const withHole: Polygon = [
      square[0],
      [
        [1, 1],
        [1, 3],
        [3, 3],
        [3, 1],
        [1, 1],
      ],
    ];
    expect(pointInPolygon([2, 2], withHole)).toBe(false); // in the hole
    expect(pointInPolygon([0.5, 0.5], withHole)).toBe(true); // in the ring, outside hole
  });
});

describe("pointInGeometry", () => {
  it("handles MultiPolygon", () => {
    const geom = {
      type: "MultiPolygon",
      coordinates: [square, [[[10, 10], [10, 12], [12, 12], [12, 10], [10, 10]]]],
    };
    expect(pointInGeometry([11, 11], geom)).toBe(true);
    expect(pointInGeometry([6, 6], geom)).toBe(false);
  });
});

describe("boundingBox", () => {
  it("computes the bbox of a set of points", () => {
    expect(boundingBox([[0, 1], [3, -2], [-1, 5]])).toEqual({
      minLng: -1,
      minLat: -2,
      maxLng: 3,
      maxLat: 5,
    });
  });

  it("returns null for no points", () => {
    expect(boundingBox([])).toBeNull();
  });
});

describe("bboxRing", () => {
  it("builds a closed [w,s,e,n] rectangle ring", () => {
    expect(bboxRing([144.9, -37.8, 145.0, -37.7])).toEqual([
      [144.9, -37.8],
      [145.0, -37.8],
      [145.0, -37.7],
      [144.9, -37.7],
      [144.9, -37.8],
    ]);
  });

  it("returns undefined for null / malformed / non-finite bboxes", () => {
    expect(bboxRing(null)).toBeUndefined();
    expect(bboxRing(undefined)).toBeUndefined();
    expect(bboxRing([1, 2, 3])).toBeUndefined();
    expect(bboxRing([1, 2, 3, Number.NaN])).toBeUndefined();
    expect(bboxRing("not-a-bbox")).toBeUndefined();
  });
});

describe("bearing helpers", () => {
  const HOME = { lat: -33.9, lng: 151.2 };

  it("bearingBetween gives compass bearings for the four cardinal moves", () => {
    expect(bearingBetween(HOME, { lat: -33.89, lng: 151.2 })).toBeCloseTo(0, 0); // north
    expect(bearingBetween(HOME, { lat: -33.9, lng: 151.21 })).toBeCloseTo(90, 0); // east
    expect(bearingBetween(HOME, { lat: -33.91, lng: 151.2 })).toBeCloseTo(180, 0); // south
    expect(bearingBetween(HOME, { lat: -33.9, lng: 151.19 })).toBeCloseTo(270, 0); // west
  });

  it("metresBetween approximates street-scale distances", () => {
    // ~1.11km per 0.01° latitude.
    expect(metresBetween(HOME, { lat: -33.91, lng: 151.2 })).toBeGreaterThan(1050);
    expect(metresBetween(HOME, { lat: -33.91, lng: 151.2 })).toBeLessThan(1170);
  });

  it("bearingIfMoved suppresses jitter below the movement gate", () => {
    // ~1m north: below the default 5m gate.
    expect(bearingIfMoved(HOME, { lat: HOME.lat + 0.00001, lng: HOME.lng })).toBeNull();
    // ~110m north: a real move.
    expect(bearingIfMoved(HOME, { lat: HOME.lat + 0.001, lng: HOME.lng })).toBeCloseTo(0, 0);
  });
});
