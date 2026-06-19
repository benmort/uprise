import { describe, expect, it } from "vitest";
import { boundingBox, pointInGeometry, pointInPolygon, type Polygon } from "./geo";

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
