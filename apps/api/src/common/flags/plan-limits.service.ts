import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../../prisma/prisma.service";

/** Per-plan usage limits; a null member means unlimited. */
export interface PlanLimits {
  contacts: number | null;
  teamMembers: number | null;
  segments: number | null;
}

const UNLIMITED: PlanLimits = { contacts: null, teamMembers: null, segments: null };

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Resolves and enforces a tenant's plan limits. Limits live on the Plan keyed by
 * the tenant's `Network.planName` (tenant → network → plan → Plan.limits). A tenant
 * with no network, no plan, or an archived plan is unlimited — so existing tenants
 * stay unlimited until a plan is assigned (see meld plan: no-plan = unlimited).
 */
@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The limits in force for a tenant (all null = unlimited). */
  async resolveForTenant(tenantId: string | null | undefined): Promise<PlanLimits> {
    if (!tenantId) return { ...UNLIMITED };
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { networkId: true },
    });
    if (!tenant?.networkId) return { ...UNLIMITED };
    const network = await this.prisma.network.findUnique({
      where: { id: tenant.networkId },
      select: { planName: true },
    });
    if (!network?.planName) return { ...UNLIMITED };
    const plan = await this.prisma.plan.findUnique({
      where: { key: network.planName },
      select: { limits: true, archivedAt: true },
    });
    if (!plan || plan.archivedAt) return { ...UNLIMITED };
    const l = plan.limits as Record<string, unknown> | null;
    if (!l || typeof l !== "object") return { ...UNLIMITED };
    return {
      contacts: numOrNull(l.contacts),
      teamMembers: numOrNull(l.teamMembers),
      segments: numOrNull(l.segments),
    };
  }

  private teamLimitError(limit: number): ForbiddenException {
    return new ForbiddenException(
      `Your plan allows up to ${limit} team member${limit === 1 ? "" : "s"}. Upgrade your plan to add more.`,
    );
  }

  /**
   * Pre-write guard: throw PLAN_LIMIT (403) if the tenant is already at its team-member
   * limit. Use before opening the membership transaction. No tenant / unlimited → no-op.
   */
  async assertCanAddTeamMember(tenantId: string | null | undefined): Promise<void> {
    if (!tenantId) return;
    const { teamMembers } = await this.resolveForTenant(tenantId);
    if (teamMembers === null) return;
    const current = await this.prisma.tenantMember.count({ where: { tenantId } });
    if (current >= teamMembers) throw this.teamLimitError(teamMembers);
  }

  /**
   * In-transaction variant: count seats on the passed tx so the check is consistent
   * with an in-flight membership write. Call only when adding a genuinely new member.
   */
  async assertTeamSeatAvailable(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const { teamMembers } = await this.resolveForTenant(tenantId);
    if (teamMembers === null) return;
    const current = await tx.tenantMember.count({ where: { tenantId } });
    if (current >= teamMembers) throw this.teamLimitError(teamMembers);
  }

  /**
   * Remaining contact headroom for a tenant (null = unlimited). The seam for capping
   * CSV imports; not yet wired into the (single-default-org, batched) import path.
   */
  async remainingContacts(tenantId: string | null | undefined): Promise<number | null> {
    if (!tenantId) return null;
    const { contacts } = await this.resolveForTenant(tenantId);
    if (contacts === null) return null;
    const current = await this.prisma.contact.count({ where: { tenantId } });
    return Math.max(0, contacts - current);
  }
}
