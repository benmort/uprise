import { randomBytes } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AppUserRole,
  Network,
  Prisma,
  Tenant,
  TenantInvitation,
  TenantJoinRequest,
  TenantMember,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { PlanLimitsService } from "../common/flags/plan-limits.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Slug shape (prog parity): lowercase alphanumeric + hyphens, no leading/trailing hyphen. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Plan keys whose owning network may self-serve additional tenants from the in-app switcher.
 * Paid tiers only — the free "grassroots" plan and network-less tenants cannot. Super-admins
 * bypass this. Keep in sync with TENANT_CREATE_PLANS_UI in the admin tenant-switcher.
 */
export const TENANT_CREATE_PLANS = ["starter", "growth", "scale"] as const;

// Organiser getting-started steps. Kept in sync with ONBOARDING_STEP_KEYS in
// @uprise/contracts (the admin UI + api-client hold the canonical wire shape). Stored on
// Tenant.onboarding as an advisory JSON bag; steps merge monotonically (a completed step
// never regresses even if the underlying data is later removed).
const ONBOARDING_STEP_KEYS = [
  "verifyEmail",
  "orgProfile",
  "inviteTeammate",
  "connectAudience",
  "firstCampaign",
] as const;
type OnboardingStep = (typeof ONBOARDING_STEP_KEYS)[number];
export interface TenantOnboardingState {
  version: number;
  dismissed: boolean;
  steps: Record<OnboardingStep, boolean>;
  updatedAt: string | null;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  networkId?: string | null;
  ownerUserId?: string;
}

export interface CreateInvitationInput {
  // Exactly one of email / phone. Phone invites are delivered by SMS.
  email?: string;
  phone?: string;
  role: AppUserRole;
  invitedBy?: string;
}

/**
 * Tenant provisioning + membership/invitation admin (meld doc 12 / prog tenant domain).
 * Each write commits the row(s) + an outbox event in one transaction (doc 05), so the
 * cross-domain reactions (welcome/invitation email, network→Stripe customer) fire off the
 * event, not an inline call. uprise' TenantMember.role is AppUserRole (OWNER/ORGANISER/VOLUNTEER);
 * a tenant's creator is the OWNER (full tenant + billing role).
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private normaliseSlug(raw: string): string {
    return raw.trim().toLowerCase();
  }

  // ── Tenant ───────────────────────────────────────────────────────────
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const slug = this.normaliseSlug(input.slug);
    if (!slug) throw new BadRequestException("slug is required");
    if (!SLUG_RE.test(slug)) throw new BadRequestException("invalid_slug");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("name is required");
    if (await this.prisma.tenant.findUnique({ where: { slug } })) {
      throw new ConflictException("slug_already_taken");
    }
    if (input.networkId && !(await this.prisma.network.findUnique({ where: { id: input.networkId } }))) {
      throw new NotFoundException("network_not_found");
    }

    // The owner is added only if it's a real User row — the env super-admin
    // (id "env-admin", not in iam.User) creates tenants with no bootstrapped owner.
    const ownerUserId =
      input.ownerUserId && (await this.prisma.user.findUnique({ where: { id: input.ownerUserId } }))
        ? input.ownerUserId
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug, name, networkId: input.networkId ?? null },
      });
      await this.outbox.append(tx, {
        tenantId: tenant.id,
        eventType: "tenant.tenant.created",
        aggregateId: tenant.id,
        payload: { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, networkId: tenant.networkId },
      });
      if (ownerUserId) {
        await tx.tenantMember.create({
          data: {
            tenantId: tenant.id,
            userId: ownerUserId,
            role: AppUserRole.OWNER,
            addedBy: ownerUserId,
          },
        });
        await this.outbox.append(tx, {
          tenantId: tenant.id,
          eventType: "tenant.member.added",
          aggregateId: tenant.id,
          payload: { tenantId: tenant.id, userId: ownerUserId, role: AppUserRole.OWNER },
        });
      }
      return tenant;
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: { network: { select: { id: true, name: true, planName: true } } },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  async updateTenant(
    id: string,
    input: { name?: string; slug?: string; settings?: Record<string, unknown> },
  ): Promise<Tenant> {
    const current = await this.getTenant(id);
    const data: Prisma.TenantUpdateInput = {};
    let renamedTo: string | null = null;
    if (input.name !== undefined && input.name.trim()) {
      const name = input.name.trim();
      data.name = name;
      if (name !== current.name) renamedTo = name;
    }
    if (input.slug !== undefined) {
      const slug = this.normaliseSlug(input.slug);
      if (!SLUG_RE.test(slug)) throw new BadRequestException("invalid_slug");
      if (slug !== current.slug) {
        if (await this.prisma.tenant.findUnique({ where: { slug } })) {
          throw new ConflictException("slug_already_taken");
        }
        data.slug = slug;
      }
    }
    if (input.settings !== undefined) data.settings = input.settings as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({ where: { id }, data });
      if (renamedTo) {
        await this.outbox.append(tx, {
          tenantId: id,
          eventType: "tenant.tenant.renamed",
          aggregateId: id,
          payload: { tenantId: id, name: renamedTo },
        });
      }
      return updated;
    });
  }

  // ── Onboarding (organiser getting-started) ─────────────────────────────
  async getOnboarding(id: string): Promise<TenantOnboardingState> {
    const tenant = await this.getTenant(id);
    return this.normaliseOnboarding(tenant.onboarding);
  }

  /**
   * Merge an onboarding patch. Steps are OR-merged (monotonic — only ever flip to true);
   * `dismissed` replaces. No outbox event: this is low-stakes advisory UI state with no
   * cross-domain reaction, so a domain event would be ceremony (a deliberate divergence
   * from the outbox-atomic invariant).
   */
  async updateOnboarding(
    id: string,
    patch: { dismissed?: boolean; steps?: Partial<Record<OnboardingStep, boolean>> },
  ): Promise<TenantOnboardingState> {
    const tenant = await this.getTenant(id);
    const current = this.normaliseOnboarding(tenant.onboarding);
    const steps = { ...current.steps };
    if (patch.steps) {
      for (const key of ONBOARDING_STEP_KEYS) {
        if (patch.steps[key] === true) steps[key] = true;
      }
    }
    const next: TenantOnboardingState = {
      version: current.version,
      dismissed: patch.dismissed ?? current.dismissed,
      steps,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.tenant.update({
      where: { id },
      data: { onboarding: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  /** Coerce the free-form JSON column into the canonical shape (null → all-false). */
  private normaliseOnboarding(raw: unknown): TenantOnboardingState {
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const rawSteps =
      obj.steps && typeof obj.steps === "object" ? (obj.steps as Record<string, unknown>) : {};
    const steps = {} as Record<OnboardingStep, boolean>;
    for (const key of ONBOARDING_STEP_KEYS) steps[key] = rawSteps[key] === true;
    return {
      version: typeof obj.version === "number" ? obj.version : 1,
      dismissed: obj.dismissed === true,
      steps,
      updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : null,
    };
  }

  // ── Members ──────────────────────────────────────────────────────────
  async listMembers(tenantId: string) {
    await this.getTenant(tenantId);
    return this.prisma.tenantMember.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { email: true, displayName: true } } },
    });
  }

  /** Directly add an EXISTING user (by id or email) to a tenant. */
  async addMember(
    tenantId: string,
    input: { userId?: string; email?: string; role: AppUserRole; addedBy?: string },
  ): Promise<TenantMember> {
    await this.getTenant(tenantId);
    const user = input.userId
      ? await this.prisma.user.findUnique({ where: { id: input.userId } })
      : input.email
        ? await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } })
        : null;
    if (!user) throw new NotFoundException("User not found");

    const already = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (already) throw new ConflictException("already_member");

    // Plan limit: a new seat must fit the tenant's team-member allowance.
    await this.planLimits.assertCanAddTeamMember(tenantId);

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tenantMember.create({
        data: { tenantId, userId: user.id, role: input.role, addedBy: input.addedBy ?? null },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.member.added",
        aggregateId: tenantId,
        payload: { tenantId, userId: user.id, role: input.role },
      });
      return member;
    });
  }

  /** Guard: a tenant must keep at least one OWNER (the workspace owner). */
  private async assertNotLastOwner(tenantId: string, userId: string): Promise<void> {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (member?.role !== AppUserRole.OWNER) return;
    const owners = await this.prisma.tenantMember.count({
      where: { tenantId, role: AppUserRole.OWNER },
    });
    if (owners <= 1) throw new BadRequestException("Cannot remove or demote the last owner of a tenant");
  }

  async updateMemberRole(tenantId: string, userId: string, role: AppUserRole): Promise<TenantMember> {
    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) throw new NotFoundException("Membership not found");
    if (existing.role === AppUserRole.OWNER && role !== AppUserRole.OWNER) {
      await this.assertNotLastOwner(tenantId, userId);
    }
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tenantMember.update({
        where: { tenantId_userId: { tenantId, userId } },
        data: { role },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.member.role-updated",
        aggregateId: tenantId,
        payload: { tenantId, userId, role },
      });
      return member;
    });
  }

  async removeMember(tenantId: string, userId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) throw new NotFoundException("Membership not found");
    await this.assertNotLastOwner(tenantId, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMember.delete({ where: { tenantId_userId: { tenantId, userId } } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.member.removed",
        aggregateId: tenantId,
        payload: { tenantId, userId },
      });
    });
    return { ok: true };
  }

  /** Pre-flight slug check for the sign-up UI (prog IsSubdomainAvailable parity). */
  async isSlugAvailable(slug: string): Promise<{ slug: string; available: boolean }> {
    const norm = this.normaliseSlug(slug);
    if (!norm) return { slug: norm, available: false };
    const existing = await this.prisma.tenant.findUnique({ where: { slug: norm } });
    return { slug: norm, available: !existing };
  }

  /**
   * Public brand lookup by slug — the tenant's id + name for the volunteer auth panel
   * (the id seeds the same avatar gradient the admin tenant switcher uses). Returns null
   * for an unknown/blank slug; slugs are public (subdomains), so this reveals nothing new.
   */
  async tenantBrandBySlug(slug: string): Promise<{ id: string; name: string } | null> {
    const norm = this.normaliseSlug(slug);
    if (!norm) return null;
    return this.prisma.tenant.findFirst({
      where: { slug: norm, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  // ── Invitations (issuing; accept/preview live in IamFlowsService) ─────
  async createInvitation(
    tenantId: string,
    input: CreateInvitationInput,
  ): Promise<{ id: string; token: string }> {
    await this.getTenant(tenantId);
    const email = input.email?.trim().toLowerCase() || undefined;
    const phone = input.phone?.trim() || undefined;
    if ((email && phone) || (!email && !phone)) {
      throw new BadRequestException("Provide exactly one of email or phone");
    }
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      throw new BadRequestException("phone must be in international format, e.g. +61400000000");
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    // One pending invite per (tenant, channel-value): re-issue resets the token/expiry.
    const where = email
      ? { tenantId_email: { tenantId, email } }
      : { tenantId_phone: { tenantId, phone: phone as string } };

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.tenantInvitation.upsert({
        where,
        create: {
          tenantId,
          email: email ?? null,
          phone: phone ?? null,
          role: input.role,
          status: "pending",
          token,
          expiresAt,
          invitedBy: input.invitedBy ?? null,
        },
        update: { role: input.role, status: "pending", token, expiresAt, invitedBy: input.invitedBy ?? null },
      });
      // Reuse the existing catalogue event; the invitation reaction branches email/SMS.
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.invitation.sent",
        aggregateId: invitation.id,
        payload: { invitationId: invitation.id, tenantId, email: email ?? null, phone: phone ?? null },
      });
      return { id: invitation.id, token };
    });
  }

  async listInvitations(tenantId: string): Promise<TenantInvitation[]> {
    await this.getTenant(tenantId);
    return this.prisma.tenantInvitation.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  }

  /** Join requests for the admin approval queue (defaults to actionable "pending"). */
  async listJoinRequests(tenantId: string, status?: string): Promise<TenantJoinRequest[]> {
    await this.getTenant(tenantId);
    return this.prisma.tenantJoinRequest.findMany({
      where: { tenantId, status: status ?? "pending" },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeInvitation(tenantId: string, invitationId: string): Promise<{ ok: true }> {
    const invite = await this.prisma.tenantInvitation.findFirst({ where: { id: invitationId, tenantId } });
    if (!invite) throw new NotFoundException("Invitation not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantInvitation.update({ where: { id: invitationId }, data: { status: "revoked" } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.invitation.revoked",
        aggregateId: invitationId,
        payload: { invitationId, tenantId },
      });
    });
    return { ok: true };
  }

  // ── Network (billing boundary; triggers the Stripe-customer reaction) ─
  async createNetwork(input: { name: string; ownerId?: string }): Promise<Network> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException("name is required");
    return this.prisma.$transaction(async (tx) => {
      const network = await tx.network.create({ data: { name, ownerId: input.ownerId ?? null } });
      await this.outbox.append(tx, {
        tenantId: network.id, // no tenant yet; use the network id as the aggregate scope
        eventType: "tenant.network.created",
        aggregateId: network.id,
        payload: { networkId: network.id, name: network.name },
      });
      return network;
    });
  }

  async getNetwork(id: string): Promise<Network> {
    const network = await this.prisma.network.findUnique({ where: { id } });
    if (!network) throw new NotFoundException("Network not found");
    return network;
  }

  async listTenantsByNetwork(networkId: string): Promise<Tenant[]> {
    await this.getNetwork(networkId);
    return this.prisma.tenant.findMany({ where: { networkId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  }

  /** Super-admin search across ALL tenants (for the feature-flag override editor). */
  async searchTenants(q?: string) {
    const term = q?.trim();
    return this.prisma.tenant.findMany({
      where: {
        deletedAt: null,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: "insensitive" as const } },
                { slug: { contains: term, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { id: true, slug: true, name: true, networkId: true },
      orderBy: { name: "asc" },
      take: 50,
    });
  }

  /** Super-admin search across ALL networks (for the feature-flag override editor). */
  async searchNetworks(q?: string) {
    const term = q?.trim();
    return this.prisma.network.findMany({
      where: term ? { name: { contains: term, mode: "insensitive" as const } } : {},
      select: { id: true, name: true, planName: true },
      orderBy: { name: "asc" },
      take: 50,
    });
  }

  /** Write plan/status onto the Network (the billing boundary) — prog UpdateNetworkBilling. */
  async updateNetworkBilling(
    id: string,
    input: { planName?: string | null; subscriptionStatus?: string | null },
  ): Promise<Network> {
    await this.getNetwork(id);
    return this.prisma.network.update({
      where: { id },
      data: {
        ...(input.planName !== undefined ? { planName: input.planName } : {}),
        ...(input.subscriptionStatus !== undefined ? { subscriptionStatus: input.subscriptionStatus } : {}),
      },
    });
  }

  // ── Soft delete (prog DeleteTenant) ──────────────────────────────────
  async deleteTenant(id: string): Promise<{ ok: true }> {
    await this.getTenant(id); // 404s if already deleted
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.outbox.append(tx, {
        tenantId: id,
        eventType: "tenant.tenant.deleted",
        aggregateId: id,
        payload: { tenantId: id },
      });
    });
    return { ok: true };
  }
}
