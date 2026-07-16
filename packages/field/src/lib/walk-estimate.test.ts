import { describe, expect, it } from "vitest";
import { compareRouteFromHere } from "./walk-estimate";
import type { Stop } from "./route";

// A line of stops running west→east; a volunteer standing at the EAST end should be
// told to start from the east stop, saving the long back-track the west-first order costs.
const s = (id: string, lng: number): Stop => ({ id, lat: -37.8, lng });
const line: Stop[] = [s("w", 144.90), s("m", 144.95), s("e", 145.00)];

describe("compareRouteFromHere", () => {
  it("suggests starting from the nearest stop when the volunteer is at the far end", () => {
    const atEast = { lat: -37.8, lng: 145.001 };
    // Current order starts at the west end (a long walk to reach it).
    const res = compareRouteFromHere(line, atEast, line);
    expect(res).not.toBeNull();
    expect(res!.order[0].id).toBe("e"); // start next to the volunteer
    expect(res!.savedMetres).toBeGreaterThan(100);
    expect(res!.savedSeconds).toBeGreaterThan(0);
  });

  it("returns null when the current order is already optimal from here", () => {
    const atWest = { lat: -37.8, lng: 144.899 };
    // Current order already starts at the nearest (west) stop.
    expect(compareRouteFromHere(line, atWest, line)).toBeNull();
  });

  it("returns null with fewer than two stops", () => {
    expect(compareRouteFromHere([s("only", 144.9)], { lat: -37.8, lng: 145 }, [s("only", 144.9)])).toBeNull();
  });
});
