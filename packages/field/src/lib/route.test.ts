import { describe, expect, it } from "vitest";
import { optimiseRoute, routeLength, walkLineThrough, type Stop } from "./route";

describe("optimiseRoute", () => {
  it("returns a no-better-than-input-or-shorter route and keeps every stop", () => {
    // A deliberately bad input order zig-zagging across a grid.
    const stops: Stop[] = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 0, lng: 2 },
      { id: "c", lat: 0, lng: 1 },
      { id: "d", lat: 0, lng: 3 },
    ];
    const optimised = optimiseRoute(stops);

    expect(optimised).toHaveLength(4);
    expect(new Set(optimised.map((s) => s.id))).toEqual(new Set(["a", "b", "c", "d"]));
    expect(routeLength(optimised)).toBeLessThanOrEqual(routeLength(stops));
  });

  it("orders a simple line optimally", () => {
    const stops: Stop[] = [
      { id: "far", lat: 0, lng: 10 },
      { id: "near", lat: 0, lng: 1 },
      { id: "mid", lat: 0, lng: 5 },
    ];
    const optimised = optimiseRoute(stops, { lat: 0, lng: 0 });
    expect(optimised.map((s) => s.id)).toEqual(["near", "mid", "far"]);
  });

  it("appends stops with no coordinates at the end", () => {
    const stops: Stop[] = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 0, lng: 1 },
      { id: "c", lat: 0, lng: 2 },
      { id: "nocoord", lat: NaN, lng: NaN },
    ];
    const optimised = optimiseRoute(stops);
    expect(optimised[optimised.length - 1].id).toBe("nocoord");
  });
});

describe("walkLineThrough", () => {
  it("threads the points in order as GeoJSON [lng, lat]", () => {
    const line = walkLineThrough([
      { lat: -33.9, lng: 151.2 },
      { lat: -33.91, lng: 151.21 },
      { lat: -33.92, lng: 151.22 },
    ]);
    expect(line).toEqual({
      type: "LineString",
      coordinates: [
        [151.2, -33.9],
        [151.21, -33.91],
        [151.22, -33.92],
      ],
    });
  });

  it("drops non-finite points but keeps the line through the rest", () => {
    const line = walkLineThrough([
      { lat: -33.9, lng: 151.2 },
      { lat: NaN, lng: NaN },
      { lat: -33.92, lng: 151.22 },
    ]);
    expect(line?.coordinates).toEqual([
      [151.2, -33.9],
      [151.22, -33.92],
    ]);
  });

  it("returns null when fewer than two usable points remain", () => {
    expect(walkLineThrough([])).toBeNull();
    expect(walkLineThrough([{ lat: -33.9, lng: 151.2 }])).toBeNull();
    expect(walkLineThrough([{ lat: -33.9, lng: 151.2 }, { lat: NaN, lng: 151.2 }])).toBeNull();
  });
});
