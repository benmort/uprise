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
      doorKnock: { count: jest.fn() },
      walkListItem: { count: jest.fn() },
      turfAssignment: { findMany: jest.fn() },
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
