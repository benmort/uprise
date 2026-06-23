import { describe, expect, it } from "vitest";
import { optimiseRoute, routeLength, type Stop } from "./route";

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
