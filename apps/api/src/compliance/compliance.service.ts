import { Injectable } from "@nestjs/common";
import { ConsentState } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The opt-out ledger: every contact who has opted out, per channel, with the source. */
  async optOutLedger(tenantId: string) {
    const [optedOut, byChannel] = await Promise.all([
      this.prisma.contactConsent.findMany({
        where: { tenantId, state: ConsentState.OPTED_OUT },
        orderBy: { updatedAt: "desc" },
        select: { id: true, phoneE164: true, channel: true, source: true, updatedAt: true },
        take: 500,
      }),
      this.prisma.contactConsent.groupBy({
        by: ["channel"],
        where: { tenantId, state: ConsentState.OPTED_OUT },
        _count: { _all: true },
      }),
    ]);
    return {
      total: optedOut.length,
      byChannel: byChannel.map((c) => ({ channel: c.channel, count: c._count._all })),
      entries: optedOut,
    };
  }
}
