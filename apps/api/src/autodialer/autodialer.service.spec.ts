import { NotFoundException } from "@nestjs/common";
import { DialerCampaignStatus } from "@uprise/db";
import { AutodialerService, isValidAuTargetNumber } from "./autodialer.service";

/**
 * Mocked-prisma harness (house convention): a plain object per model with
 * jest.fn()s, `$transaction` running the callback against the same mock so
 * in-tx writes are observable, and `$queryRaw` standing in for the FOR UPDATE
 * lock (returns the row by default; [] simulates not-found).
 */
function makePrisma() {
  const prisma: any = {
    dialerCampaign: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    },
    dialerQuestion: { create: jest.fn(), deleteMany: jest.fn() },
    dialerAnswer: { create: jest.fn(), deleteMany: jest.fn() },
    dialerAttempt: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: "dc1" }]),
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

const outbox = { append: jest.fn() } as any;
const flags = { isEnabled: jest.fn().mockResolvedValue(true) } as any;

const baseCampaign = {
  id: "dc1",
  tenantId: "t1",
  name: "Ring the electorate",
  status: DialerCampaignStatus.DRAFT,
  outboundOnly: true,
  publicVisible: false,
  survey: false,
  electoralTarget: false,
  transparentTargetTransfer: false,
  audienceId: "aud1",
  dailyStart: "09:00",
  dailyFinish: "20:00",
  dialerPeriodMinutes: 5,
  noCallWindowHours: 24,
  maxCallAttempts: 3,
  batchSize: 20,
  fromNumberId: null,
  intro: null,
  outro: null,
  optOut: null,
  targetNumbers: null,
  partyTargets: null,
  jurisdiction: null,
  officeTarget: null,
  amdEnabled: true,
  recordingEnabled: false,
  defaultLanguage: "en",
  lastDialedAt: null,
  startedAt: null,
  completedAt: null,
  createdById: null,
  questions: [] as any[],
};

function makeService(campaign: Record<string, unknown> = {}) {
  const prisma = makePrisma();
  const row = { ...baseCampaign, ...campaign };
  prisma.dialerCampaign.findFirst.mockResolvedValue(row);
  prisma.dialerCampaign.findUnique.mockResolvedValue(row);
  prisma.dialerCampaign.create.mockImplementation(async ({ data }: any) => ({ ...row, ...data, id: "dc-new" }));
  prisma.dialerCampaign.update.mockImplementation(async ({ data }: any) => ({ ...row, ...data }));
  const service = new AutodialerService(prisma, outbox, flags);
  return { service, prisma, row };
}

beforeEach(() => {
  jest.clearAllMocks();
  flags.isEnabled.mockResolvedValue(true);
});

describe("isValidAuTargetNumber", () => {
  it("accepts AU geographic and mobile numbers, rejects the rest — the source regex", () => {
    expect(isValidAuTargetNumber("+61262773333")).toBe(true); // Canberra office
    expect(isValidAuTargetNumber("+61412345678")).toBe(true); // mobile
    expect(isValidAuTargetNumber("+1415555000")).toBe(false);
    expect(isValidAuTargetNumber("0262773333")).toBe(false);
    expect(isValidAuTargetNumber("+619999")).toBe(false);
  });
});

describe("create", () => {
  it("creates a DRAFT and appends the created event in the same transaction", async () => {
    const { service, prisma } = makeService();
    await service.create("t1", { name: "New campaign" } as any, "u1");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.dialerCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "t1", name: "New campaign", createdById: "u1" }) }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventType: "autodialer.campaign.created", tenantId: "t1" }),
    );
  });
});

describe("update", () => {
  it("rejects editing an ACTIVE campaign", async () => {
    const { service } = makeService({ status: DialerCampaignStatus.ACTIVE });
    await expect(service.update("t1", "dc1", { name: "x" } as any)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects non-AU target numbers with a 422", async () => {
    const { service } = makeService();
    await expect(
      service.update("t1", "dc1", { targetNumbers: ["+1415555000"] } as any),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("updates editable fields on a DRAFT", async () => {
    const { service, prisma } = makeService();
    await service.update("t1", "dc1", { name: "Renamed", targetNumbers: ["+61262773333"] } as any);
    expect(prisma.dialerCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Renamed", targetNumbers: ["+61262773333"] }) }),
    );
  });
});

describe("lifecycle transitions", () => {
  it("activate locks the row, asserts the FSM, stamps startedAt and appends the event in-tx", async () => {
    const { service, prisma } = makeService();
    await service.activate("t1", "dc1");
    expect(prisma.$queryRaw).toHaveBeenCalled(); // FOR UPDATE lock
    expect(prisma.dialerCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DialerCampaignStatus.ACTIVE, startedAt: expect.any(Date) }),
      }),
    );
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventType: "autodialer.campaign.activated" }),
    );
  });

  it("activate refuses when preflight fails (no audience on an outbound campaign)", async () => {
    const { service } = makeService({ audienceId: null });
    await expect(service.activate("t1", "dc1")).rejects.toMatchObject({ status: 422 });
  });

  it("activate refuses when the plan flag is off", async () => {
    flags.isEnabled.mockResolvedValue(false);
    const { service } = makeService();
    await expect(service.activate("t1", "dc1")).rejects.toMatchObject({ status: 422 });
  });

  it("activate refuses an electoral campaign with no jurisdiction", async () => {
    const { service } = makeService({ electoralTarget: true });
    await expect(service.activate("t1", "dc1")).rejects.toMatchObject({ status: 422 });
  });

  it("activate refuses a survey campaign with no questions", async () => {
    const { service } = makeService({ survey: true, questions: [] });
    await expect(service.activate("t1", "dc1")).rejects.toMatchObject({ status: 422 });
  });

  it("complete counts the attempts into the event payload", async () => {
    const { service, prisma } = makeService({ status: DialerCampaignStatus.ACTIVE });
    prisma.dialerAttempt.count.mockResolvedValue(42);
    await service.complete("t1", "dc1");
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "autodialer.campaign.completed",
        payload: expect.objectContaining({ dialled: 42 }),
      }),
    );
  });

  it("an illegal transition throws 409 from the FSM (COMPLETED → pause)", async () => {
    const { service } = makeService({ status: DialerCampaignStatus.COMPLETED });
    await expect(service.pause("t1", "dc1")).rejects.toMatchObject({ status: 409 });
  });

  it("a vanished row under the lock is a 404", async () => {
    const { service, prisma } = makeService({ status: DialerCampaignStatus.ACTIVE });
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.pause("t1", "dc1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("upsertQuestionGraph", () => {
  it("replaces the graph transactionally and returns non-blocking issues", async () => {
    const { service, prisma } = makeService();
    prisma.dialerQuestion.create.mockImplementation(async ({ data }: any) => ({ id: `q-${data.key}`, ...data }));
    const dto = {
      questions: [
        {
          key: "q1",
          name: "Will you vote?",
          answers: [
            { digit: "1", value: "Yes", nextKey: "missing" },
            { digit: "2", value: "No", nextKey: "outro" },
          ],
        },
      ],
    } as any;
    const result = await service.upsertQuestionGraph("t1", "dc1", dto);
    expect(prisma.dialerAnswer.deleteMany).toHaveBeenCalledWith({ where: { campaignId: "dc1" } });
    expect(prisma.dialerQuestion.deleteMany).toHaveBeenCalledWith({ where: { campaignId: "dc1" } });
    expect(prisma.dialerQuestion.create).toHaveBeenCalledTimes(1);
    expect(prisma.dialerAnswer.create).toHaveBeenCalledTimes(2);
    // Dangling nextKey is savable work-in-progress, surfaced as an issue.
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "DANGLING_NEXT" }));
  });

  it("rejects graphs that storage cannot hold (duplicate digits)", async () => {
    const { service } = makeService();
    const dto = {
      questions: [
        { key: "q1", name: "Q", answers: [{ digit: "1", value: "a" }, { digit: "1", value: "b" }] },
      ],
    } as any;
    await expect(service.upsertQuestionGraph("t1", "dc1", dto)).rejects.toMatchObject({ status: 422 });
  });

  it("expands the authoring format with sequential nextKey defaults", async () => {
    const { service, prisma } = makeService();
    prisma.dialerQuestion.create.mockImplementation(async ({ data }: any) => ({ id: `q-${data.key}`, ...data }));
    await service.upsertQuestionGraph("t1", "dc1", {
      authoring: [
        { question: "First?", options: ["Yes", "No"] },
        { question: "Second?", options: ["A"] },
      ],
    } as any);
    const answerRows = prisma.dialerAnswer.create.mock.calls.map(([{ data }]: any) => data);
    expect(answerRows.filter((a: any) => a.nextKey === "q2")).toHaveLength(2);
    expect(answerRows.filter((a: any) => a.nextKey === "outro")).toHaveLength(1);
  });

  it("refuses graph edits on an ACTIVE campaign", async () => {
    const { service } = makeService({ status: DialerCampaignStatus.ACTIVE });
    await expect(service.upsertQuestionGraph("t1", "dc1", { questions: [] } as any)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("clone", () => {
  it("copies config + graph into a fresh DRAFT with a (copy) name and a created event", async () => {
    const { service, prisma } = makeService({
      status: DialerCampaignStatus.COMPLETED,
      questions: [
        {
          key: "q1",
          name: "Q1",
          type: "STANDARD",
          audioPrompt: null,
          orderIndex: 0,
          answers: [{ digit: "1", value: "Yes", nextKey: "outro", type: null, content: null, transfer: false, dispositionCode: null, supportLevel: null }],
        },
      ],
    });
    prisma.dialerQuestion.create.mockImplementation(async ({ data }: any) => ({ id: "nq1", ...data }));
    await service.clone("t1", "dc1", "u2");
    expect(prisma.dialerCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Ring the electorate (copy)", createdById: "u2" }) }),
    );
    expect(prisma.dialerQuestion.create).toHaveBeenCalledTimes(1);
    expect(prisma.dialerAnswer.create).toHaveBeenCalledTimes(1);
    expect(outbox.append).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventType: "autodialer.campaign.created" }),
    );
  });
});

describe("list", () => {
  it("hides ARCHIVED by default and maps behaviour filters", async () => {
    const { service, prisma } = makeService();
    await service.list("t1", { limit: 25, offset: 0, behaviour: "broadcast" } as any);
    const where = prisma.dialerCampaign.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: DialerCampaignStatus.ARCHIVED });
    expect(where.outboundOnly).toBe(true);
    expect(where.survey).toBe(false);
  });

  it("passes an explicit status filter through", async () => {
    const { service, prisma } = makeService();
    await service.list("t1", { limit: 25, offset: 0, status: "ARCHIVED" } as any);
    expect(prisma.dialerCampaign.findMany.mock.calls[0][0].where.status).toBe("ARCHIVED");
  });
});

describe("preflight", () => {
  it("reports every gate with admin-readable detail", async () => {
    const { service } = makeService({
      survey: true,
      electoralTarget: true,
      jurisdiction: "FEDERAL",
      questions: [
        {
          key: "q1",
          name: "Q1",
          type: "STANDARD",
          audioPrompt: null,
          answers: [{ digit: "1", value: "Yes", nextKey: "outro", type: null, content: null, transfer: false, dispositionCode: null, supportLevel: null }],
        },
      ],
    });
    const result = await service.preflight("t1", "dc1");
    expect(result.ok).toBe(true);
    const keys = result.checks.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["flag", "audience", "window", "survey", "jurisdiction"]));
  });

  it("fails the targets check for a transfer campaign with none", async () => {
    const { service } = makeService({ transparentTargetTransfer: true });
    const result = await service.preflight("t1", "dc1");
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({ key: "targets", ok: false }));
  });
});
