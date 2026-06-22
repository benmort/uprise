import { CanvassCampaignStatus } from "@yarns/db";
import { CampaignsService } from "./campaigns.service";

describe("CampaignsService", () => {
  let prisma: any;
  let service: CampaignsService;

  beforeEach(() => {
    prisma = {
      canvassCampaign: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
      },
      turf: { findMany: jest.fn() },
      doorKnock: { count: jest.fn() },
      walkListItem: { count: jest.fn() },
      turfAssignment: { findMany: jest.fn() },
    };
    service = new CampaignsService(prisma);
  });

  it("lists campaigns with turf + walk-list counts", async () => {
    prisma.canvassCampaign.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Spring",
        status: "ACTIVE",
        surveyId: null,
        scriptId: null,
        goals: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { turfs: 3, walkLists: 2 },
      },
    ]);
    const rows = await service.list("org1");
    expect(rows[0].turfCount).toBe(3);
    expect(rows[0].walkListCount).toBe(2);
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

  describe("getSummary", () => {
    it("computes percentages and de-dupes canvassers out", async () => {
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
        { canvasserId: "u1" },
        { canvasserId: "u1" },
        { canvasserId: "u2" },
      ]);

      const s = await service.getSummary("org1", "c1");
      expect(s.doorsToday).toBe(5);
      expect(s.turfCompletePct).toBe(25); // 10/40
      expect(s.contactRate).toBe(40); // 8/20
      expect(s.canvassersOut).toBe(2); // u1 de-duped
    });

    it("returns zeroes when the campaign has no turfs", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1" });
      prisma.turf.findMany.mockResolvedValue([]);
      prisma.doorKnock.count.mockResolvedValue(0);
      prisma.walkListItem.count.mockResolvedValue(0);
      const s = await service.getSummary("org1", "c1");
      expect(s).toMatchObject({ doorsToday: 0, turfCompletePct: 0, contactRate: 0, canvassersOut: 0 });
    });

    it("throws for an unknown campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue(null);
      await expect(service.getSummary("org1", "missing")).rejects.toThrow();
    });
  });
});
