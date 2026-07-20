import { geometryBbox, pointInGeometry } from "./geo.utils";

const square = {
  type: "Polygon",
  coordinates: [
    [
      [144.9, -37.8],
      [144.9, -37.7],
      [145.0, -37.7],
      [145.0, -37.8],
      [144.9, -37.8],
    ],
  ],
};

describe("geometryBbox", () => {
  it("returns [w,s,e,n] for a Polygon", () => {
    expect(geometryBbox(square)).toEqual([144.9, -37.8, 145.0, -37.7]);
  });

  it("spans every part of a MultiPolygon (holes included)", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [
        square.coordinates,
        [
          [
            [145.2, -37.9],
            [145.2, -37.85],
            [145.3, -37.85],
            [145.3, -37.9],
            [145.2, -37.9],
          ],
        ],
      ],
    };
    expect(geometryBbox(multi)).toEqual([144.9, -37.9, 145.3, -37.7]);
  });

  it("returns null for null / non-geometry / empty coordinates", () => {
    expect(geometryBbox(null)).toBeNull();
    expect(geometryBbox(undefined)).toBeNull();
    expect(geometryBbox({ type: "Polygon" })).toBeNull();
    expect(geometryBbox({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(geometryBbox("not-geojson")).toBeNull();
  });
});

describe("pointInGeometry", () => {
  it("detects containment for a Polygon and rejects an outside point", () => {
    expect(pointInGeometry([144.95, -37.75], square)).toBe(true);
    expect(pointInGeometry([146, -37.75], square)).toBe(false);
    expect(pointInGeometry([144.95, -37.75], null)).toBe(false);
  });
});
