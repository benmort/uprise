import { ForbiddenException } from "@nestjs/common";
import { PlanLimitsService } from "./plan-limits.service";
import type { PrismaService } from "../../prisma/prisma.service";

/**
 * Minimal Prisma stub: a tenant on a network on a plan with the given limits.
 * `defaultPlan` is the row `findFirst({ isDefault: true })` returns — the baseline a tenant
 * falls back to when it has no network, no plan, or a missing/archived one.
 */
function makePrisma(opts: {
  networkId?: string | null;
  planName?: string | null;
  plan?: { limits: unknown; archivedAt: Date | null } | null;
  defaultPlan?: { limits: unknown; archivedAt: Date | null } | null;
  memberCount?: number;
  contactCount?: number;
}) {
  return {
    tenant: { findUnique: jest.fn().mockResolvedValue({ networkId: opts.networkId ?? null }) },
    network: { findUnique: jest.fn().mockResolvedValue({ planName: opts.planName ?? null }) },
    plan: {
      findUnique: jest.fn().mockResolvedValue(opts.plan ?? null),
      findFirst: jest.fn().mockResolvedValue(opts.defaultPlan ?? null),
    },
    tenantMember: { count: jest.fn().mockResolvedValue(opts.memberCount ?? 0) },
    contact: { count: jest.fn().mockResolvedValue(opts.contactCount ?? 0) },
  } as unknown as PrismaService;
}

const planWith = (limits: unknown) => ({ limits, archivedAt: null });
const UNLIMITED = { contacts: null, teamMembers: null, segments: null };
/** Stands in for Growth, which carries isDefault in the seed. */
const GROWTH = planWith({ contacts: 25000, teamMembers: 10, segments: 20 });

describe("PlanLimitsService", () => {
  describe("resolveForTenant", () => {
    it("is unlimited with no tenant", async () => {
      const svc = new PlanLimitsService(makePrisma({ defaultPlan: GROWTH }));
      expect(await svc.resolveForTenant(null)).toEqual(UNLIMITED);
    });

    // The three no-plan routes below all used to return unlimited. They now resolve the
    // default plan, so entitlements and limits agree on what a plan-less tenant gets.
    it("falls back to the default plan when the tenant has no network", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: null, defaultPlan: GROWTH }));
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: 25000, teamMembers: 10, segments: 20 });
    });

    it("falls back to the default plan when the network has no plan name", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: "n1", planName: null, defaultPlan: GROWTH }));
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: 25000, teamMembers: 10, segments: 20 });
    });

    it("falls back to the default plan when the named plan is archived", async () => {
      const svc = new PlanLimitsService(
        makePrisma({
          networkId: "n1",
          planName: "starter",
          plan: { limits: { contacts: 10 }, archivedAt: new Date() },
          defaultPlan: GROWTH,
        }),
      );
      expect(await svc.resolveForTenant("t1")).toEqual({ contacts: 25000, teamMembers: 10, segments: 20 });
    });

    // The escape hatch: with nothing marked default the old behaviour stands, so a database
    // that hasn't run the plan migration can't accidentally cap everyone.
    it("stays unlimited when no plan is marked default", async () => {
      const svc = new PlanLimitsService(makePrisma({ networkId: "n1", planName: null, defaultPlan: null }));
      expect(await svc.resolveForTenant("t1")).toEqual(UNLIMITED);
    });

    it("prefers the tenant's own plan over the default", async () => {
      const svc = new PlanLimitsService(
        makePrisma({
          networkId: "n1",
          planName: "scale",
          plan: planWith({ contacts: 100000, teamMembers: 25, segments: null }),
          defaultPlan: GROWTH,
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
