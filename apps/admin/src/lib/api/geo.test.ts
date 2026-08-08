import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  browsePollingPlaces,
  listPollingPlacePoints,
  getPollingPlace,
  listChambers,
  listChamberElectorates,
  getChamberElectorate,
  getRegionPolling,
  listFirstNations,
  getFirstNations,
  getDensityScale,
  getReferendum,
  getAreaAddressCount,
  getAddressDetail,
  browseAreas,
  createTurfFromAreas,
  createTurfFromDivision,
  createTurfFromSources,
  getArea,
  getAreaDetail,
  getDivision,
  getGeoStatus,
  getRegionHierarchy,
  getState,
  listAreas,
  listDivisions,
  listStates,
  listUniverseAddresses,
  nearbyAddresses,
  searchAreas,
  triggerGeoIngest,
} from "./geo";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("geo api client — polling places", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("browsePollingPlaces builds the jurisdiction/state/q/paging query", async () => {
    await browsePollingPlaces({ jurisdiction: "federal", state: "NSW", q: "bon", limit: 20, offset: 40 });
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("/geo/polling-places?");
    expect(url).toContain("jurisdiction=federal");
    expect(url).toContain("state=NSW");
    expect(url).toContain("q=bon");
    expect(url).toContain("limit=20");
    expect(url).toContain("offset=40");
  });

  it("browsePollingPlaces drops the 'all' jurisdiction sentinel", async () => {
    await browsePollingPlaces({ jurisdiction: "all" });
    expect(mockReq.mock.calls[0][0]).not.toContain("jurisdiction=");
  });

  // Scoping the list to the map viewport is the bbox's only job – lose it and the table
  // stops agreeing with the pins the user is looking at.
  it("browsePollingPlaces passes the viewport bbox through when the list is map-scoped", async () => {
    await browsePollingPlaces({ bbox: "144.9,-37.9,145.1,-37.7" });
    const url = mockReq.mock.calls[0][0] as string;
    expect(new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("bbox")).toBe("144.9,-37.9,145.1,-37.7");
  });

  it("listPollingPlacePoints hits the points endpoint with filters", async () => {
    await listPollingPlacePoints({ jurisdiction: "nsw", state: "NSW", limit: 5000 });
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("/geo/polling-places/points?");
    expect(url).toContain("jurisdiction=nsw");
    expect(url).toContain("state=NSW");
    expect(url).toContain("limit=5000");
  });

  it("listPollingPlacePoints omits filters when unset / 'all'", async () => {
    await listPollingPlacePoints({ jurisdiction: "all" });
    expect(mockReq.mock.calls[0][0]).toBe("/geo/polling-places/points?");
  });

  it("getPollingPlace encodes the namespaced id", async () => {
    await getPollingPlace("federal:11877");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/polling-places/federal%3A11877");
  });
});

describe("geo api client — chamber wrappers", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: [] });
  });

  it("map to their endpoints", async () => {
    await listChambers();
    expect(mockReq).toHaveBeenLastCalledWith("/geo/chambers");
    await listChamberElectorates();
    expect(mockReq).toHaveBeenLastCalledWith("/geo/chamber-electorates");
    await getChamberElectorate("2-LC-SOUTH");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/chamber-electorates/2-LC-SOUTH");
  });
});

describe("geo api client — region polling (Insights)", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: { region: { geoKind: "sed_upper", geoCode: "x" }, polls: [] } });
  });

  it("getRegionPolling passes geoKind + encoded geoCode to /insights/region", async () => {
    await getRegionPolling("sed_upper", "2-LC-NORTHERN METROPOLITAN");
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("/insights/region?");
    expect(url).toContain("geoKind=sed_upper");
    // URLSearchParams encodes the space as "+" — the raw space must not survive.
    expect(url).not.toContain("2-LC-NORTHERN METROPOLITAN");
    expect(url).toContain("geoCode=2-LC-NORTHERN+METROPOLITAN");
  });
});

describe("geo api client — First Nations", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listFirstNations always sends the level and only the filters that are set", async () => {
    await listFirstNations("iloc", { q: "bogan", state: "1", limit: 10, offset: 20 });
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("/geo/first-nations?");
    expect(url).toContain("level=iloc");
    expect(url).toContain("q=bogan");
    expect(url).toContain("state=1");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=20");
  });

  it("listFirstNations omits empty filters entirely", async () => {
    await listFirstNations("ireg");
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("level=ireg");
    expect(url).not.toContain("q=");
    expect(url).not.toContain("state=");
    expect(url).not.toContain("limit=");
    expect(url).not.toContain("offset=");
  });

  it("getFirstNations hits the level-scoped detail route and encodes the code", async () => {
    await getFirstNations("iare", "101001");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/first-nations/iare/101001");
  });

  it("REFERENCE-ONLY: no First Nations fetcher targets a division or turf route", async () => {
    await listFirstNations("ireg");
    await getFirstNations("iloc", "10100101");
    for (const call of mockReq.mock.calls) {
      const url = call[0] as string;
      expect(url).not.toContain("/geo/divisions");
      expect(url).not.toContain("/canvass/turfs");
    }
  });
});

describe("geo api client — density", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("asks for one layer's national scale", async () => {
    await getDensityScale("lga");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/density/scale?kind=lga");
  });

  it("encodes the kind, so a layer name can never inject query params", async () => {
    await getDensityScale("sa1&foo=bar");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/density/scale?kind=sa1%26foo%3Dbar");
  });

  it("getReferendum hits the referendum endpoint", async () => {
    await getReferendum();
    expect(mockReq.mock.calls[0][0]).toBe("/geo/referendum");
  });

  it("getAreaAddressCount joins level:code pairs into the codes query", async () => {
    await getAreaAddressCount([
      { level: "sa2", code: "201011001" },
      { level: "sa3", code: "20101" },
    ]);
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toContain("/geo/area-address-count?codes=");
    expect(decodeURIComponent(url)).toContain("sa2:201011001,sa3:20101");
  });

  it("getAddressDetail requests the per-address detail endpoint with an encoded gnafPid", async () => {
    await getAddressDetail("GAVIC 42");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/addresses/GAVIC%2042");
  });
});

describe("geo api client — elections", () => {
  it("listElections GETs /geo/elections", async () => {
    const { listElections } = await import("./geo");
    (request as ReturnType<typeof vi.fn>).mockClear();
    await listElections();
    expect((request as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/geo/elections");
  });
});

/** The query half of a built path, parsed – lets a test assert on parameters
 *  rather than on substrings that a reordering would break. */
const paramsOf = (url: string) => new URLSearchParams(url.slice(url.indexOf("?") + 1));
/** The JSON a POST wrapper actually put on the wire. */
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("geo api client — divisions and states", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: [] });
  });

  /**
   * The layer is the whole meaning of the request. `sed` is the raw ABS layer, which in
   * Tasmania is House-of-Assembly × Legislative-Council intersection cells belonging to
   * neither chamber — asking for it when the page means `sed_lower` lists seats nobody
   * is elected to.
   */
  it("asks for exactly the layer it was handed", async () => {
    await listDivisions("sed_lower");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/divisions?type=sed_lower");
    await listDivisions("sed_upper");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/divisions?type=sed_upper");
    await listDivisions("ced");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/divisions?type=ced");
  });

  /**
   * Ward and LGA codes are human strings – they carry spaces and slashes. An unencoded
   * "/" would split into a second path segment and address a different route entirely,
   * so the detail page would 404 on precisely the councils with compound ward names.
   */
  it("keeps a division code inside its own path segment", async () => {
    await getDivision("ward", "Ku-ring-gai/Roseville Ward");
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toBe("/geo/divisions/ward/Ku-ring-gai%2FRoseville%20Ward");
    // Nothing after the type segment may look like another route step.
    expect(url.slice("/geo/divisions/ward/".length)).not.toContain("/");
  });

  it("reads the derived state layer, encoding the code the same way", async () => {
    await listStates();
    expect(mockReq).toHaveBeenLastCalledWith("/geo/states");
    await getState("8");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/states/8");
  });
});

describe("geo api client — region hierarchy", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  // The breadcrumb panel is addressed by (kind, code) together: the same code string
  // exists at more than one level, so dropping the kind resolves the wrong region.
  it("sends the kind alongside the code, escaped", async () => {
    await getRegionHierarchy("lga", "Sunshine Coast (R)");
    const url = mockReq.mock.calls[0][0] as string;
    expect(url.startsWith("/geo/hierarchy?")).toBe(true);
    const qs = paramsOf(url);
    expect(qs.get("kind")).toBe("lga");
    expect(qs.get("code")).toBe("Sunshine Coast (R)");
    // The raw space must not survive into the URL itself.
    expect(url).not.toContain("Sunshine Coast");
  });
});

describe("geo api client — cancellable reads", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: [] });
  });

  /**
   * Both of these back long-lived panels that re-fetch on filter changes. The signal has
   * to reach the transport or an abandoned request still resolves after the component has
   * moved on, and the late answer overwrites the current one.
   */
  it("forwards the caller's abort signal to the transport", async () => {
    const ac = new AbortController();
    await getGeoStatus({ signal: ac.signal });
    expect(mockReq).toHaveBeenLastCalledWith("/geo/status", { signal: ac.signal });
    await getReferendum({ signal: ac.signal });
    expect(mockReq).toHaveBeenLastCalledWith("/geo/referendum", { signal: ac.signal });
  });

  it("sends no init when there is nothing to cancel", async () => {
    await getGeoStatus();
    expect(mockReq).toHaveBeenLastCalledWith("/geo/status", undefined);
    await getReferendum({});
    expect(mockReq).toHaveBeenLastCalledWith("/geo/referendum", undefined);
  });
});

describe("geo api client — universe addresses", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: [] });
  });

  it("carries whichever scope the caller has, turf or division", async () => {
    await listUniverseAddresses({ divisionType: "ced", divisionCode: "CED301", limit: 500 });
    const qs = paramsOf(mockReq.mock.calls[0][0] as string);
    expect(qs.get("divisionType")).toBe("ced");
    expect(qs.get("divisionCode")).toBe("CED301");
    expect(qs.get("limit")).toBe("500");
    expect(qs.has("turfId")).toBe(false);

    await listUniverseAddresses({ turfId: "turf-1" });
    expect(paramsOf(mockReq.mock.calls[1][0] as string).get("turfId")).toBe("turf-1");
  });

  /**
   * `withoutContacts` is a presence flag, not a value. Sending it as the string "false"
   * would read as truthy to any ordinary query-string boolean coercion, so an organiser
   * asking for the whole universe would silently get only the doors with no contact —
   * an under-count they have no way to see.
   */
  it("omits withoutContacts unless it is actually on", async () => {
    await listUniverseAddresses({ turfId: "t", withoutContacts: false });
    expect(mockReq.mock.calls[0][0]).not.toContain("withoutContacts");
    await listUniverseAddresses({ turfId: "t", withoutContacts: true });
    expect(paramsOf(mockReq.mock.calls[1][0] as string).get("withoutContacts")).toBe("true");
  });
});

describe("geo api client — area layers", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  /**
   * The bbox is positional: west,south,east,north. Reordering it doesn't error, it just
   * describes an inverted rectangle, and the map layer comes back empty with no clue why.
   */
  it("listAreas sends the viewport corners in west,south,east,north order", async () => {
    await listAreas({ layer: "sa1", bbox: [144.9, -37.9, 145.1, -37.7], limit: 2000 });
    const qs = paramsOf(mockReq.mock.calls[0][0] as string);
    expect(qs.get("layer")).toBe("sa1");
    expect(qs.get("bbox")).toBe("144.9,-37.9,145.1,-37.7");
    expect(qs.get("limit")).toBe("2000");
  });

  it("listAreas leaves the limit to the server when the caller has no cap", async () => {
    await listAreas({ layer: "mb", bbox: [1, 2, 3, 4] });
    expect(mockReq.mock.calls[0][0]).not.toContain("limit");
  });

  /**
   * The search box is free text an organiser types – ampersands and equals signs land in
   * it constantly ("Brunswick & Coburg"). Escaping is what stops the tail of a place name
   * being parsed as an extra query parameter.
   */
  it("searchAreas escapes the typed query instead of letting it add parameters", async () => {
    await searchAreas("sa2", "Brunswick & Coburg&limit=1", 15, "2");
    const url = mockReq.mock.calls[0][0] as string;
    const qs = paramsOf(url);
    expect(qs.get("q")).toBe("Brunswick & Coburg&limit=1");
    expect(qs.get("layer")).toBe("sa2");
    expect(qs.get("limit")).toBe("15");
    expect(qs.get("state")).toBe("2");
    // One "limit", not two – the injected one must not have become a parameter.
    expect(qs.getAll("limit")).toHaveLength(1);
  });

  it("searchAreas sends a bare national search when unfiltered", async () => {
    await searchAreas("sa3", "geelong");
    expect(mockReq.mock.calls[0][0]).toBe("/geo/areas/search?layer=sa3&q=geelong");
  });

  it("browseAreas pages with limit and offset", async () => {
    await browseAreas({ layer: "sa2", q: "north", state: "1", limit: 50, offset: 100 });
    const qs = paramsOf(mockReq.mock.calls[0][0] as string);
    expect(qs.get("layer")).toBe("sa2");
    expect(qs.get("q")).toBe("north");
    expect(qs.get("state")).toBe("1");
    expect(qs.get("limit")).toBe("50");
    expect(qs.get("offset")).toBe("100");
  });

  /**
   * The panel resets to page 0 and passes `q: cleared || undefined` whenever the level or
   * state filter changes. A blank `q=` or `state=` reaching the API would keep narrowing a
   * search the organiser has already cleared, so an emptied box must drop the parameter.
   */
  it("browseAreas drops cleared filters and the first page's zero offset", async () => {
    await browseAreas({ layer: "sa4", q: "", state: "", limit: 25, offset: 0 });
    const url = mockReq.mock.calls[0][0] as string;
    expect(url).toBe("/geo/areas/browse?layer=sa4&limit=25");
  });

  it("addresses one area, with detail on its own route", async () => {
    await getArea("sa1", "20604112801");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/areas/sa1/20604112801");
    await getAreaDetail("sa2", "206041128");
    expect(mockReq).toHaveBeenLastCalledWith("/geo/areas/sa2/206041128/detail");
  });
});

describe("geo api client — cutting turf", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: { id: "turf-1" } });
  });

  const polygon: GeoJSON.Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [144.9, -37.8],
        [145.0, -37.8],
        [145.0, -37.7],
        [144.9, -37.8],
      ],
    ],
  };

  it("POSTs an area selection, drawn polygons included, to the from-areas route", async () => {
    await createTurfFromAreas({
      name: "Brunswick east",
      campaignId: "camp-1",
      areas: [{ layer: "sa1", code: "20604112801" }],
      polygons: [polygon],
    });
    const [url, init] = mockReq.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/canvass/turfs/from-areas");
    expect(init.method).toBe("POST");
    expect(bodyOf(mockReq.mock.calls[0])).toEqual({
      name: "Brunswick east",
      campaignId: "camp-1",
      areas: [{ layer: "sa1", code: "20604112801" }],
      polygons: [polygon],
    });
  });

  /**
   * The stacked basket is the whole point of from-sources: divisions, areas, drawn shapes
   * and hand-picked doors union server-side into one turf. Any kind dropped from the body
   * cuts a smaller turf than the organiser assembled, silently and with no error to show.
   */
  it("createTurfFromSources carries every source kind in the one request", async () => {
    await createTurfFromSources({
      name: "My turf",
      divisions: [
        { type: "ste", code: "2" },
        { type: "chamber_electorate", code: "2-LC" },
      ],
      areas: [{ layer: "sa2", code: "206041128" }],
      polygons: [polygon],
      gnafPids: ["GAVIC411711441"],
    });
    const [url] = mockReq.mock.calls[0] as [string];
    expect(url).toBe("/canvass/turfs/from-sources");
    const body = bodyOf(mockReq.mock.calls[0]);
    expect(body.divisions).toEqual([
      { type: "ste", code: "2" },
      { type: "chamber_electorate", code: "2-LC" },
    ]);
    expect(body.areas).toEqual([{ layer: "sa2", code: "206041128" }]);
    expect(body.polygons).toEqual([polygon]);
    expect(body.gnafPids).toEqual(["GAVIC411711441"]);
  });

  /**
   * `universe` decides whether the cut turf is populated with the org's existing addresses
   * or left empty for a cold canvass. Losing it in serialisation would hand the volunteers
   * a turf with no doors on it.
   */
  it("preserves the universe choice, including 'none'", async () => {
    await createTurfFromSources({ name: "Cold", universe: "none", gnafPids: [] });
    expect(bodyOf(mockReq.mock.calls[0]).universe).toBe("none");
    await createTurfFromAreas({ name: "Warm", universe: "hybrid", areas: [] });
    expect(bodyOf(mockReq.mock.calls[1]).universe).toBe("hybrid");
  });

  it("leaves an unset campaign out of the body rather than nulling it", async () => {
    await createTurfFromDivision({ type: "ced", code: "CED301", name: "Wills" });
    const [url, init] = mockReq.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/canvass/turfs/from-division");
    expect(init.method).toBe("POST");
    const body = bodyOf(mockReq.mock.calls[0]);
    expect(body).toEqual({ type: "ced", code: "CED301", name: "Wills" });
    expect("campaignId" in body).toBe(false);
  });

  // Ingest is a side effect: a GET would be treated as a read and queue nothing.
  it("triggerGeoIngest POSTs", async () => {
    mockReq.mockResolvedValue({ ok: true, data: { queued: true, note: "" } });
    await triggerGeoIngest();
    expect(mockReq).toHaveBeenLastCalledWith("/geo/ingest", { method: "POST" });
  });
});

describe("geo api client — nearby addresses", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: [] });
  });

  /**
   * lat and lng are separately named for a reason: swapped, a Melbourne search still
   * returns the "nearest" doors – from the far side of the planet – and the map silently
   * shows an empty result set instead of the street the organiser searched for.
   */
  it("sends the coordinates under their own names, negatives intact", async () => {
    await nearbyAddresses(-37.8136, 144.9631);
    const qs = paramsOf(mockReq.mock.calls[0][0] as string);
    expect(qs.get("lat")).toBe("-37.8136");
    expect(qs.get("lng")).toBe("144.9631");
  });

  // The panel asks for 30; the bare default backs every other caller.
  it("defaults the limit to 25 and honours an explicit one", async () => {
    await nearbyAddresses(0, 0);
    expect(paramsOf(mockReq.mock.calls[0][0] as string).get("limit")).toBe("25");
    await nearbyAddresses(-37.8, 144.9, 30);
    expect(paramsOf(mockReq.mock.calls[1][0] as string).get("limit")).toBe("30");
  });

  // A zero coordinate is a real point (the Gulf of Guinea), not "unset" – it must survive.
  it("keeps a zero coordinate rather than dropping it", async () => {
    await nearbyAddresses(0, 0);
    const qs = paramsOf(mockReq.mock.calls[0][0] as string);
    expect(qs.get("lat")).toBe("0");
    expect(qs.get("lng")).toBe("0");
  });
});
