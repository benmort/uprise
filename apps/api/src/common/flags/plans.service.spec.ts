import { PlansService } from "./plans.service";

// A real catalogue flag key so sanitiseFeatureFlags keeps it.
const VALID_FLAG = "FEATURE_WHATSAPP_ENABLED";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    plan: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      upsert: jest.fn(async ({ create }: any) => ({ id: "p1", ...create })),
      update: jest.fn(async ({ data }: any) => ({ id: "p1", ...data })),
    },
    ...overrides,
  };
  return base;
}

describe("PlansService", () => {
  let prisma: any;
  let service: PlansService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PlansService(prisma);
  });

  describe("list / listPublic", () => {
    it("lists all plans in tier order", async () => {
      await service.list();
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
    });

    it("lists only publicly-visible, non-archived plans for marketing", async () => {
      await service.listPublic();
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        where: { publiclyVisible: true, archivedAt: null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
    });
  });

  describe("upsert", () => {
    it("creates by key, keeping only valid boolean feature flags", async () => {
      await service.upsert({
        key: "growth",
        displayName: "Growth",
        featureFlags: { [VALID_FLAG]: true, NOT_A_REAL_FLAG: true, [VALID_FLAG + "_X"]: "nope" },
      });
      const call = prisma.plan.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ key: "growth" });
      expect(call.create.featureFlags).toEqual({ [VALID_FLAG]: true });
      // Defaults applied on create.
      expect(call.create).toMatchObject({
        isDefault: false,
        publiclyVisible: true,
        order: 0,
        popular: false,
        description: null,
        priceMonthly: null,
      });
      // update branch always clears archivedAt.
      expect(call.update.archivedAt).toBeNull();
    });

    it("drops non-boolean flag values", async () => {
      await service.upsert({
        key: "starter",
        displayName: "Starter",
        featureFlags: { [VALID_FLAG]: "yes" as any },
      });
      const call = prisma.plan.upsert.mock.calls[0][0];
      expect(call.create.featureFlags).toEqual({});
    });

    it("honours explicit create-time overrides", async () => {
      await service.upsert({
        key: "pro",
        displayName: "Pro",
        featureFlags: {},
        isDefault: true,
        publiclyVisible: false,
        order: 3,
        popular: true,
        description: "Best value",
        priceMonthly: 99,
      });
      const call = prisma.plan.upsert.mock.calls[0][0];
      expect(call.create).toMatchObject({
        isDefault: true,
        publiclyVisible: false,
        order: 3,
        popular: true,
        description: "Best value",
        priceMonthly: 99,
      });
    });
  });

  describe("update", () => {
    it("throws NotFoundException when the plan is absent", async () => {
      prisma.plan.findUnique.mockResolvedValue(null);
      await expect(service.update("missing", {})).rejects.toThrow("Plan not found");
      expect(prisma.plan.update).not.toHaveBeenCalled();
    });

    it("archives by stamping archivedAt with a Date", async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: "p1" });
      await service.update("p1", { archived: true });
      const data = prisma.plan.update.mock.calls[0][0].data;
      expect(data.archivedAt).toBeInstanceOf(Date);
    });

    it("un-archives by nulling archivedAt", async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: "p1" });
      await service.update("p1", { archived: false });
      const data = prisma.plan.update.mock.calls[0][0].data;
      expect(data.archivedAt).toBeNull();
    });

    it("leaves archivedAt untouched (undefined) when archived is not supplied", async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: "p1" });
      await service.update("p1", { displayName: "Renamed" });
      const data = prisma.plan.update.mock.calls[0][0].data;
      expect(data.archivedAt).toBeUndefined();
      expect(data.displayName).toBe("Renamed");
    });

    it("passes an explicit null description/price through but omits undefined ones", async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: "p1" });
      await service.update("p1", { description: null, priceMonthly: null });
      const data = prisma.plan.update.mock.calls[0][0].data;
      expect(data.description).toBeNull();
      expect(data.priceMonthly).toBeNull();
      expect(data.priceAnnually).toBeUndefined();
    });

    it("sanitises feature flags on update", async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: "p1" });
      await service.update("p1", { featureFlags: { [VALID_FLAG]: false, bogus: true } });
      const data = prisma.plan.update.mock.calls[0][0].data;
      expect(data.featureFlags).toEqual({ [VALID_FLAG]: false });
    });
  });
});
