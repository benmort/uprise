import { MapboxDirectionsClient, MAX_WAYPOINTS, type LngLat } from "./mapbox-directions.client";

const configOf = (values: Record<string, string>) =>
  ({ get: (k: string, fb?: string) => values[k] ?? fb ?? "" }) as never;

const clientWith = (values: Record<string, string>) => new MapboxDirectionsClient(configOf(values));

/** `n` waypoints on a line — the shape an ordered turf route arrives in. */
const route = (n: number): LngLat[] => Array.from({ length: n }, (_, i) => ({ lat: -37.8, lng: 144.96 + i * 0.001 }));

const okResponse = (legs: Array<{ duration: number; distance: number }>) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({ code: "Ok", routes: [{ legs }] }),
});

const okRouteResponse = (
  legs: Array<{ duration: number; distance: number }>,
  coordinates: [number, number][],
) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => ({ code: "Ok", routes: [{ legs, geometry: { type: "LineString", coordinates } }] }),
});

describe("MapboxDirectionsClient", () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });
  afterAll(() => {
    global.fetch = realFetch;
  });

  describe("without a server token", () => {
    const client = clientWith({});

    it("reports itself disabled rather than reaching for the browser's public token", () => {
      expect(client.enabled).toBe(false);
    });

    it("prices nothing, and never calls Mapbox", async () => {
      expect(await client.priceRoute(route(10))).toBeNull();
      expect(await client.legs(route(3))).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("with a server token", () => {
    const client = clientWith({ MAPBOX_TOKEN: "sk.test", MAPBOX_DIRECTIONS_RPM: "600000" });

    it("asks the walking profile for legs, without the route geometry", async () => {
      fetchMock.mockResolvedValue(okResponse([{ duration: 30, distance: 40 }]));
      await client.legs(route(2));

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/directions/v5/mapbox/walking/");
      expect(url).toContain("overview=false"); // we want durations, not a line to draw
      expect(url).toContain("144.96,-37.8;144.961,-37.8");
    });

    it("sums every leg of every window into one route price", async () => {
      fetchMock.mockResolvedValue(okResponse([{ duration: 30, distance: 40 }, { duration: 20, distance: 25 }]));
      const priced = await client.priceRoute(route(3));
      expect(priced).toEqual({ seconds: 50, metres: 65, requests: 1 });
    });

    it("routeLegs keeps every per-leg metric across windows (not just the sum)", async () => {
      fetchMock.mockResolvedValue(okResponse([{ duration: 30, distance: 40 }, { duration: 20, distance: 25 }]));
      const res = await client.routeLegs(route(3)); // 2 legs, one window
      expect(res).toEqual({
        legs: [
          { distance: 40, duration: 30 },
          { distance: 25, duration: 20 },
        ],
        requests: 1,
      });
    });

    it("routeLegsAndGeometry asks for the full geojson line and returns it with the legs", async () => {
      fetchMock.mockResolvedValue(
        okRouteResponse([{ duration: 30, distance: 40 }, { duration: 20, distance: 25 }], [[0, 0], [0, 1], [0, 2]]),
      );
      const res = await client.routeLegsAndGeometry(route(3));
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("overview=full"); // the real path to draw, not a beeline
      expect(url).toContain("geometries=geojson");
      expect(res).toEqual({
        legs: [
          { distance: 40, duration: 30 },
          { distance: 25, duration: 20 },
        ],
        geometry: { type: "LineString", coordinates: [[0, 0], [0, 1], [0, 2]] },
        requests: 1,
      });
    });

    it("routeLegsAndGeometry stitches window geometries, dropping the duplicated seam coord", async () => {
      fetchMock
        .mockResolvedValueOnce(okRouteResponse([{ duration: 1, distance: 1 }], [[0, 0], [0, 1]]))
        .mockResolvedValueOnce(okRouteResponse([{ duration: 1, distance: 1 }], [[0, 1], [0, 2]]));
      const res = await client.routeLegsAndGeometry(route(26)); // 2 windows of 25, overlap by one
      expect(res!.requests).toBe(2);
      // Window 2's first coord ([0,1]) duplicates window 1's last and is dropped on stitch.
      expect(res!.geometry).toEqual({ type: "LineString", coordinates: [[0, 0], [0, 1], [0, 2]] });
    });

    it("routeLegsAndGeometry abandons the route (null) when a window fails", async () => {
      fetchMock
        .mockResolvedValueOnce(okRouteResponse([{ duration: 1, distance: 1 }], [[0, 0], [0, 1]]))
        .mockResolvedValueOnce({ ok: false, status: 422, headers: new Headers(), json: async () => ({}) });
      expect(await client.routeLegsAndGeometry(route(49))).toBeNull();
    });

    it("routeLegs abandons the route (null) when a window fails", async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse([{ duration: 1, distance: 1 }]))
        .mockResolvedValueOnce({ ok: false, status: 422, headers: new Headers(), json: async () => ({}) });
      expect(await client.routeLegs(route(49))).toBeNull();
    });

    it("windows a long route so no leg is ever stitched with a straight line", async () => {
      fetchMock.mockResolvedValue(okResponse([{ duration: 1, distance: 1 }]));
      const priced = await client.priceRoute(route(49)); // 48 legs → 2 windows of 25

      expect(priced!.requests).toBe(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The windows overlap by one: window 2 starts where window 1 ended.
      const [first, second] = fetchMock.mock.calls.map((c) => (c[0] as string).split("?")[0]);
      expect(first.split(";").pop()).toBe(second.split("/").pop()!.split(";")[0]);
    });

    it("refuses a window larger than the API accepts", async () => {
      expect(await client.legs(route(MAX_WAYPOINTS + 1))).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("abandons the whole route when a window fails, rather than under-counting the walk", async () => {
      fetchMock
        .mockResolvedValueOnce(okResponse([{ duration: 30, distance: 40 }]))
        .mockResolvedValueOnce({ ok: false, status: 422, headers: new Headers(), json: async () => ({}) });

      expect(await client.priceRoute(route(49))).toBeNull();
    });

    it("retries a 429 and honours Retry-After", async () => {
      const headers = new Headers({ "retry-after": "0" });
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 429, headers, json: async () => ({}) })
        .mockResolvedValueOnce(okResponse([{ duration: 12, distance: 15 }]));

      expect(await client.priceRoute(route(2))).toEqual({ seconds: 12, metres: 15, requests: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries a 5xx, then gives up rather than looping", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) });
      expect(await client.legs(route(2))).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("survives a network throw", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNRESET"));
      expect(await client.legs(route(2))).toBeNull();
    });

    it("returns null for a response with no legs, rather than a zero-second walk", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: async () => ({ routes: [] }) });
      expect(await client.legs(route(2))).toBeNull();
    });

    it("has nothing to price for a single building", async () => {
      expect(await client.priceRoute(route(1))).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("throttles itself to the configured requests per minute", async () => {
    const client = clientWith({ MAPBOX_TOKEN: "sk.test", MAPBOX_DIRECTIONS_RPM: "60" }); // 1/second
    fetchMock.mockResolvedValue(okResponse([{ duration: 1, distance: 1 }]));

    const started = Date.now();
    await client.legs(route(2));
    await client.legs(route(2));
    // The second request waits out the bucket interval.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  }, 10_000);
});
