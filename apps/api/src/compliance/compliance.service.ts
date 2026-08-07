import { Injectable } from "@nestjs/common";
import { ConsentState } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The opt-out ledger: paginated entries + per-channel counts. `total` is the
   *  real row count (previously it was the fetched-page length, capped at 500) –
   *  summed from the per-channel groupBy, which already partitions exactly the
   *  same `where`, rather than paying for a second full count of the ledger. */
  async optOutLedger(tenantId: string, opts: { take?: number; skip?: number } = {}) {
    const rawTake = Number(opts.take);
    const take = Number.isFinite(rawTake) ? Math.min(Math.max(Math.trunc(rawTake), 1), 100) : 50;
    const rawSkip = Number(opts.skip);
    const skip = Number.isFinite(rawSkip) ? Math.max(Math.trunc(rawSkip), 0) : 0;
    const where = { tenantId, state: ConsentState.OPTED_OUT };
    const [optedOut, byChannel] = await Promise.all([
      this.prisma.contactConsent.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        select: { id: true, phoneE164: true, channel: true, source: true, updatedAt: true },
        take,
        skip,
      }),
      this.prisma.contactConsent.groupBy({
        by: ["channel"],
        where,
        _count: { _all: true },
      }),
    ]);
    const channels = byChannel.map((c) => ({ channel: c.channel, count: c._count._all }));
    return {
      total: channels.reduce((sum, c) => sum + c.count, 0),
      byChannel: channels,
      entries: optedOut,
    };
  }
}
