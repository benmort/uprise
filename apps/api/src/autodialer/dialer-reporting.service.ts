import { Injectable, NotFoundException } from "@nestjs/common";
import { DialerCampaignStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Read-side aggregates for the admin screens — list KPIs, per-campaign
 * monitor stats, and the results tab (survey distributions + the transfer
 * ledger). Pure reads over the Dialer* tables; no state transitions here.
 */

export type DialerTenantStats = {
  active: number;
  callsToday: number;
  connectRate: number | null;
  transfers: number;
};

export type DialerCampaignStats = {
  attempts: { total: number; pending: number; byOutcome: Record<string, number> };
  callsToday: number;
  /** ANSWERED over decided attempts (terminal minus CANCELED); null until any decide. */
  connectRate: number | null;
  transfers: number;
  surveyAnswers: number;
  sessions: { started: number; bridged: number };
  lastDialedAt: Date | null;
};

export type DialerResults = {
  questions: Array<{
    key: string;
    name: string;
    total: number;
    answers: Array<{
      digit: string;
      value: string;
      count: number;
      dispositionCode: string | null;
      supportLevel: string | null;
    }>;
  }>;
  transferCount: number;
  transfers: Array<{
    id: string;
    targetNumber: string;
    targetName: string | null;
    targetParty: string | null;
    electorate: string | null;
    phoneNumber: string | null;
    createdAt: Date;
  }>;
};

const DECIDED_OUTCOMES = ["ANSWERED", "MACHINE", "NO_ANSWER", "BUSY", "FAILED", "OPTED_OUT"];

@Injectable()
export class DialerReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfToday(now: Date): Date {
    // Tenant-local "today" would need the tz join; UTC midnight is the
    // dashboard convention elsewhere (dashboards are trend surfaces).
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  async tenantStats(tenantId: string, now: Date = new Date()): Promise<DialerTenantStats> {
    const [active, callsToday, outcomes, transfers] = await Promise.all([
      this.prisma.dialerCampaign.count({
        where: { tenantId, status: DialerCampaignStatus.ACTIVE },
      }),
      this.prisma.dialerAttempt.count({
        where: { tenantId, createdAt: { gte: this.startOfToday(now) } },
      }),
      this.prisma.dialerAttempt.groupBy({
        by: ["outcome"],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.dialerRedirect.count({ where: { tenantId } }),
    ]);
    return {
      active,
      callsToday,
      connectRate: this.connectRate(outcomes),
      transfers,
    };
  }

  async campaignStats(tenantId: string, campaignId: string, now: Date = new Date()): Promise<DialerCampaignStats> {
    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true, lastDialedAt: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");

    const [outcomes, callsToday, transfers, surveyAnswers, sessionsStarted, sessionsBridged] =
      await Promise.all([
        this.prisma.dialerAttempt.groupBy({
          by: ["outcome"],
          where: { campaignId },
          _count: { _all: true },
        }),
        this.prisma.dialerAttempt.count({
          where: { campaignId, createdAt: { gte: this.startOfToday(now) } },
        }),
        this.prisma.dialerRedirect.count({ where: { campaignId } }),
        this.prisma.dialerSurveyResult.count({ where: { campaignId } }),
        this.prisma.dialerCallSession.count({ where: { campaignId } }),
        this.prisma.dialerCallSession.count({
          where: { campaignId, status: { in: ["BRIDGED", "ENDED"] } },
        }),
      ]);

    const byOutcome: Record<string, number> = {};
    let total = 0;
    for (const row of outcomes) {
      byOutcome[row.outcome] = row._count._all;
      total += row._count._all;
    }
    return {
      attempts: { total, pending: byOutcome.PENDING ?? 0, byOutcome },
      callsToday,
      connectRate: this.connectRate(outcomes),
      transfers,
      surveyAnswers,
      sessions: { started: sessionsStarted, bridged: sessionsBridged },
      lastDialedAt: campaign.lastDialedAt,
    };
  }

  async listAttempts(
    tenantId: string,
    campaignId: string,
    paging: { limit: number; offset: number },
  ) {
    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    const [total, rows] = await Promise.all([
      this.prisma.dialerAttempt.count({ where: { campaignId } }),
      this.prisma.dialerAttempt.findMany({
        where: { campaignId },
        orderBy: { createdAt: "desc" },
        take: paging.limit,
        skip: paging.offset,
        select: {
          id: true,
          phoneE164: true,
          attemptNo: true,
          kind: true,
          outcome: true,
          language: true,
          callId: true,
          createdAt: true,
        },
      }),
    ]);
    return { total, attempts: rows };
  }

  async results(tenantId: string, campaignId: string): Promise<DialerResults> {
    const campaign = await this.prisma.dialerCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");

    const [questions, answerCounts, transferCount, transfers] = await Promise.all([
      this.prisma.dialerQuestion.findMany({
        where: { campaignId },
        orderBy: { orderIndex: "asc" },
        include: { answers: true },
      }),
      this.prisma.dialerSurveyResult.groupBy({
        by: ["questionKey", "answerDigit"],
        where: { campaignId },
        _count: { _all: true },
      }),
      this.prisma.dialerRedirect.count({ where: { campaignId } }),
      this.prisma.dialerRedirect.findMany({
        where: { campaignId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          targetNumber: true,
          targetName: true,
          targetParty: true,
          electorate: true,
          phoneNumber: true,
          createdAt: true,
        },
      }),
    ]);

    const countFor = (key: string, digit: string) =>
      answerCounts.find((c) => c.questionKey === key && c.answerDigit === digit)?._count._all ?? 0;

    return {
      questions: questions.map((question) => {
        const answers = question.answers
          .slice()
          .sort((a, b) => a.digit.localeCompare(b.digit))
          .map((answer) => ({
            digit: answer.digit,
            value: answer.value,
            count: countFor(question.key, answer.digit),
            dispositionCode: answer.dispositionCode,
            supportLevel: (answer.supportLevel as string | null) ?? null,
          }));
        return {
          key: question.key,
          name: question.name,
          total: answers.reduce((sum, a) => sum + a.count, 0),
          answers,
        };
      }),
      transferCount,
      transfers,
    };
  }

  /** ANSWERED over decided (terminal minus CANCELED) attempts. */
  private connectRate(
    outcomes: Array<{ outcome: string; _count: { _all: number } }>,
  ): number | null {
    const decided = outcomes
      .filter((o) => DECIDED_OUTCOMES.includes(o.outcome))
      .reduce((sum, o) => sum + o._count._all, 0);
    if (decided === 0) return null;
    const answered = outcomes.find((o) => o.outcome === "ANSWERED")?._count._all ?? 0;
    return Math.round((answered / decided) * 1000) / 10;
  }
}
