import { HttpException } from "@nestjs/common";
import { JourneysController } from "./journeys.controller";

// The controller runs journey reads/writes inline against PrismaService and only
// delegates the cron sweep to JourneysService, so we mock both constructor deps.
function makePrisma() {
  const prisma: any = {
    journey: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "j1" }),
      findFirst: jest.fn().mockResolvedValue({ id: "j1", triggerType: "t", triggerConfig: {}, rungs: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: "j1" }),
      findUnique: jest.fn().mockResolvedValue({ id: "j1", rungs: [] }),
    },
    journeyEnrolment: { groupBy: jest.fn().mockResolvedValue([]) },
    journeyRung: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  return prisma;
}

function setup() {
  const prisma = makePrisma();
  const journeys = { sweepDue: jest.fn().mockResolvedValue({ resumed: 0 }) } as any;
  const c = new JourneysController(prisma, journeys);
  return { prisma, journeys, c };
}

describe("JourneysController", () => {
  it("list reads the tenant's journeys with rungs ordered", async () => {
    const { prisma, c } = setup();
    await c.list("t1");
    expect(prisma.journey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1" } }),
    );
  });

  it("create writes a journey scoped to the tenant", async () => {
    const { prisma, c } = setup();
    await c.create("t1", { name: "J", triggerType: "manual" } as any);
    expect(prisma.journey.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", name: "J" }) }),
    );
  });

  it("setStatus updates only rows matching id + tenant", async () => {
    const { prisma, c } = setup();
    await c.setStatus("t1", "j1", { status: "ACTIVE" } as any);
    expect(prisma.journey.updateMany).toHaveBeenCalledWith({
      where: { id: "j1", tenantId: "t1" },
      data: { status: "ACTIVE" },
    });
  });

  it("update replaces rungs transactionally when provided", async () => {
    const { prisma, c } = setup();
    await c.update("t1", "j1", { name: "New", rungs: [{ type: "wait", config: {} }] } as any);
    expect(prisma.journey.findFirst).toHaveBeenCalledWith({ where: { id: "j1", tenantId: "t1" } });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.journey.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j1" } }),
    );
    expect(prisma.journeyRung.deleteMany).toHaveBeenCalledWith({ where: { journeyId: "j1" } });
    expect(prisma.journeyRung.createMany).toHaveBeenCalled();
  });

  it("update throws NOT_FOUND for an unknown journey", async () => {
    const { prisma, c } = setup();
    prisma.journey.findFirst.mockResolvedValueOnce(null);
    await expect(c.update("t1", "missing", {} as any)).rejects.toBeInstanceOf(HttpException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("remove deletes the row and reports success", async () => {
    const { prisma, c } = setup();
    await expect(c.remove("t1", "j1")).resolves.toEqual({ deleted: true });
    expect(prisma.journey.deleteMany).toHaveBeenCalledWith({ where: { id: "j1", tenantId: "t1" } });
  });

  it("remove throws NOT_FOUND when nothing was deleted", async () => {
    const { prisma, c } = setup();
    prisma.journey.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(c.remove("t1", "missing")).rejects.toBeInstanceOf(HttpException);
  });

  it("stats aggregates enrolment states into a funnel", async () => {
    const { prisma, c } = setup();
    prisma.journeyEnrolment.groupBy.mockResolvedValueOnce([
      { state: "COMPLETED", _count: { _all: 3 } },
      { state: "ACTIVE", _count: { _all: 1 } },
    ]);
    const res = await c.stats("t1", "j1");
    expect(res).toMatchObject({ enrolled: 4, completed: 3, active: 1, conversionPct: 75 });
  });

  it("stats throws NOT_FOUND for an unknown journey", async () => {
    const { prisma, c } = setup();
    prisma.journey.findFirst.mockResolvedValueOnce(null);
    await expect(c.stats("t1", "missing")).rejects.toBeInstanceOf(HttpException);
  });

  it("dryRun returns the trigger + labelled ordered steps", async () => {
    const { prisma, c } = setup();
    prisma.journey.findFirst.mockResolvedValueOnce({
      triggerType: "manual",
      triggerConfig: {},
      rungs: [{ rungIndex: 0, type: "wait", config: {} }],
    });
    const res = await c.dryRun("t1", "j1", {} as any);
    expect(res.steps[0]).toMatchObject({ type: "wait", label: "Wait" });
  });

  it("dryRun throws NOT_FOUND for an unknown journey", async () => {
    const { prisma, c } = setup();
    prisma.journey.findFirst.mockResolvedValueOnce(null);
    await expect(c.dryRun("t1", "missing", {} as any)).rejects.toBeInstanceOf(HttpException);
  });

  it("sweepDue parses the limit and delegates to the service", () => {
    const { journeys, c } = setup();
    c.sweepDue("5");
    expect(journeys.sweepDue).toHaveBeenCalledWith(5);
    c.sweepDue();
    expect(journeys.sweepDue).toHaveBeenLastCalledWith(undefined);
  });
});
