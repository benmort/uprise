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
});
