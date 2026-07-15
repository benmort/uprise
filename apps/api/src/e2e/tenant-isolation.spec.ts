import { ConfigService } from "@nestjs/config";
import { AudiencesService } from "../audiences/audiences.service";
import { ContactsService } from "../contacts/contacts.service";
import { CallsService } from "../calls/calls.service";
import { AnalyticsService } from "../analytics/analytics.service";

/**
 * Tenant-isolation regression guard for the DEFAULT_ORGANIZATION_SLUG removal sweep.
 * Services no longer resolve a fixed default org — every read/mutation must scope by the
 * tenantId passed in. These assert (a) list/read queries carry the caller's tenantId in the
 * Prisma WHERE, (b) a by-id read for a row owned by another tenant resolves to not-found
 * (the WHERE excludes it), and (c) by-id mutations verify tenant ownership before writing
 * (the archiveAudience/restoreAudience hole is closed).
 */
describe("tenant isolation (post default-org removal)", () => {
  const config = { get: (_k: string, d?: string) => d } as ConfigService;

  describe("AudiencesService", () => {
    it("scopes listAudiences to the caller's tenant", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = { audience: { findMany, count } } as any;
      const svc = new AudiencesService(prisma, config);

      await svc.listAudiences("tenant-a", {} as any);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0][0].where.tenantId).toBe("tenant-a");
      expect(count.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    });

    it("cannot read another tenant's audience by id (WHERE excludes it → not found)", async () => {
      // The row belongs to tenant-b; scoped findFirst with tenant-a returns null.
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = {
        audience: { findFirst },
        integrationSyncJob: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;
      const svc = new AudiencesService(prisma, config);

      await expect(svc.getAudience("tenant-a", "aud-owned-by-b")).rejects.toThrow();
      expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "aud-owned-by-b", tenantId: "tenant-a" });
    });

    it("archiveAudience verifies tenant ownership before mutating (hole closed)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null); // not owned by tenant-a
      const update = jest.fn();
      const prisma = { audience: { findFirst, update } } as any;
      const svc = new AudiencesService(prisma, config);

      await expect(svc.archiveAudience("tenant-a", "aud-owned-by-b")).rejects.toThrow();
      expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "aud-owned-by-b", tenantId: "tenant-a" });
      expect(update).not.toHaveBeenCalled(); // never blind-updates by bare id
    });
  });

  describe("ContactsService", () => {
    it("scopes contact search to the caller's tenant", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const prisma = { contact: { findMany } } as any;
      const svc = new ContactsService(prisma);

      await svc.search("tenant-a", "smith");

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0][0].where.tenantId).toBe("tenant-a");
    });

    it("cannot edit another tenant's contact by id (not found)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null); // owned by another tenant
      const update = jest.fn();
      const prisma = { contact: { findFirst, update } } as any;
      const svc = new ContactsService(prisma);

      await expect(svc.updateContact("tenant-a", "contact-owned-by-b", { firstName: "X" })).rejects.toThrow();
      expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "contact-owned-by-b", tenantId: "tenant-a" });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("AnalyticsService", () => {
    it("cannot read another tenant's blast analytics by id (blast ownership enforced)", async () => {
      const findFirst = jest.fn().mockResolvedValue(null); // blast not owned by tenant-a
      const count = jest.fn().mockResolvedValue(0);
      const prisma = { blast: { findFirst }, blastRecipient: { count } } as any;
      const svc = new AnalyticsService(prisma);

      await expect(svc.kpiSummary("tenant-a", "blast-owned-by-b")).rejects.toThrow();
      expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "blast-owned-by-b", tenantId: "tenant-a" });
      expect(count).not.toHaveBeenCalled(); // bailed before touching recipient rows
    });
  });

  describe("CallsService", () => {
    it("scopes listCalls + getCall to the caller's tenant", async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const findFirst = jest.fn().mockResolvedValue(null);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        call: { findMany, findFirst, count },
        $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
      } as any;
      const svc = new CallsService(prisma, config, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

      await svc.listCalls("tenant-a");
      expect(findMany.mock.calls[0][0].where.tenantId).toBe("tenant-a");

      await expect(svc.getCall("tenant-a", "call-owned-by-b")).rejects.toThrow();
      expect(findFirst.mock.calls[0][0].where).toMatchObject({ id: "call-owned-by-b", tenantId: "tenant-a" });
    });
  });
});
