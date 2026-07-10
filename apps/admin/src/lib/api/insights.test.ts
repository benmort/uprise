import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path + init each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  listPolls,
  getPoll,
  getPollQuestion,
  getPollChoropleth,
  getPublicPoll,
  getPublicPollQuestion,
  getPublicPollChoropleth,
  resolvePollThreshold,
  setPollPublic,
  provenanceLine,
  fieldworkWindow,
} from "./insights";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("insights api client — wrappers", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listPolls / getPoll hit the poll endpoints (id encoded)", async () => {
    await listPolls();
    expect(mockReq).toHaveBeenLastCalledWith("/insights/polls");
    await getPoll("p 1");
    expect(mockReq.mock.calls[1][0]).toBe("/insights/polls/p%201");
  });

  it("getPollQuestion + getPollChoropleth encode id, code and the response query", async () => {
    await getPollQuestion("p1", "C3_1");
    expect(mockReq.mock.calls[0][0]).toBe("/insights/polls/p1/questions/C3_1");
    await getPollChoropleth("p1", "C5", "NET Support");
    const url = mockReq.mock.calls[1][0] as string;
    expect(url).toContain("/insights/polls/p1/questions/C5/choropleth?");
    expect(url).toContain("response=NET+Support");
  });

  it("public wrappers hit the isPublic-only /insights/public/* endpoints (id/code encoded)", async () => {
    await getPublicPoll("p 1");
    expect(mockReq.mock.calls[0][0]).toBe("/insights/public/polls/p%201");
    await getPublicPollQuestion("p1", "C3 1");
    expect(mockReq.mock.calls[1][0]).toBe("/insights/public/polls/p1/questions/C3%201");
    await getPublicPollChoropleth("p1", "C5", "NET Support");
    const url = mockReq.mock.calls[2][0] as string;
    expect(url).toContain("/insights/public/polls/p1/questions/C5/choropleth?");
    expect(url).toContain("response=NET+Support");
  });

  it("setPollPublic PATCHes the visibility flag for the encoded poll id", async () => {
    await setPollPublic("p 1", true);
    const [path, init] = mockReq.mock.calls[0];
    expect(path).toBe("/insights/polls/p%201/public");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ public: true });
  });

  it("resolvePollThreshold POSTs the threshold body as JSON", async () => {
    await resolvePollThreshold({
      pollId: "p1",
      questionCode: "C5",
      response: "NET Support",
      op: ">=",
      value: 50,
      geoKind: "sed_upper",
    });
    const [path, init] = mockReq.mock.calls[0];
    expect(path).toBe("/insights/resolve-threshold");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ op: ">=", value: 50 });
  });
});

describe("insights — provenance formatting", () => {
  // The month abbreviation ("Jun" vs "June") is ICU/locale-dependent across runners,
  // so assert structure, not the exact short-month spelling.
  it("fieldworkWindow shows the year only on the end date, and copes with one-sided ranges", () => {
    expect(fieldworkWindow("2026-06-16", "2026-07-09")).toMatch(/^16 Jun.* – 9 Jul.* 2026$/);
    expect(fieldworkWindow(null, null)).toBeNull();
    expect(fieldworkWindow("2026-07-09", null)).toContain("2026");
  });

  it("provenanceLine joins source, commissioner, window, n and weighting", () => {
    expect(
      provenanceLine({
        source: "YouGov",
        commissioner: "Common Threads",
        fieldworkStart: "2026-06-16",
        fieldworkEnd: "2026-07-09",
        sampleSize: 4003,
        weighted: true,
      }),
    ).toMatch(/^YouGov · commissioned by Common Threads · 16 Jun.* – 9 Jul.* 2026 · n=4,003 · weighted$/);
    expect(
      provenanceLine({
        source: "YouGov",
        commissioner: null,
        fieldworkStart: null,
        fieldworkEnd: null,
        sampleSize: null,
        weighted: false,
      }),
    ).toBe("YouGov · unweighted");
  });
});
