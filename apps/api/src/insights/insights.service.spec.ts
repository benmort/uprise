import { InsightsService } from "./insights.service";
import { ApiHttpException } from "../common/http/api-response";

// Two-response, three-column question fixture (Total, one region, one non-geo col).
const EST = (over: Partial<Record<string, unknown>>) => ({
  responseLabel: "NET Support",
  responseOrdinal: 0,
  isNet: true,
  breakdownGroup: "Total",
  breakdownValue: "Total",
  breakdownOrdinal: 1,
  geoKind: null,
  geoCode: null,
  percent: 40,
  baseN: 4003,
  reportable: true,
  ...over,
});

function svcWith(prisma: Record<string, unknown>) {
  return new InsightsService(prisma as never);
}

describe("InsightsService", () => {
  it("listPolls maps rows and flags shared (global) polls", async () => {
    const prisma = {
      poll: {
        findMany: jest.fn(async () => [
          { id: "p1", slug: "s", title: "T", source: "YouGov", commissioner: "CT", sampleSize: 4003, fieldworkStart: null, fieldworkEnd: null, weighted: true, geoScope: "VIC", status: "PUBLISHED", attribution: "a", tenantId: "t1", isPublic: false, lastIngestedAt: null, _count: { questions: 5 } },
          { id: "p2", slug: "g", title: "G", source: "YouGov", commissioner: null, sampleSize: null, fieldworkStart: null, fieldworkEnd: null, weighted: true, geoScope: null, status: "PUBLISHED", attribution: null, tenantId: null, isPublic: false, lastIngestedAt: null, _count: { questions: 2 } },
        ]),
      },
    };
    const res = await svcWith(prisma).listPolls("t1");
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ id: "p1", questionCount: 5, shared: false }); // own, private
    expect(res[1].shared).toBe(true); // null-tenant global tier
    // Visibility gate: own OR global-tier OR public.
    expect((prisma.poll.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      OR: [{ tenantId: "t1" }, { tenantId: null }, { isPublic: true }],
    });
  });

  describe("setPollPublic", () => {
    const OWNER = { id: "u1", role: "OWNER", tenantId: "t1", roles: [], isSuperAdmin: false } as never;
    const ORGANISER = { id: "u2", role: "ORGANISER", tenantId: "t1", roles: [], isSuperAdmin: false } as never;
    const SUPER = { id: "u3", role: "OWNER", tenantId: "tx", roles: [], isSuperAdmin: true } as never;
    const prismaWith = (poll: unknown) => {
      const update = jest.fn(async () => ({}));
      return { poll: { findUnique: jest.fn(async () => poll), update }, update };
    };

    it("making a poll public also PUBLISHES it (badge tracks visibility) and stamps publishedAt", async () => {
      const p = prismaWith({ id: "p1", tenantId: "t1", isPublic: false, status: "DRAFT", publishedAt: null });
      const res = await svcWith(p).setPollPublic(OWNER, "p1", true);
      expect(res).toMatchObject({ id: "p1", isPublic: true, status: "PUBLISHED", shared: true });
      expect(p.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { isPublic: true, status: "PUBLISHED", publishedAt: expect.any(Date) },
      });
    });

    it("making it private again returns it to DRAFT (organiser is kept in the gate)", async () => {
      const p = prismaWith({ id: "p1", tenantId: "t1", isPublic: true, status: "PUBLISHED", publishedAt: new Date(1) });
      const res = await svcWith(p).setPollPublic(ORGANISER, "p1", false);
      expect(res).toMatchObject({ id: "p1", isPublic: false, status: "DRAFT", shared: false });
      expect(p.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { isPublic: false, status: "DRAFT" } });
    });

    it("a super-admin can toggle any poll, including the null-tenant global tier", async () => {
      const p = prismaWith({ id: "g1", tenantId: null, isPublic: false, status: "DRAFT", publishedAt: null });
      const res = await svcWith(p).setPollPublic(SUPER, "g1", true);
      expect(res.isPublic).toBe(true);
      expect(p.update).toHaveBeenCalled();
    });

    it("refuses a non-super-admin changing another tenant's poll", async () => {
      const p = prismaWith({ id: "p1", tenantId: "t2", isPublic: false, status: "DRAFT", publishedAt: null });
      await expect(svcWith(p).setPollPublic(OWNER, "p1", true)).rejects.toBeInstanceOf(ApiHttpException);
      expect(p.update).not.toHaveBeenCalled();
    });

    it("throws when the poll does not exist", async () => {
      const p = prismaWith(null);
      await expect(svcWith(p).setPollPublic(OWNER, "nope", true)).rejects.toBeInstanceOf(ApiHttpException);
    });

    it("is idempotent — no write when already public + published", async () => {
      const p = prismaWith({ id: "p1", tenantId: "t1", isPublic: true, status: "PUBLISHED", publishedAt: new Date(1) });
      await svcWith(p).setPollPublic(OWNER, "p1", true);
      expect(p.update).not.toHaveBeenCalled();
    });
  });

  it("getPoll throws when not visible", async () => {
    const prisma = { poll: { findFirst: jest.fn(async () => null) } };
    await expect(svcWith(prisma).getPoll("t1", "x")).rejects.toBeInstanceOf(ApiHttpException);
  });

  describe("public reads (unauthenticated) only ever serve isPublic polls", () => {
    it("getPublicPoll filters by isPublic and never marks a poll owned", async () => {
      const poll = {
        id: "p1", slug: "vic-treaty-2026", title: "T", source: "YouGov", commissioner: null,
        fieldworkStart: null, fieldworkEnd: null, sampleSize: 4003, methodology: null, geoScope: "VIC",
        weighted: true, licence: null, attribution: "a", keyFindings: null, status: "PUBLISHED",
        tenantId: "t1", isPublic: true, questions: [],
      };
      const findFirst = jest.fn(async () => poll);
      const res = await svcWith({ poll: { findFirst } }).getPublicPoll("p1");
      expect((findFirst as jest.Mock).mock.calls[0][0].where).toEqual({ id: "p1", isPublic: true });
      expect(res).toMatchObject({ id: "p1", isPublic: true, shared: true, owned: false });
    });

    it("getPublicPoll 404s a private poll — nothing leaks", async () => {
      await expect(
        svcWith({ poll: { findFirst: jest.fn(async () => null) } }).getPublicPoll("private"),
      ).rejects.toBeInstanceOf(ApiHttpException);
    });

    it("getPublicPoll joins the owning tenant's brand (logo, colours, custom CSS)", async () => {
      const poll = {
        id: "p1", slug: "s", title: "T", source: "YouGov", commissioner: null, fieldworkStart: null,
        fieldworkEnd: null, sampleSize: 1, methodology: null, geoScope: "VIC", weighted: true,
        licence: null, attribution: "a", keyFindings: null, status: "PUBLISHED", isPublic: true,
        questions: [], tenantId: "t1",
        tenant: { id: "t1", name: "Common Threads", slug: "common-threads" },
      };
      const orgProfile = { findFirst: jest.fn(async () => ({
        logoLandscapeUrl: "https://b/land.png", logoBlockUrl: "https://b/block.png",
        primaryColour: "#123456", secondaryColour: null, customCss: ".x{}",
      })) };
      const res = await svcWith({ poll: { findFirst: jest.fn(async () => poll) }, orgProfile }).getPublicPoll("p1");
      expect(res.tenant).toEqual({
        name: "Common Threads",
        slug: "common-threads",
        logoLandscapeUrl: "https://b/land.png",
        logoBlockUrl: "https://b/block.png",
        primaryColour: "#123456",
        secondaryColour: null,
        customCss: ".x{}",
      });
      expect(orgProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1" } }));
    });

    it("getPublicPollQuestion requires the poll to be public", async () => {
      const findFirst = jest.fn(async () => null);
      await expect(
        svcWith({ pollQuestion: { findFirst } }).getPublicPollQuestion("p1", "C5"),
      ).rejects.toBeInstanceOf(ApiHttpException);
      expect((findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
        pollId: "p1",
        code: "C5",
        poll: { isPublic: true },
      });
    });
  });

  describe("getPoll", () => {
    const Q = (over: Partial<Record<string, unknown>> = {}) => ({
      code: "C5",
      title: "C5. Do you support a Treaty? by BANNER COMMON THREADS",
      category: "treaty",
      hasNet: true,
      responseKind: "support_oppose",
      estimates: [
        { responseLabel: "Strongly support", percent: 21.51, isNet: false, baseN: 4003, reportable: true },
        { responseLabel: "NET Support", percent: 39.84, isNet: true, baseN: 4003, reportable: true },
      ],
      ...over,
    });
    const pollWith = (questions: unknown[], slug = "vic-treaty-2026") => ({
      id: "p1", slug, title: "T", source: "YouGov", commissioner: null, fieldworkStart: null,
      fieldworkEnd: null, sampleSize: 4003, methodology: null, geoScope: "VIC", weighted: true,
      licence: null, attribution: null, keyFindings: null, status: "PUBLISHED", tenantId: null,
      questions,
    });

    it("asks only for the whole-sample column", async () => {
      const findFirst = jest.fn(async () => pollWith([Q()]));
      await svcWith({ poll: { findFirst } }).getPoll("t1", "p1");

      const include = (findFirst.mock.calls[0] as never as [{ include: { questions: { include: { estimates: { where: unknown } } } } }])[0];
      expect(include.include.questions.include.estimates.where).toEqual({
        breakdownGroup: "Total",
        breakdownValue: "Total",
      });
    });

    it("attaches the topline, baseN and theme to each question", async () => {
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith([Q()])) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      expect(res.questions).toHaveLength(1);
      expect(res.questions[0]).toMatchObject({
        code: "C5",
        title: "Do you support a Treaty?", // banner suffix + code prefix stripped
        theme: "treaty_support",
        rank: null,
        baseN: 4003,
      });
      expect(res.questions[0].topline).toEqual([
        { label: "Strongly support", percent: 21.51, isNet: false },
        { label: "NET Support", percent: 39.84, isNet: true },
      ]);
    });

    it("nulls the percentage of an unreportable cell rather than drawing it as zero", async () => {
      const q = Q({
        estimates: [{ responseLabel: "Strongly support", percent: 21.51, isNet: false, baseN: 12, reportable: false }],
      });
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith([q])) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      expect(res.questions[0].topline[0].percent).toBeNull();
    });

    it("collapses a variant block onto its base question", async () => {
      const questions = [
        Q({ code: "C1", title: "C1. Most important issue? RANKED FIRST by BANNER COMMON THREADS", estimates: [] }),
        Q({ code: "C1-2", title: "C1. Most important issue? RANKED TOP 3 by BANNER COMMON THREADS", estimates: [] }),
      ];
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith(questions)) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      expect(res.questions).toHaveLength(1);
      expect(res.questions[0].variants).toEqual([
        { code: "C1", rank: "Ranked first" },
        { code: "C1-2", rank: "Ranked top 3" },
      ]);
    });

    it("carries a question with no estimates through with an empty topline", async () => {
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith([Q({ estimates: [] })])) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      expect(res.questions[0]).toMatchObject({ baseN: null, topline: [] });
    });

    it("leaves theme null for a poll whose code scheme is unknown", async () => {
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith([Q()], "some-other-poll")) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      expect(res.questions[0].theme).toBeNull();
      expect(res.questions[0].category).toBe("treaty"); // the fallback the UI groups on
      expect(res.themes).toEqual([]); // …and no catalogue to render
    });

    it("ships the catalogue for exactly the themes present, in reading order", async () => {
      const questions = [
        Q({ code: "B1", title: "B1. First preference? by BANNER X", category: "polling_background", estimates: [] }),
        Q({ code: "C5", estimates: [] }),
      ];
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith(questions)) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      // Declared order, not question order: treaty_support outranks party_voting.
      expect(res.themes.map((t) => t.key)).toEqual(["treaty_support", "party_voting"]);
      expect(res.themes[0]).toMatchObject({ label: "Support & opposition", category: "treaty" });
    });

    it("never emits a theme key the catalogue cannot label", async () => {
      const questions = [Q({ code: "C5", estimates: [] }), Q({ code: "D6", estimates: [] }), Q({ code: "E4", estimates: [] })];
      const prisma = { poll: { findFirst: jest.fn(async () => pollWith(questions)) } };
      const res = await svcWith(prisma).getPoll("t1", "p1");

      const labelled = new Set(res.themes.map((t) => t.key));
      for (const q of res.questions) if (q.theme) expect(labelled.has(q.theme)).toBe(true);
    });
  });

  it("getPollQuestion pivots estimates into ordered groups + response rows", async () => {
    const estimates = [
      EST({ responseOrdinal: 0, responseLabel: "NET Support", breakdownOrdinal: 1, breakdownGroup: "Total", breakdownValue: "Total", percent: 40 }),
      EST({ responseOrdinal: 0, responseLabel: "NET Support", breakdownOrdinal: 40, breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", percent: 60 }),
      EST({ responseOrdinal: 1, responseLabel: "NET Oppose", breakdownOrdinal: 1, breakdownGroup: "Total", breakdownValue: "Total", isNet: true, percent: 32 }),
      EST({ responseOrdinal: 1, responseLabel: "NET Oppose", breakdownOrdinal: 40, breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", isNet: true, percent: 20 }),
    ];
    const prisma = {
      pollQuestion: {
        findFirst: jest.fn(async () => ({ code: "C5", title: "Treaty", category: "treaty", hasNet: true, poll: { id: "p1", title: "T", attribution: "a" }, estimates })),
      },
    };
    const res = await svcWith(prisma).getPollQuestion("t1", "p1", "C5");
    expect(res.groups.map((g) => g.group)).toEqual(["Total", "VIC Upper House Electorate"]);
    expect(res.groups[1].columns[0]).toMatchObject({ value: "Northern Metropolitan", geoKind: "sed_upper", ordinal: 40 });
    expect(res.responses).toHaveLength(2);
    expect(res.responses[0].cells[40]).toBe(60); // NET Support in Northern Metro
  });

  it("getChoropleth returns only geographic cells for a response", async () => {
    const prisma = {
      pollQuestion: { findFirst: jest.fn(async () => ({ id: "q1", code: "C5", title: "Treaty" })) },
      pollEstimate: {
        findMany: jest.fn(async () => [
          EST({ breakdownGroup: "VIC Upper House Electorate", breakdownValue: "Northern Metropolitan", geoKind: "sed_upper", geoCode: "2-LC-NM", percent: 60 }),
        ]),
      },
    };
    const res = await svcWith(prisma).getChoropleth("t1", "p1", "C5", "NET Support");
    expect(res.cells).toHaveLength(1);
    expect(res.cells[0]).toMatchObject({ geoCode: "2-LC-NM", percent: 60 });
    expect((prisma.pollEstimate.findMany as jest.Mock).mock.calls[0][0].where.geoKind).toEqual({ not: null });
  });

  it("getRegionPolling pairs region cells with the statewide Total", async () => {
    const prisma = {
      pollEstimate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { questionId: "q1", responseLabel: "NET Support", responseOrdinal: 0, isNet: true, percent: 60, poll: { id: "p1", title: "T", attribution: "a" }, question: { id: "q1", code: "C5", title: "Treaty", ordinal: 3 } },
          ])
          .mockResolvedValueOnce([{ questionId: "q1", responseLabel: "NET Support", percent: 40 }]),
      },
    };
    const res = await svcWith(prisma).getRegionPolling("t1", "sed_upper", "2-LC-NM");
    expect(res.polls[0].questions[0].rows[0]).toMatchObject({ responseLabel: "NET Support", regionPercent: 60, totalPercent: 40 });
  });

  it("getRegionPolling returns empty for a region with no estimates", async () => {
    const prisma = { pollEstimate: { findMany: jest.fn(async () => []) } };
    const res = await svcWith(prisma).getRegionPolling("t1", "sed_lower", "nope");
    expect(res.polls).toEqual([]);
  });

  it("resolvePollThresholdToGeoCodes filters by the comparison op", async () => {
    const prisma = {
      pollQuestion: { findFirst: jest.fn(async () => ({ id: "q1" })) },
      pollEstimate: {
        findMany: jest.fn(async () => [
          { geoCode: "A", percent: 60 },
          { geoCode: "B", percent: 30 },
          { geoCode: "C", percent: 50 },
        ]),
      },
    };
    const codes = await svcWith(prisma).resolvePollThresholdToGeoCodes("t1", {
      pollId: "p1",
      questionCode: "C5",
      response: "NET Support",
      op: ">",
      value: 45,
      geoKind: "sed_upper",
    });
    expect(codes.sort()).toEqual(["A", "C"]);
  });
});
