import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type TenantActivityDomain = {
  key: string;
  label: string;
  total: number;
  byStatus: Record<string, number>;
};
export type TenantActivityResponse = {
  at: string;
  tenantId: string;
  domains: TenantActivityDomain[];
};

/**
 * Per-tenant "queue health" derived from the domain tables — the honest tenant-scoped
 * counterpart to the global BullMQ/Redis stats. BullMQ counts can't be scoped per tenant
 * (one shared Redis, no tenantId on jobs, completed jobs discarded), so the real
 * per-tenant view aggregates the tenant's own async-work rows by status. Each table has
 * an @@index([tenantId, status|state]) so these GROUP BYs are cheap + historically complete.
 */
@Injectable()
export class TenantActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantActivity(tenantId: string): Promise<TenantActivityResponse> {
    if (!tenantId) return { at: new Date().toISOString(), tenantId: "", domains: [] };
    const [imports, blasts, syncs, journeys] = await Promise.all([
      this.prisma.audienceImport.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
      this.prisma.blast.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
      this.prisma.integrationSyncJob.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
      this.prisma.journeyEnrolment.groupBy({ by: ["state"], where: { tenantId }, _count: { _all: true } }),
    ]);
    const mk = (
      key: string,
      label: string,
      rows: Array<{ _count: { _all: number } }>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: (r: any) => string,
    ): TenantActivityDomain => {
      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        byStatus[get(r)] = r._count._all;
        total += r._count._all;
      }
      return { key, label, total, byStatus };
    };
    return {
      at: new Date().toISOString(),
      tenantId,
      domains: [
        mk("imports", "Audience imports", imports, (r) => r.status),
        mk("blasts", "Blasts", blasts, (r) => r.status),
        mk("syncs", "Integration syncs", syncs, (r) => r.status),
        mk("journeys", "Journey enrolments", journeys, (r) => r.state),
      ],
    };
  }
}
