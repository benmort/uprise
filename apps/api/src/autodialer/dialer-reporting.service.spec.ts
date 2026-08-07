import { NotFoundException } from "@nestjs/common";
import { DialerReportingService } from "./dialer-reporting.service";

/**
 * Read-side aggregates behind the admin list KPIs, monitor and results tabs.
 * The maths that matters: connect rate over DECIDED attempts only (PENDING and
 * CANCELED never dilute it), and survey distributions keyed to the authored
 * answers (zero-count options still appear).
 */

const NOW = new Date("2026-08-04T03:00:00.000Z");

function makePrisma() {
  const prisma: any = {
    dialerCampaign: {
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue({ id: "dc1", lastDialedAt: NOW }),
    },
    dialerAttempt: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    dialerRedirect: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    dialerSurveyResult: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    dialerCallSession: { count: jest.fn().mockResolvedValue(0) },
    dialerQuestion: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return prisma;
}

const outcomeRows = (rows: Record<string, number>) =>
  Object.entries(rows).map(([outcome, count]) => ({ outcome, _count: { _all: count } }));

describe("DialerReportingService", () => {
  it("computes the connect rate over decided attempts only", async () => {
    const prisma = makePrisma();
    prisma.dialerAttempt.groupBy.mockResolvedValue(
      outcomeRows({ PENDING: 40, CANCELED: 10, ANSWERED: 30, NO_ANSWER: 15, MACHINE: 5 }),
    );
    const service = new DialerReportingService(prisma);
    const stats = await service.tenantStats("t1", NOW);
    // decided = 30 + 15 + 5 = 50; 30/50 = 60.0%
    expect(stats.connectRate).toBe(60);
    expect(stats.active).toBe(2);
  });

  it("campaign stats split outcomes and count click-to-call sessions", async () => {
    const prisma = makePrisma();
    prisma.dialerAttempt.groupBy.mockResolvedValue(outcomeRows({ PENDING: 3, ANSWERED: 7 }));
    prisma.dialerAttempt.count.mockResolvedValue(4);
    prisma.dialerRedirect.count.mockResolvedValue(5);
    prisma.dialerSurveyResult.count.mockResolvedValue(9);
    prisma.dialerCallSession.count.mockResolvedValueOnce(6).mockResolvedValueOnce(2);
    const service = new DialerReportingService(prisma);

    const stats = await service.campaignStats("t1", "dc1", NOW);

    expect(stats.attempts).toEqual({ total: 10, pending: 3, byOutcome: { PENDING: 3, ANSWERED: 7 } });
    expect(stats.connectRate).toBe(100);
    expect(stats.transfers).toBe(5);
    expect(stats.surveyAnswers).toBe(9);
    expect(stats.sessions).toEqual({ started: 6, bridged: 2 });
    expect(stats.lastDialedAt).toEqual(NOW);
  });

  it("connect rate is null until any attempt decides", async () => {
    const prisma = makePrisma();
    prisma.dialerAttempt.groupBy.mockResolvedValue(outcomeRows({ PENDING: 12 }));
    const service = new DialerReportingService(prisma);
    expect((await service.campaignStats("t1", "dc1", NOW)).connectRate).toBeNull();
  });

  it("results keep zero-count answers so every authored option reports", async () => {
    const prisma = makePrisma();
    prisma.dialerQuestion.findMany.mockResolvedValue([
      {
        key: "q1",
        name: "Do you support raising the rate?",
        orderIndex: 0,
        answers: [
          { digit: "2", value: "No", dispositionCode: null, supportLevel: null },
          { digit: "1", value: "Yes", dispositionCode: "SUPPORT", supportLevel: "STRONG_SUPPORT" },
        ],
      },
    ]);
    prisma.dialerSurveyResult.groupBy.mockResolvedValue([
      { questionKey: "q1", answerDigit: "1", _count: { _all: 8 } },
    ]);
    const service = new DialerReportingService(prisma);

    const results = await service.results("t1", "dc1");

    expect(results.questions[0].answers).toEqual([
      { digit: "1", value: "Yes", count: 8, dispositionCode: "SUPPORT", supportLevel: "STRONG_SUPPORT" },
      { digit: "2", value: "No", count: 0, dispositionCode: null, supportLevel: null },
    ]);
    expect(results.questions[0].total).toBe(8);
  });

  it("scopes every read to the tenant — a foreign campaign 404s", async () => {
    const prisma = makePrisma();
    prisma.dialerCampaign.findFirst.mockResolvedValue(null);
    const service = new DialerReportingService(prisma);
    await expect(service.campaignStats("t1", "foreign", NOW)).rejects.toThrow(NotFoundException);
    await expect(service.results("t1", "foreign")).rejects.toThrow(NotFoundException);
    await expect(service.listAttempts("t1", "foreign", { limit: 10, offset: 0 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("bounds the tenant connect rate to a 90-day window rather than every attempt ever made", async () => {
    const prisma = makePrisma();
    const service = new DialerReportingService(prisma);

    await service.tenantStats("t1", NOW);

    const [{ where }] = prisma.dialerAttempt.groupBy.mock.calls[0];
    expect(where.tenantId).toBe("t1");
    expect(where.createdAt.gte).toEqual(new Date(NOW.getTime() - 90 * 86_400_000));
  });

  it("leads the per-campaign session and transfer reads with tenantId so the composite indexes serve them", async () => {
    const prisma = makePrisma();
    const service = new DialerReportingService(prisma);

    await service.campaignStats("t1", "dc1", NOW);
    await service.results("t1", "dc1");

    for (const [args] of prisma.dialerCallSession.count.mock.calls) {
      expect(args.where).toMatchObject({ tenantId: "t1", campaignId: "dc1" });
    }
    for (const [args] of prisma.dialerRedirect.count.mock.calls) {
      expect(args.where).toMatchObject({ tenantId: "t1", campaignId: "dc1" });
    }
    expect(prisma.dialerRedirect.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "t1", campaignId: "dc1" } }),
    );
  });

  it("lists attempts newest-first with paging", async () => {
    const prisma = makePrisma();
    prisma.dialerAttempt.count.mockResolvedValue(120);
    prisma.dialerAttempt.findMany.mockResolvedValue([{ id: "a1" }]);
    const service = new DialerReportingService(prisma);

    const page = await service.listAttempts("t1", "dc1", { limit: 25, offset: 50 });

    expect(page.total).toBe(120);
    expect(prisma.dialerAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 25, skip: 50 }),
    );
  });
});
