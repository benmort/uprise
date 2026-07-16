import { randomBytes } from "crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../messaging/transactional-dispatcher";
import { RESERVED_APP_SUBDOMAINS } from "@uprise/domains";
import { verifyPassword } from "../auth/password.util";
import { BRAND_SELECT, brandFields, type TenantBrandFields } from "../common/brand";

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
  // Composed invite copy from the "Invite a volunteer" compose view. The accept link is
  // always injected (see `composeInviteBody`). Absent ⇒ the default copy. `subject` = email only.
  message?: string;
  subject?: string;
}

/**
 * Fold the accept link into a composed invite body: substitute a `{{invite_link}}` placeholder,
 * or append the link when the author didn't place one (so the link can never go missing). Returns
 * undefined for an empty/blank message so callers fall back to the default copy.
 */
function composeInviteBody(message: string | undefined, link: string): string | undefined {
  const trimmed = message?.trim();
  if (!trimmed) return undefined;
  if (/\{\{\s*invite_link\s*\}\}/.test(trimmed)) {
    return trimmed.replace(/\{\{\s*invite_link\s*\}\}/g, link);
  }
  return trimmed.includes(link) ? trimmed : `${trimmed}\n\n${link}`;
}

/**
 * Tenant provisioning + membership/invitation admin (meld doc 12 / prog tenant domain).
 * Each write commits the row(s) + an outbox event in one transaction (doc 05), so most
 * cross-domain reactions (welcome email, network→Stripe customer) fire off the event.
 * The invitation email/SMS is the exception: it's sent INLINE here (doc-14 pattern, like
 * magic-link/reset), because it's a critical onboarding message that must not depend on
 * the worker's reaction path being healthy. uprise' TenantMember.role is AppUserRole
 * (OWNER/ORGANISER/VOLUNTEER); a tenant's creator is the OWNER (full tenant + billing role).
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly planLimits: PlanLimitsService,
    @Inject(TRANSACTIONAL_DISPATCHER) private readonly dispatcher: TransactionalDispatcher,
    private readonly config: ConfigService,
  ) {}

  private normaliseSlug(raw: string): string {
    return raw.trim().toLowerCase();
  }

  // ── Tenant ───────────────────────────────────────────────────────────
  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const slug = this.normaliseSlug(input.slug);
    if (!slug) throw new BadRequestException("slug is required");
    if (!SLUG_RE.test(slug)) throw new BadRequestException("invalid_slug");
    // A slug becomes a routable `<slug>.<platform>` subdomain, so it must not collide
    // with a reserved app label (admin/auth/api/…) or the tenant host would be unreachable.
    if (RESERVED_APP_SUBDOMAINS.has(slug)) throw new BadRequestException("slug_reserved");
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
      if (RESERVED_APP_SUBDOMAINS.has(slug)) throw new BadRequestException("slug_reserved");
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
    // Reserved app labels can never be a tenant subdomain — report them as taken.
    if (RESERVED_APP_SUBDOMAINS.has(norm)) return { slug: norm, available: false };
    const existing = await this.prisma.tenant.findUnique({ where: { slug: norm } });
    return { slug: norm, available: !existing };
  }

  /**
   * Public brand lookup by slug — the tenant's id + name for the volunteer auth panel
   * (the id seeds the same avatar gradient the admin tenant switcher uses). Returns null
   * for an unknown/blank slug; slugs are public (subdomains), so this reveals nothing new.
   */
  async tenantBrandBySlug(slug: string): Promise<({ id: string; name: string } & TenantBrandFields) | null> {
    const norm = this.normaliseSlug(slug);
    if (!norm) return null;
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: norm, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!tenant) return null;
    // Brand lives on OrgProfile (a separate tenantId-keyed row) — the openJoinPreview pattern.
    const profile = await this.prisma.orgProfile.findFirst({
      where: { tenantId: tenant.id },
      select: BRAND_SELECT,
    });
    return { id: tenant.id, name: tenant.name, ...brandFields(profile) };
  }

  // ── Invitations (issuing; accept/preview live in IamFlowsService) ─────
  async createInvitation(
    tenantId: string,
    input: CreateInvitationInput,
  ): Promise<{ id: string; token: string }> {
    const tenant = await this.getTenant(tenantId);
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

    const result = await this.prisma.$transaction(async (tx) => {
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
      // Kept for audit/observability (doc 05); delivery is the inline send below, not a reaction.
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.invitation.sent",
        aggregateId: invitation.id,
        payload: { invitationId: invitation.id, tenantId, email: email ?? null, phone: phone ?? null },
      });
      return { id: invitation.id, token };
    });

    // Deliver the invite INLINE (doc-14), so it doesn't depend on the worker's reaction path
    // being healthy. Best-effort: a send failure leaves a FAILED Email row (audit) and
    // re-inviting re-issues the token & retries — it must not fail the request that already
    // created the invitation. Link shapes: email → /invite/<token>, SMS → /volunteer/invite/<token>.
    const authAppUrl = this.config
      .get<string>("AUTH_APP_URL", "http://localhost:3002")
      .replace(/\/+$/, "");
    try {
      if (phone && !email) {
        const smsLink = `${authAppUrl}/volunteer/invite/${result.token}`;
        await this.dispatcher.sendSms({
          tenantId,
          toPhone: phone,
          body:
            composeInviteBody(input.message, smsLink) ??
            `You're invited to join ${tenant.name} — tap to accept: ${smsLink}`,
          purpose: "invitation",
        });
      } else if (email) {
        const emailLink = `${authAppUrl}/invite/${result.token}`;
        const composed = composeInviteBody(input.message, emailLink);
        if (composed) {
          // Composed invite from the compose view: send the author's copy verbatim through the
          // generic "newsletter" passthrough template (subject/body are its only vars).
          await this.dispatcher.sendEmail({
            tenantId,
            toAddress: email,
            templateKey: "newsletter",
            vars: { subject: input.subject?.trim() || `You're invited to join ${tenant.name}`, body: composed },
            purpose: "invitation",
          });
          return result;
        }
        // Pre-format the role + expiry into the {{vars}} the template interpolates (the engine is
        // a plain {{key}} substitution with no conditionals, so the suffixes are built here).
        const roleLabel = input.role.charAt(0) + input.role.slice(1).toLowerCase(); // VOLUNTEER → Volunteer
        const roleSuffix = ` as ${/^[aeiou]/i.test(roleLabel) ? "an" : "a"} ${roleLabel}`;
        const expiryHuman = expiresAt.toLocaleString("en-AU", {
          timeZone: "Australia/Sydney",
          weekday: "long",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
        await this.dispatcher.sendEmail({
          tenantId,
          toAddress: email,
          templateKey: "invitation",
          vars: {
            link: `${authAppUrl}/invite/${result.token}`,
            tenant: tenant.name,
            roleSuffix,
            expiryNote: `This invitation expires on ${expiryHuman}.`,
            expirySuffix: `\n\nThis invitation expires on ${expiryHuman}.`,
          },
          purpose: "invitation",
        });
      }
    } catch {
      // Swallow: EmailService/dispatcher already records the failed send; the invite row stands.
    }
    return result;
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

  /** Super-admin search across ALL tenants (for the feature-flag override editor + switcher list). */
  async searchTenants(q?: string) {
    const term = q?.trim();
    const tenants = await this.prisma.tenant.findMany({
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
    // Batch the logos in one query (the openJoinList pattern) so the switcher list can render them.
    const profiles = await this.prisma.orgProfile.findMany({
      where: { tenantId: { in: tenants.map((t) => t.id) } },
      select: { tenantId: true, logoLandscapeUrl: true, logoBlockUrl: true },
    });
    const logoByTenant = new Map(profiles.map((p) => [p.tenantId, p]));
    return tenants.map((t) => {
      const p = logoByTenant.get(t.id);
      return { ...t, logoLandscapeUrl: p?.logoLandscapeUrl ?? null, logoBlockUrl: p?.logoBlockUrl ?? null };
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

  /**
   * Self-serve soft-delete of the caller's ACTIVE workspace — the tenant twin of account deletion.
   *
   * Acts only on `tenantId` from the session, never an id from the request body, so an owner can
   * delete the workspace they are in and no other. `@Roles(OWNER)` on the route already required
   * ownership of the active tenant; we re-confirm the OWNER membership here (a stale token must not
   * outlive a role change) and re-verify the password, exactly as account deletion does. The delete
   * is soft (sets `deletedAt`, emits `tenant.tenant.deleted`) and therefore recoverable.
   */
  async selfServeDelete(
    userId: string,
    tenantId: string | null,
    password: string,
  ): Promise<{ ok: true; nextTenantId: string | null }> {
    if (!tenantId) throw new BadRequestException("No active workspace to delete");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || !(await verifyPassword(password ?? "", user.passwordHash))) {
      throw new BadRequestException("Password is incorrect");
    }
    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership || membership.role !== AppUserRole.OWNER) {
      throw new ForbiddenException("Only an owner of this workspace can delete it");
    }
    await this.deleteTenant(tenantId);
    // Where the owner goes next: another live workspace they administer, so the UI can switch them
    // there rather than signing them out. Null → they administer nowhere else and must re-auth.
    const other = await this.prisma.tenantMember.findFirst({
      where: {
        userId,
        tenantId: { not: tenantId },
        role: { in: [AppUserRole.OWNER, AppUserRole.ORGANISER] },
        tenant: { deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: { tenantId: true },
    });
    return { ok: true, nextTenantId: other?.tenantId ?? null };
  }
}
