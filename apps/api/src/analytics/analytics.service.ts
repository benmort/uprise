import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus, MessageChannel } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { toUtcMinuteBucket } from "../common/utils/date.utils";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  /** A spreadable `{ channel }` fragment when a valid channel is given, else `{}`. */
  private channelFilter(channel?: string | null): { channel?: MessageChannel } {
    if (channel === MessageChannel.SMS || channel === MessageChannel.WHATSAPP) {
      return { channel: channel as MessageChannel };
    }
    return {};
  }

  async kpiSummary(blastId: string, channel?: string | null) {
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

  async engagementTrend(blastId: string, minutes?: number | null) {
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

  async recipientActivity(blastId: string, limit = 50, offset = 0, channel?: string | null) {
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

  async statusDistribution(blastId: string, channel?: string | null) {
    return this.prisma.blastRecipient.groupBy({
      by: ["status"],
      where: { blastId, ...this.channelFilter(channel) },
      _count: true,
    });
  }

  async dashboardPerformance(channel?: string | null) {
    const org = await this.ensureOrganization();
    const ch = this.channelFilter(channel);
    const [totalContacted, totalSent, totalResponded, activeDrafts] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: {
          blast: { tenantId: org.id },
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
        where: { blast: { tenantId: org.id }, ...ch, status: BlastRecipientStatus.SENT },
      }),
      this.prisma.blastRecipient.count({
        where: { blast: { tenantId: org.id }, ...ch, status: BlastRecipientStatus.RESPONDED },
      }),
      this.prisma.blast.count({
        where: {
          tenantId: org.id,
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

  async recentBlasts(limit = 20, channel?: string | null) {
    const org = await this.ensureOrganization();
    const blasts = await this.prisma.blast.findMany({
      where: { tenantId: org.id, ...this.channelFilter(channel) },
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
}
