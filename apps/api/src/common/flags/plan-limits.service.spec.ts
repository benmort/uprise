import { ForbiddenException } from "@nestjs/common";
import { PlanLimitsService } from "./plan-limits.service";
import type { PrismaService } from "../../prisma/prisma.service";

/** Minimal Prisma stub: a tenant on a network on a plan with the given limits. */
function makePrisma(opts: {
  networkId?: string | null;
  planName?: string | null;
  plan?: { limits: unknown; archivedAt: Date | null } | null;
  memberCount?: number;
  contactCount?: number;
}) {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: opts.networkId ?? null }) },
    network: { findUnique: jest.fn().mockResolvedValue({ planName: opts.planName ?? null }) },
    plan: { findUnique: jest.fn().mockResolvedValue(opts.plan ?? null) },
    tenantMember: { count: jest.fn().mockResolvedValue(opts.memberCount ?? 0) },
    contact: { count: jest.fn().mockResolvedValue(opts.contactCount ?? 0) },
  } as unknown as PrismaService;
}

const planWith = (limits: unknown) => ({ limits, archivedAt: null });

describe("PlanLimitsService", () => {
  describe("resolveForTenant", () => {
    it("is unlimited with no tenant", async () => {
      const svc = new PlanLimitsService(makePrisma({}));
      expect(await svc.resolveForTenant(null)).toEqual({ contacts: null, teamMembers: null, segments: null });
    });

    it("is unlimited when the tenant has no network", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: null }));
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: null, teamMembers: null, segments: null });
    });

    it("is unlimited when the network has no plan name", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: "n1", planName: null }));
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: null, teamMembers: null, segments: null });
    });

    it("is unlimited when the plan is archived", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: { limits: { contacts: 10 }, archivedAt: new Date() } }),
      );
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: null, teamMembers: null, segments: null });
    });

    it("returns the plan limits, treating a null member as unlimited", async () => {
      const svc = new PlanLimitsService(
        makePrisma({
          networkId: "n1",
          planName: "scale",
          plan: planWith({ contacts: 100000, teamMembers: 25, segments: null }),
        }),
      );
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: 100000, teamMembers: 25, segments: null });
    });
  });

  describe("assertCanAddTeamMember", () => {
    it("no-ops on an unlimited plan", async () => {
      const prisma = makePrisma({ networkId: "n1", planName: "scale", plan: planWith({ teamMembers: null }) });
      const svc = new PlanLimitsService(prisma);
      await expect(svc.assertCanAddTeamMember("t1")).resolves.toBeUndefined();
      expect(prisma.tenantMember.count).not.toHaveBeenCalled();
    });

    it("allows a seat below the limit", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: planWith({ teamMembers: 3 }), memberCount: 2 }),
      );
      await expect(svc.assertCanAddTeamMember("t1")).resolves.toBeUndefined();
    });

    it("throws PLAN_LIMIT at the limit", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: planWith({ teamMembers: 3 }), memberCount: 3 }),
      );
      await expect(svc.assertCanAddTeamMember("t1")).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("assertTeamSeatAvailable", () => {
    it("counts on the passed transaction and throws at the limit", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: planWith({ teamMembers: 3 }) }),
      );
      const tx = { tenantMember: { count: jest.fn().mockResolvedValue(3) } } as never;
      await expect(svc.assertTeamSeatAvailable(tx, "t1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("permits a seat under the limit", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "growth", plan: planWith({ teamMembers: 10 }) }),
      );
      const tx = { tenantMember: { count: jest.fn().mockResolvedValue(9) } } as never;
      await expect(svc.assertTeamSeatAvailable(tx, "t1")).resolves.toBeUndefined();
    });
  });

  describe("remainingContacts", () => {
    it("is null (unlimited) when the plan has no contact limit", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: "n1", planName: "scale", plan: planWith({ contacts: null }) }));
      expect(await svc.remainingContacts("t1")).toBeNull();
    });

    it("returns the remaining headroom", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: planWith({ contacts: 5000 }), contactCount: 4990 }),
      );
      expect(await svc.remainingContacts("t1")).toBe(10);
    });

    it("never goes negative when already over", async () => {
      const svc = new PlanLimitsService(
        makePrisma({ networkId: "n1", planName: "starter", plan: planWith({ contacts: 5000 }), contactCount: 6000 }),
      );
      expect(await svc.remainingContacts("t1")).toBe(0);
    });
  });
});
