import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coordKey,
  fetchWalkingDirections,
  fetchWalkingRouteGeometry,
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

describe("fetchWalkingRouteGeometry", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = OLD_TOKEN;
    vi.restoreAllMocks();
  });

  const pt = (i: number): LatLng => ({ lat: -33.8 - i * 0.001, lng: 151.2 + i * 0.001 });

  it("returns null with no token or fewer than two finite points", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "";
    expect(await fetchWalkingRouteGeometry([pt(0), pt(1)])).toBeNull();
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
    expect(await fetchWalkingRouteGeometry([])).toBeNull();
    expect(await fetchWalkingRouteGeometry([pt(0)])).toBeNull();
    expect(await fetchWalkingRouteGeometry([pt(0), { lat: NaN, lng: NaN }])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches one window for ≤25 points and returns the street line", async () => {
    const line = { type: "LineString", coordinates: [[151.2, -33.8], [151.201, -33.801], [151.202, -33.802]] };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ routes: [{ geometry: line }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWalkingRouteGeometry([pt(0), pt(1), pt(2)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/directions/v5/mapbox/walking/");
    expect(url).toContain("overview=full");
    expect(url).toContain("geometries=geojson");
    expect(res).toEqual(line);
  });

  it("windows >25 points (overlap by one) and stitches, dropping each seam's duplicate point", async () => {
    const win1 = { type: "LineString", coordinates: [[0, 0], [1, 1], [2, 2]] };
    const win2 = { type: "LineString", coordinates: [[2, 2], [3, 3]] }; // starts at the seam
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ geometry: win1 }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ geometry: win2 }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const points = Array.from({ length: 26 }, (_, i) => pt(i)); // 26 → two windows (25 + 2)
    const res = await fetchWalkingRouteGeometry(points);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Window 2 shares its first waypoint with window 1's last.
    const url1 = String(fetchMock.mock.calls[0][0]);
    const url2 = String(fetchMock.mock.calls[1][0]);
    expect(url1.split(";")).toHaveLength(25);
    expect(url2.split(";")).toHaveLength(2);
    expect(res).toEqual({ type: "LineString", coordinates: [[0, 0], [1, 1], [2, 2], [3, 3]] });
  });

  it("returns null when any window fails — a partial line must not pose as the route", async () => {
    const win1 = { type: "LineString", coordinates: [[0, 0], [1, 1]] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ geometry: win1 }] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const points = Array.from({ length: 26 }, (_, i) => pt(i));
    expect(await fetchWalkingRouteGeometry(points)).toBeNull();
  });

  it("returns null on a network error or an empty/absent geometry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchWalkingRouteGeometry([pt(0), pt(1)])).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ routes: [{}] }) })));
    expect(await fetchWalkingRouteGeometry([pt(0), pt(1)])).toBeNull();
  });
});
