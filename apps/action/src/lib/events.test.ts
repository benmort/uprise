import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getManageRsvp,
  getPublicEvent,
  listPublicEvents,
  whenRange,
  type PublicEvent,
} from "./events";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (body: unknown) => ({ ok: true, json: async () => body });

describe("public event fetchers", () => {
  it("getPublicEvent GETs the encoded id, no-store, and unwraps a {data} envelope", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: { id: "e1", title: "Rally" } }));
    const event = await getPublicEvent("e 1");
    expect(event).toMatchObject({ id: "e1", title: "Rally" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/public-events/e%201");
    expect(init).toMatchObject({ cache: "no-store" });
  });

  it("returns bare-body payloads unwrapped-as-is", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ id: "e2", title: "Town hall" }));
    const event = await getPublicEvent("e2");
    expect(event).toMatchObject({ id: "e2" });
  });

  it("listPublicEvents queries by tenant slug", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: { tenant: null, events: [] } }));
    const board = await listPublicEvents("uprise labs");
    expect(board).toEqual({ tenant: null, events: [] });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/public-events?tenant=uprise%20labs");
  });

  it("getManageRsvp hits the token path", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: { rsvp: { id: "r1" } } }));
    await getManageRsvp("tok/1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/public-events/rsvp/tok%2F1");
  });

  it("returns null on a non-200 (private/missing event) and on network failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await getPublicEvent("gone")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await getPublicEvent("gone")).toBeNull();
  });

  it("returns null when the envelope carries a null payload", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: null }));
    expect(await getPublicEvent("e1")).toBeNull();
  });
});

describe("whenRange", () => {
  it("renders a same-day range as one date with a time span", () => {
    const label = whenRange("2026-08-08T00:00:00.000Z", "2026-08-08T01:00:00.000Z");
    expect(label).toMatch(/^\w{3},? \d/); // "Sat 8 Aug, …"
    expect(label).toContain("–");
    // one date only — the closing side is a bare time
    expect(label.split("–")[1]).not.toMatch(/\d+ \w{3}/);
  });

  it("renders a cross-day range with both dates", () => {
    const label = whenRange("2026-08-08T00:00:00.000Z", "2026-08-10T01:00:00.000Z");
    const closing = label.split("–")[1];
    expect(closing).toMatch(/\d+ \w{3}/); // "…– 10 Aug, 11:00 am"
  });
});

// Type-only sanity: the exported PublicEvent shape stays wide enough for the pages.
const _shape: PublicEvent = {
  id: "e",
  title: "t",
  description: null,
  category: null,
  location: null,
  lat: null,
  lng: null,
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-01T01:00:00.000Z",
  capacity: null,
  imageUrl: null,
  attendeeCount: 0,
  spotsLeft: null,
  derivedStatus: "upcoming",
  tenant: null,
};
void _shape;
