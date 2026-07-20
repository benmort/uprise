import { Injectable, NotFoundException } from "@nestjs/common";
import { BlastRecipientStatus, MessageChannel, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { toUtcMinuteBucket } from "../common/utils/date.utils";
import { sanitiseVitals } from "./vitals.util";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A spreadable `{ channel }` fragment when a valid channel is given, else `{}`. */
  private channelFilter(channel?: string | null): { channel?: MessageChannel } {
    if (channel === MessageChannel.SMS || channel === MessageChannel.WHATSAPP) {
      return { channel: channel as MessageChannel };
    }
    return {};
  }

  /** Tenant-scope a blast-analytics read: confirm the blast belongs to the caller's tenant
   *  before returning its recipient/snapshot data (the rows themselves are keyed by blastId,
   *  so without this a caller could read another tenant's blast analytics by id). */
  private async assertBlast(tenantId: string, blastId: string): Promise<void> {
    const blast = await this.prisma.blast.findFirst({ where: { id: blastId, tenantId }, select: { id: true } });
    if (!blast) throw new NotFoundException("Blast not found");
  }

  async kpiSummary(tenantId: string, blastId: string, channel?: string | null) {
    await this.assertBlast(tenantId, blastId);
    const ch = this.channelFilter(channel);
    const [totalContacted, sent, delivered, responded, failed] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: {
          blastId,
          ...ch,
          status: {
            in: [
              BlastRecipientStatus.SENT,
              BlastRecipientStatus.DELIVERED,
              BlastRecipientStatus.RESPONDED,
              BlastRecipientStatus.FAILED,
            ],
          },
        },
      }),
      this.prisma.blastRecipient.count({ where: { blastId, ...ch, status: BlastRecipientStatus.SENT } }),
      this.prisma.blastRecipient.count({
        where: { blastId, ...ch, deliveredAt: { not: null } },
      }),
      this.prisma.blastRecipient.count({
        where: { blastId, ...ch, status: BlastRecipientStatus.RESPONDED },
      }),
      this.prisma.blastRecipient.count({ where: { blastId, ...ch, status: BlastRecipientStatus.FAILED } }),
    ]);
    return { totalContacted, sent, delivered, responded, failed };
  }

  async engagementTrend(tenantId: string, blastId: string, minutes?: number | null) {
    await this.assertBlast(tenantId, blastId);
    const useTimeWindow = typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0;
    const since = useTimeWindow ? new Date(Date.now() - minutes * 60 * 1000) : null;
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        blastId,
        ...(since ? { bucketAt: { gte: since } } : {}),
      },
      orderBy: { bucketAt: "asc" },
    });
    const map = new Map<string, { sent: number; responses: number }>();
    for (const item of snapshots) {
      const bucket = toUtcMinuteBucket(item.bucketAt);
      const current = map.get(bucket) || { sent: 0, responses: 0 };
      if (item.metricName === "sent") current.sent += item.metricValue;
      if (item.metricName === "responded") current.responses += item.metricValue;
      map.set(bucket, current);
    }
    return Array.from(map.entries()).map(([bucket, value]) => ({
      bucket,
      ...value,
    }));
  }

  async recipientActivity(tenantId: string, blastId: string, limit = 50, offset = 0, channel?: string | null) {
    await this.assertBlast(tenantId, blastId);
    const ch = this.channelFilter(channel);
    const [rows, total] = await Promise.all([
      this.prisma.blastRecipient.findMany({
        where: { blastId, ...ch },
        orderBy: { updatedAt: "desc" },
        take: Math.min(Math.max(1, limit), 200),
        skip: offset,
      }),
      this.prisma.blastRecipient.count({ where: { blastId, ...ch } }),
    ]);
    return { rows, total };
  }

  async statusDistribution(tenantId: string, blastId: string, channel?: string | null) {
    await this.assertBlast(tenantId, blastId);
    return this.prisma.blastRecipient.groupBy({
      by: ["status"],
      where: { blastId, ...this.channelFilter(channel) },
      _count: true,
    });
  }

  async dashboardPerformance(tenantId: string, channel?: string | null) {
    const ch = this.channelFilter(channel);
    const [totalContacted, totalSent, totalResponded, activeDrafts] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: {
          blast: { tenantId },
          ...ch,
          status: {
            in: [
              BlastRecipientStatus.SENT,
              BlastRecipientStatus.DELIVERED,
              BlastRecipientStatus.RESPONDED,
              BlastRecipientStatus.FAILED,
            ],
          },
        },
      }),
      this.prisma.blastRecipient.count({
        where: { blast: { tenantId }, ...ch, status: BlastRecipientStatus.SENT },
      }),
      this.prisma.blastRecipient.count({
        where: { blast: { tenantId }, ...ch, status: BlastRecipientStatus.RESPONDED },
      }),
      this.prisma.blast.count({
        where: {
          tenantId,
          ...ch,
          status: { in: ["DRAFTED", "PROOFED", "SCHEDULED"] },
        },
      }),
    ]);
    const responseRate =
      totalContacted > 0 ? Number(((totalResponded / totalContacted) * 100).toFixed(1)) : 0;
    return {
      totalContacted,
      totalSent,
      totalResponded,
      responseRate,
      activeDrafts,
    };
  }

  async recentBlasts(tenantId: string, limit = 20, channel?: string | null) {
    const blasts = await this.prisma.blast.findMany({
      where: { tenantId, ...this.channelFilter(channel) },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });

    const blastIds = blasts.map((blast) => blast.id);
    if (blastIds.length === 0) return blasts;

    const recipientCounts = await this.prisma.blastRecipient.groupBy({
      by: ["blastId", "status"],
      where: {
        blastId: { in: blastIds },
        status: {
          in: [
            BlastRecipientStatus.SENT,
            BlastRecipientStatus.DELIVERED,
            BlastRecipientStatus.RESPONDED,
          ],
        },
      },
      _count: true,
    });

    const awaitingByBlastId = new Map<string, number>();
    for (const row of recipientCounts) {
      if (row.status === BlastRecipientStatus.RESPONDED) continue;
      const current = awaitingByBlastId.get(row.blastId) || 0;
      awaitingByBlastId.set(row.blastId, current + row._count);
    }

    return blasts.map((blast) => ({
      ...blast,
      awaitingResponseCount: awaitingByBlastId.get(blast.id) || 0,
    }));
  }

  /** Ingest a web-vitals beacon batch from the field/admin apps. Untrusted browser
   *  input — sanitiseVitals allowlists metric names/labels and clamps values; invalid
   *  entries are silently dropped (a beacon has no user to report an error to). */
  async recordVitals(tenantId: string, body: unknown) {
    const vitals = sanitiseVitals(body);
    if (vitals.length === 0) return { accepted: 0 };
    await this.prisma.analyticsSnapshot.createMany({
      data: vitals.map((v) => ({
        tenantId,
        metricName: v.metricName,
        metricValue: v.metricValue,
        labels: v.labels,
        bucketAt: new Date(),
      })),
    });
    return { accepted: vitals.length };
  }

  /** p50/p75/p95 per metric per route over the window — p75 is the web-vitals
   *  convention for "typical worst" real-user experience. */
  async vitalsSummary(tenantId: string, days = 7) {
    const window = Math.min(Math.max(1, Math.trunc(days)), 90);
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<
      Array<{ metricName: string; route: string; samples: number; p50: number; p75: number; p95: number }>
    >(Prisma.sql`
      SELECT "metricName",
             COALESCE("labels"->>'route', '/') AS route,
             COUNT(*)::int AS samples,
             percentile_cont(0.5)  WITHIN GROUP (ORDER BY "metricValue") AS p50,
             percentile_cont(0.75) WITHIN GROUP (ORDER BY "metricValue") AS p75,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "metricValue") AS p95
      FROM "analytics"."AnalyticsSnapshot"
      WHERE "tenantId" = ${tenantId}
        AND "metricName" LIKE 'webvital.%'
        AND "bucketAt" >= ${since}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);
    return { days: window, since, rows };
  }
}
