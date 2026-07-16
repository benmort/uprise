import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coordKey,
  fetchWalkingDirections,
  formatDistance,
  formatDuration,
  type LatLng,
} from "./directions";

const OLD_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const FROM: LatLng = { lat: -33.868, lng: 151.209 };
const TO: LatLng = { lat: -33.87, lng: 151.21 };

describe("coordKey", () => {
  it("rounds each coordinate to 5 decimals", () => {
    expect(coordKey({ lat: -33.868123, lng: 151.209456 })).toBe("-33.86812,151.20946");
  });
});

describe("formatDistance", () => {
  it("renders sub-kilometre distances in whole metres", () => {
    expect(formatDistance(120)).toBe("120 m");
    expect(formatDistance(120.6)).toBe("121 m");
  });

  it("renders kilometre distances to one decimal", () => {
    expect(formatDistance(1400)).toBe("1.4 km");
    expect(formatDistance(1000)).toBe("1.0 km");
  });
});

describe("formatDuration", () => {
  it("rounds to whole minutes", () => {
    expect(formatDuration(180)).toBe("3 min");
  });

  it("floors at one minute", () => {
    expect(formatDuration(10)).toBe("1 min");
    expect(formatDuration(0)).toBe("1 min");
  });
});

describe("fetchWalkingDirections", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = OLD_TOKEN;
    vi.restoreAllMocks();
  });

  it("returns null with no token (never touches the network)", async () => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchWalkingDirections(FROM, TO)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the walking profile with lng,lat coords and the expected query params", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distance: 0, duration: 0, geometry: { type: "LineString", coordinates: [] } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWalkingDirections(FROM, TO);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/directions/v5/mapbox/walking/");
    expect(url).toContain("151.209,-33.868;151.21,-33.87");
    expect(url).toContain("steps=true");
    expect(url).toContain("geometries=geojson");
    expect(url).toContain("overview=full");
    expect(url).toContain("access_token=pk.test");
  });

  it("maps the first route into geometry, rounded distance/duration and flattened steps", async () => {
    const geometry = { type: "LineString", coordinates: [[0, 0], [1, 1]] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          routes: [
            {
              distance: 1234.6,
              duration: 610.4,
              geometry,
              legs: [{ steps: [{ maneuver: { instruction: "Head north" }, distance: 100.6 }, {}] }],
            },
          ],
        }),
      })),
    );
    const res = await fetchWalkingDirections(FROM, TO);
    expect(res).toEqual({
      geometry,
      distanceM: 1235,
      durationS: 610,
      steps: [
        { instruction: "Head north", distanceM: 101 },
        { instruction: "", distanceM: 0 },
      ],
    });
  });

  it("passes the abort signal through to fetch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ routes: [{ distance: 0, duration: 0, geometry: { type: "LineString", coordinates: [] } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    await fetchWalkingDirections(FROM, TO, signal);
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal });
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await fetchWalkingDirections(FROM, TO)).toBeNull();
  });

  it("returns null when the payload has no routes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ routes: [] }) })));
    expect(await fetchWalkingDirections(FROM, TO)).toBeNull();
  });

  it("returns null on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchWalkingDirections(FROM, TO)).toBeNull();
  });
});
