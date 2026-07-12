import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  getPublicPoll,
  getPublicPollQuestion,
  provenanceLine,
  fieldworkWindow,
  type PublicPoll,
} from "./insights";

// The module reads NEXT_PUBLIC_API_URL at import time; unset here so the
// tests assert against the documented default base.
const BASE = "http://localhost:3001/api/v1";

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetchOnce(res: Partial<Response> & { json?: () => Promise<unknown> }) {
  (global.fetch as FetchMock).mockResolvedValueOnce(res as Response);
}

describe("insights — server-side public fetch", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getPublicPoll hits the public poll endpoint with an encoded id and cache: no-store", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ data: { id: "p 1", title: "T" } }) });
    const poll = await getPublicPoll("p 1");
    const [url, init] = (global.fetch as FetchMock).mock.calls[0];
    expect(url).toBe(`${BASE}/insights/public/polls/p%201`);
    expect(init).toMatchObject({ cache: "no-store" });
    // envelope { data } is unwrapped
    expect(poll).toEqual({ id: "p 1", title: "T" });
  });

  it("getPublicPollQuestion encodes both the poll id and question code", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ poll: { id: "p1" } }) });
    await getPublicPollQuestion("p1", "C3 1");
    const [url] = (global.fetch as FetchMock).mock.calls[0];
    expect(url).toBe(`${BASE}/insights/public/polls/p1/questions/C3%201`);
  });

  it("accepts a bare (un-enveloped) body as well as { data }", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ id: "bare", title: "No envelope" }) });
    const poll = await getPublicPoll("bare");
    expect(poll).toEqual({ id: "bare", title: "No envelope" });
  });

  it("returns null on a non-200 (private/missing poll 404s)", async () => {
    mockFetchOnce({ ok: false, status: 404, json: async () => ({}) });
    expect(await getPublicPoll("missing")).toBeNull();
  });

  it("returns null when fetch throws (network error swallowed)", async () => {
    (global.fetch as FetchMock).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await getPublicPoll("boom")).toBeNull();
  });

  it("returns null when the envelope's data is nullish", async () => {
    mockFetchOnce({ ok: true, json: async () => ({ data: null }) });
    expect(await getPublicPoll("empty")).toBeNull();
  });
});

describe("insights — provenance formatting", () => {
  const base: PublicPoll = {
    id: "p1",
    title: "Common Threads",
    source: "YouGov",
    commissioner: "Common Threads",
    fieldworkStart: "2026-06-16",
    fieldworkEnd: "2026-07-09",
    sampleSize: 4003,
    weighted: true,
    geoScope: null,
    licence: null,
    attribution: null,
    tenant: { name: "Common Threads", slug: "common-threads" },
    keyFindings: [],
    questions: [],
  };

  // The short-month spelling is ICU/locale-dependent across runners, so assert
  // structure, not the exact abbreviation.
  it("fieldworkWindow shows the year only on the end date and copes with one-sided ranges", () => {
    expect(fieldworkWindow("2026-06-16", "2026-07-09")).toMatch(/^16 Jun.* – 9 Jul.* 2026$/);
    expect(fieldworkWindow(null, null)).toBeNull();
    expect(fieldworkWindow("2026-07-09", null)).toContain("2026");
    expect(fieldworkWindow(null, "2026-07-09")).toContain("2026");
  });

  it("provenanceLine joins source, commissioner, window, n and weighting", () => {
    expect(provenanceLine(base)).toMatch(
      /^YouGov · commissioned by Common Threads · 16 Jun.* – 9 Jul.* 2026 · n=4,003 · weighted$/,
    );
  });

  it("provenanceLine omits absent parts and marks unweighted polls", () => {
    expect(
      provenanceLine({
        ...base,
        commissioner: null,
        fieldworkStart: null,
        fieldworkEnd: null,
        sampleSize: null,
        weighted: false,
      }),
    ).toBe("YouGov · unweighted");
  });
});
