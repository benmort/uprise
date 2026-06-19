import { describe, expect, it } from "vitest";
import {
  bboxOfGeometry,
  fillTemplate,
  latToTileY,
  lngToTileX,
  tilesForBbox,
  type Bbox,
} from "./map-cache";

describe("tile math", () => {
  it("maps lng/lat 0,0 to the expected tile at z1", () => {
    expect(lngToTileX(0, 1)).toBe(1);
    expect(latToTileY(0, 1)).toBe(1);
  });

  it("places the prime meridian/equator at tile 0 for z0", () => {
    expect(lngToTileX(0, 0)).toBe(0);
    expect(latToTileY(0, 0)).toBe(0);
  });
});

describe("tilesForBbox", () => {
  it("returns a single tile for a degenerate bbox at one zoom", () => {
    const tiles = tilesForBbox([0, 0, 0, 0], { min: 1, max: 1 });
    expect(tiles).toEqual([{ z: 1, x: 1, y: 1 }]);
  });

  it("adds more tiles as the zoom range widens", () => {
    const bbox: Bbox = [150.9, -33.9, 151.3, -33.7]; // inner Sydney
    const oneLevel = tilesForBbox(bbox, { min: 13, max: 13 });
    const threeLevels = tilesForBbox(bbox, { min: 13, max: 15 });
    expect(threeLevels.length).toBeGreaterThan(oneLevel.length);
  });

  it("clamps tile indices to valid range and counts the full grid", () => {
    const tiles = tilesForBbox([-180, -85, 180, 85], { min: 1, max: 1 });
    // Whole world at z1 → the full 2×2 grid.
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(1);
    }
  });

  it("grid size equals (xspan)·(yspan) at a single zoom", () => {
    const bbox: Bbox = [150.9, -33.9, 151.3, -33.7];
    const z = 14;
    const xSpan = lngToTileX(bbox[2], z) - lngToTileX(bbox[0], z) + 1;
    const ySpan = latToTileY(bbox[1], z) - latToTileY(bbox[3], z) + 1;
    expect(tilesForBbox(bbox, { min: z, max: z })).toHaveLength(xSpan * ySpan);
  });
});

describe("bboxOfGeometry", () => {
  it("computes the bbox of a polygon", () => {
    const geometry: GeoJSON.Geometry = {
      type: "Polygon",
      coordinates: [[[150, -34], [151, -34], [151, -33], [150, -33], [150, -34]]],
    };
    expect(bboxOfGeometry(geometry)).toEqual([150, -34, 151, -33]);
  });

  it("returns null for missing geometry", () => {
    expect(bboxOfGeometry(null)).toBeNull();
    expect(bboxOfGeometry(undefined)).toBeNull();
  });
});

describe("fillTemplate", () => {
  it("substitutes z/x/y", () => {
    expect(fillTemplate("https://t/{z}/{x}/{y}.pbf", { z: 14, x: 1, y: 2 })).toBe(
      "https://t/14/1/2.pbf",
    );
  });
});
