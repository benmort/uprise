import { CanvassCampaignStatus } from "@uprise/db";
import { CampaignsService } from "./campaigns.service";

describe("CampaignsService", () => {
  let prisma: any;
  let geo: any;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = {
      canvassCampaign: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
        delete: jest.fn(async () => ({ id: "c1" })),
      },
      turf: { findMany: jest.fn() },
      doorKnock: { count: jest.fn(), findMany: jest.fn() },
      disposition: { groupBy: jest.fn(), count: jest.fn(), findMany: jest.fn() },
      questionResponse: { count: jest.fn() },
      walkListItem: { count: jest.fn() },
      turfAssignment: { findMany: jest.fn() },
      contact: { count: jest.fn(), groupBy: jest.fn() },
    };
    geo = {
      unionSources: jest.fn(async () => null),
      describeSources: jest.fn(async () => []),
      boundaryAddressCount: jest.fn(async () => ({ addresses: 42 })),
    } as any;
    service = new CampaignsService(prisma, geo);
  });

  it("lists campaigns with turf + walk-list counts, priority + derived state", async () => {
    prisma.canvassCampaign.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Richmond",
        status: "ACTIVE",
        surveyId: null,
        scriptId: null,
        goals: null,
        priority: 2,
        boundarySources: [{ kind: "division", type: "sed_lower", code: "27103" }],
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { turfs: 3, walkLists: 2 },
      },
    ]);
    const rows = await service.list("org1");
    expect(rows[0].turfCount).toBe(3);
    expect(rows[0].walkListCount).toBe(2);
    expect(rows[0].priority).toBe(2);
    expect(rows[0].state).toBe("VIC"); // ABS code 2xxxx → Victoria
  });

  it("derives no state from a drawn (non-division) boundary", async () => {
    prisma.canvassCampaign.findMany.mockResolvedValue([
      {
        id: "c2", name: "Drawn", status: "DRAFT", surveyId: null, scriptId: null, goals: null,
        priority: 0, boundarySources: [{ kind: "polygon", geometry: {} }],
        createdAt: new Date(), updatedAt: new Date(), _count: { turfs: 0, walkLists: 0 },
      },
    ]);
    expect((await service.list("org1"))[0].state).toBeNull();
  });

  it("get throws when the campaign is missing", async () => {
    prisma.canvassCampaign.findFirst.mockResolvedValue(null);
    await expect(service.get("org1", "missing")).rejects.toThrow();
  });

  it("create defaults status to DRAFT", async () => {
    const created = await service.create("org1", { name: "New" });
    expect(created.status).toBe(CanvassCampaignStatus.DRAFT);
    expect(created.tenantId).toBe("org1");
  });

  it("update only writes provided fields and rejects unknown campaigns", async () => {
    prisma.canvassCampaign.findFirst.mockResolvedValue(null);
    await expect(service.update("org1", "missing", { name: "x" })).rejects.toThrow();

    prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
    await service.update("org1", "c1", { name: "Renamed" });
    expect(prisma.canvassCampaign.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "Renamed" },
    });
  });

  it("remove deletes a tenant-owned campaign and rejects unknown ones", async () => {
    prisma.canvassCampaign.findFirst.mockResolvedValue(null);
    await expect(service.remove("org1", "missing")).rejects.toThrow();
    expect(prisma.canvassCampaign.delete).not.toHaveBeenCalled();

    prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
    const res = await service.remove("org1", "c1");
    expect(prisma.canvassCampaign.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(res).toEqual({ id: "c1" });
  });

  it("boundaryAddressCount rejects unknown campaigns and delegates the boundary otherwise", async () => {
    prisma.canvassCampaign.findFirst.mockResolvedValue(null);
    await expect(service.boundaryAddressCount("org1", "missing")).rejects.toThrow();

    prisma.canvassCampaign.findFirst.mockResolvedValue({ boundary: { type: "Polygon" } });
    const res = await service.boundaryAddressCount("org1", "c1");
    expect(geo.boundaryAddressCount).toHaveBeenCalledWith({ type: "Polygon" });
    expect(res).toEqual({ addresses: 42 });
  });

  describe("getSummary", () => {
    it("computes percentages and de-dupes volunteers out", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
      // doorsToday, totalKnocks, contactKnocks
      prisma.doorKnock.count
        .mockResolvedValueOnce(5) // doorsToday
        .mockResolvedValueOnce(20) // totalKnocks
        .mockResolvedValueOnce(8); // contactKnocks
      prisma.walkListItem.count
        .mockResolvedValueOnce(40) // totalStops
        .mockResolvedValueOnce(10); // visitedStops
      prisma.turfAssignment.findMany.mockResolvedValue([
        { volunteerId: "u1" },
        { volunteerId: "u1" },
        { volunteerId: "u2" },
      ]);

      const s = await service.getSummary("org1", "c1");
      expect(s.doorsToday).toBe(5);
      expect(s.turfCompletePct).toBe(25); // 10/40
      expect(s.contactRate).toBe(40); // 8/20
      expect(s.volunteersOut).toBe(2); // u1 de-duped
    });

    it("returns zeroes when the campaign has no turfs", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      prisma.turf.findMany.mockResolvedValue([]);
      prisma.doorKnock.count.mockResolvedValue(0);
      prisma.walkListItem.count.mockResolvedValue(0);
      const s = await service.getSummary("org1", "c1");
      expect(s).toMatchObject({ doorsToday: 0, turfCompletePct: 0, contactRate: 0, volunteersOut: 0 });
    });

    it("throws for an unknown campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.getSummary("org1", "missing")).rejects.toThrow();
    });
  });

  describe("getResults", () => {
    it("aggregates tenant-wide when no campaign id (no campaign lookup, no turf filter)", async () => {
      prisma.disposition.groupBy
        .mockResolvedValueOnce([{ code: "NOT_HOME", _count: { _all: 3 } }])
        .mockResolvedValueOnce([{ supportLevel: "STRONG_SUPPORT", _count: { _all: 2 } }]);
      prisma.doorKnock.count.mockResolvedValueOnce(10).mockResolvedValueOnce(6); // attempted, contacted
      prisma.questionResponse.count.mockResolvedValue(4);
      prisma.disposition.count.mockResolvedValue(2); // newSupporters

      const res = await service.getResults("org1");
      // Tenant-wide never resolves a campaign or its turfs.
      expect(prisma.canvassCampaign.findFirst).not.toHaveBeenCalled();
      // Doors attempted is filtered by tenant only — no turf restriction.
      expect(prisma.doorKnock.count).toHaveBeenCalledWith({ where: { tenantId: "org1" } });
      expect(res.dispositionBreakdown).toEqual([{ code: "NOT_HOME", count: 3 }]);
      expect(res.funnel).toEqual({ doorsAttempted: 10, contacted: 6, surveyed: 4, newSupporters: 2 });
    });

    it("scopes to the campaign's turf contacts when an id is given", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }]);
      prisma.disposition.groupBy.mockResolvedValue([]);
      prisma.doorKnock.count.mockResolvedValue(0);
      prisma.questionResponse.count.mockResolvedValue(0);
      prisma.disposition.count.mockResolvedValue(0);
      await service.getResults("org1", "c1");
      expect(prisma.doorKnock.count).toHaveBeenCalledWith({
        where: { tenantId: "org1", contact: { turfId: { in: ["t1"] } } },
      });
    });
  });

  describe("getLive", () => {
    it("aggregates across all tenant turfs when no campaign id", async () => {
      prisma.turfAssignment.findMany.mockResolvedValue([]);
      prisma.doorKnock.findMany.mockResolvedValue([]);
      const res = await service.getLive("org1");
      expect(prisma.canvassCampaign.findFirst).not.toHaveBeenCalled();
      // Locks are scoped by the turf's tenant, not a turfId list.
      expect(prisma.turfAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ turf: { tenantId: "org1" } }) }),
      );
      expect(res).toMatchObject({ doorsToday: 0, volunteers: [] });
    });
  });

  describe("getFieldReport", () => {
    const groupRow = (turfId: string, n: number) => ({ turfId, _count: { _all: n } });

    /** Baseline zero-data mocks; individual tests override what they exercise. */
    function mockZeroData() {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ goals: null, boundary: null });
      prisma.turf.findMany.mockResolvedValue([]);
      prisma.doorKnock.count.mockResolvedValue(0);
      prisma.disposition.count.mockResolvedValue(0);
      prisma.disposition.findMany.mockResolvedValue([]);
      prisma.contact.count.mockResolvedValue(0);
      prisma.contact.groupBy.mockResolvedValue([]);
    }

    it("throws for an unknown campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.getFieldReport("org1", "missing")).rejects.toThrow();
    });

    it("computes the five rates, boundary coverage and per-turf rows", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({
        goals: { supporters: 500 },
        boundary: { type: "MultiPolygon" },
      });
      prisma.turf.findMany.mockResolvedValue([
        { id: "t1", name: "North" },
        { id: "t2", name: "South" },
      ]);
      prisma.doorKnock.count
        .mockResolvedValueOnce(200) // attempts (raw knocks)
        .mockResolvedValueOnce(70); // conversations (CONTACT_CODES)
      prisma.disposition.count
        .mockResolvedValueOnce(35) // support-levelled IDs
        .mockResolvedValueOnce(5); // supporters before the window
      prisma.contact.count
        .mockResolvedValueOnce(28) // distinct contacts surveyed
        .mockResolvedValueOnce(150); // distinct doors attempted
      prisma.disposition.findMany.mockResolvedValue([]);
      prisma.contact.groupBy
        .mockResolvedValueOnce([groupRow("t1", 100), groupRow("t2", 60)]) // doors
        .mockResolvedValueOnce([groupRow("t1", 90), groupRow("t2", 60)]) // attempted
        .mockResolvedValueOnce([groupRow("t1", 30)]) // contacted
        .mockResolvedValueOnce([groupRow("t1", 12)]); // ID'd
      geo.boundaryAddressCount.mockResolvedValue({ addresses: 400 });

      const r = await service.getFieldReport("org1", "c1");
      expect(r.attempts).toBe(200);
      expect(r.conversations).toBe(70);
      expect(r.contactRate).toBe(0.35); // 70/200
      expect(r.idRate).toBe(0.5); // 35/70
      expect(r.qualityProxy).toBe(0.4); // 28/70
      expect(r.coverage).toEqual({
        attemptedDoors: 150,
        doorUniverse: 400, // the spatial boundary count wins over turf contacts
        source: "boundary",
        rate: 0.375,
      });
      expect(geo.boundaryAddressCount).toHaveBeenCalledWith({ type: "MultiPolygon" });
      expect(r.accumulation.goal).toBe(500);

      expect(r.perTurf).toEqual([
        {
          turfId: "t1",
          name: "North",
          doors: 100,
          attempts: 90,
          contactRate: 0.333, // 30/90 attempted doors
          idRate: 0.4, // 12/30 contacted doors
          coverage: 0.9,
        },
        {
          turfId: "t2",
          name: "South",
          doors: 60,
          attempts: 60,
          contactRate: 0, // 60 doors attempted, nobody reached — a true 0 %
          idRate: null, // no conversations → unknown, not 0 %
          coverage: 1,
        },
      ]);
      // Both knock counters are scoped to the campaign's turf contacts.
      expect(prisma.doorKnock.count).toHaveBeenCalledWith({
        where: { tenantId: "org1", contact: { turfId: { in: ["t1", "t2"] } } },
      });
    });

    it("returns null rates — never fake 0 % — when there is no data at all", async () => {
      mockZeroData();
      const r = await service.getFieldReport("org1", "c1");
      expect(r.attempts).toBe(0);
      expect(r.contactRate).toBeNull();
      expect(r.idRate).toBeNull();
      expect(r.qualityProxy).toBeNull();
      expect(r.coverage).toEqual({ attemptedDoors: 0, doorUniverse: null, source: null, rate: null });
      expect(geo.boundaryAddressCount).not.toHaveBeenCalled();
      expect(r.perTurf).toEqual([]);
      // The default window still renders: 8 empty weeks, cumulative stuck at 0.
      expect(r.accumulation.weekly).toHaveLength(8);
      expect(r.accumulation.weekly.every((w: any) => w.newSupporters === 0 && w.cumulative === 0)).toBe(true);
      expect(r.accumulation.goal).toBeNull();
    });

    it("falls back to the turf contact universe when no boundary is saved", async () => {
      mockZeroData();
      prisma.turf.findMany.mockResolvedValue([{ id: "t1", name: "North" }]);
      prisma.contact.count
        .mockResolvedValueOnce(0) // surveyed
        .mockResolvedValueOnce(30); // doors attempted
      prisma.contact.groupBy
        .mockResolvedValueOnce([groupRow("t1", 120)]) // doors
        .mockResolvedValueOnce([groupRow("t1", 30)])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const r = await service.getFieldReport("org1", "c1");
      expect(r.coverage).toEqual({
        attemptedDoors: 30,
        doorUniverse: 120,
        source: "turf-contacts",
        rate: 0.25,
      });
      expect(geo.boundaryAddressCount).not.toHaveBeenCalled();
    });

    it("buckets supporters into local Monday weeks and accumulates from the prior count", async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 6, 15, 10, 0, 0)); // Wed 15 Jul 2026
      try {
        mockZeroData();
        prisma.disposition.count
          .mockResolvedValueOnce(0) // support-levelled IDs
          .mockResolvedValueOnce(5); // prior supporters (before the window)
        prisma.disposition.findMany.mockResolvedValue([
          { createdAt: new Date(2026, 5, 30, 18, 30) }, // Tue 30 Jun → week of Mon 29 Jun
          { createdAt: new Date(2026, 6, 1, 9, 0) }, // Wed 1 Jul → week of Mon 29 Jun
          { createdAt: new Date(2026, 6, 14, 12, 0) }, // Tue 14 Jul → week of Mon 13 Jul
        ]);

        const r = await service.getFieldReport("org1", "c1", { weeks: 3 });
        expect(r.accumulation.priorSupporters).toBe(5);
        expect(r.accumulation.weekly).toEqual([
          { weekStart: "2026-06-29", newSupporters: 2, cumulative: 7 },
          { weekStart: "2026-07-06", newSupporters: 0, cumulative: 7 },
          { weekStart: "2026-07-13", newSupporters: 1, cumulative: 8 },
        ]);
        // The window starts at the oldest bucket's Monday midnight (local).
        expect(prisma.disposition.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ createdAt: { gte: new Date(2026, 5, 29) } }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("clamps the weeks window (0 → 1, non-numeric → the default 8)", async () => {
      mockZeroData();
      const clamped = await service.getFieldReport("org1", "c1", { weeks: 0 });
      expect(clamped.accumulation.weekly).toHaveLength(1);
      mockZeroData();
      const defaulted = await service.getFieldReport("org1", "c1", { weeks: Number("nope") });
      expect(defaulted.accumulation.weekly).toHaveLength(8);
    });
  });

  describe("getBoundary", () => {
    it("returns the cached geometry, the raw sources, and their resolved names", async () => {
      const sources = [{ kind: "division", type: "ced", code: "201" }];
      prisma.canvassCampaign.findFirst.mockResolvedValue({
        boundary: { type: "MultiPolygon", coordinates: [] },
        boundarySources: sources,
      });
      geo.describeSources.mockResolvedValue([
        { kind: "division", key: "ced", code: "201", name: "Melbourne" },
      ]);
      const res = await service.getBoundary("org1", "c1");
      // Raw sources kept for the boundary editor's round-trip; described names for display.
      expect(res.sources).toBe(sources);
      expect(geo.describeSources).toHaveBeenCalledWith(sources);
      expect(res.describedSources).toEqual([
        { kind: "division", key: "ced", code: "201", name: "Melbourne" },
      ]);
    });

    it("describes an empty list when the campaign has no boundary", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ boundary: null, boundarySources: null });
      const res = await service.getBoundary("org1", "c1");
      expect(res.boundary).toBeNull();
      expect(geo.describeSources).toHaveBeenCalledWith([]); // null sources → []
      expect(res.describedSources).toEqual([]);
    });

    it("throws for an unknown campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.getBoundary("org1", "missing")).rejects.toThrow();
    });
  });

  describe("previewBoundary", () => {
    it("unions the sources WITHOUT persisting", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      geo.unionSources.mockResolvedValue({ type: "MultiPolygon", coordinates: [[[]]] });
      const sources = [{ kind: "division" as const, type: "sed_lower", code: "27103" }];
      const res = await service.previewBoundary("org1", "c1", sources as never);
      expect(geo.unionSources).toHaveBeenCalledWith(sources);
      expect(res.boundary).toEqual({ type: "MultiPolygon", coordinates: [[[]]] });
      expect(prisma.canvassCampaign.update).not.toHaveBeenCalled(); // preview never writes
    });

    it("returns a null boundary for no sources (no union call)", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      const res = await service.previewBoundary("org1", "c1", []);
      expect(res.boundary).toBeNull();
      expect(geo.unionSources).not.toHaveBeenCalled();
    });

    it("throws for an unknown campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.previewBoundary("org1", "missing", [])).rejects.toThrow();
    });
  });
});
