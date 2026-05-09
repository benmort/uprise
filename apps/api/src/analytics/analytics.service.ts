import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus } from "../../src/generated/prisma";
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
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  async kpiSummary(blastId: string) {
    const [sent, delivered, responded, failed] = await Promise.all([
      this.prisma.blastRecipient.count({ where: { blastId, status: BlastRecipientStatus.SENT } }),
      this.prisma.blastRecipient.count({
        where: { blastId, status: BlastRecipientStatus.DELIVERED },
      }),
      this.prisma.blastRecipient.count({
        where: { blastId, status: BlastRecipientStatus.RESPONDED },
      }),
      this.prisma.blastRecipient.count({ where: { blastId, status: BlastRecipientStatus.FAILED } }),
    ]);
    return { sent, delivered, responded, failed };
  }

  async engagementTrend(blastId: string, minutes = 60) {
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: {
        blastId,
        bucketAt: { gte: since },
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

  async recipientActivity(blastId: string, limit = 50, offset = 0) {
    const [rows, total] = await Promise.all([
      this.prisma.blastRecipient.findMany({
        where: { blastId },
        orderBy: { updatedAt: "desc" },
        take: Math.min(Math.max(1, limit), 200),
        skip: offset,
      }),
      this.prisma.blastRecipient.count({ where: { blastId } }),
    ]);
    return { rows, total };
  }

  async statusDistribution(blastId: string) {
    return this.prisma.blastRecipient.groupBy({
      by: ["status"],
      where: { blastId },
      _count: true,
    });
  }

  async dashboardPerformance() {
    const org = await this.ensureOrganization();
    const [totalSent, totalResponded, activeDrafts] = await Promise.all([
      this.prisma.blastRecipient.count({
        where: { blast: { organizationId: org.id }, status: BlastRecipientStatus.SENT },
      }),
      this.prisma.blastRecipient.count({
        where: { blast: { organizationId: org.id }, status: BlastRecipientStatus.RESPONDED },
      }),
      this.prisma.blast.count({
        where: {
          organizationId: org.id,
          status: { in: ["DRAFTED", "PROOFED", "SCHEDULED"] },
        },
      }),
    ]);
    const responseRate = totalSent > 0 ? Number(((totalResponded / totalSent) * 100).toFixed(1)) : 0;
    return {
      totalSent,
      totalResponded,
      responseRate,
      activeDrafts,
    };
  }

  async recentBlasts(limit = 20) {
    const org = await this.ensureOrganization();
    return this.prisma.blast.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
      include: {
        _count: {
          select: { recipients: true },
        },
      },
    });
  }
}
