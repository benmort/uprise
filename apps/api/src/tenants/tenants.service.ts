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
} from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Slug shape (prog parity): lowercase alphanumeric + hyphens, no leading/trailing hyphen. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface CreateTenantInput {
  slug: string;
  name: string;
  networkId?: string | null;
  ownerUserId?: string;
}

export interface CreateInvitationInput {
  email: string;
  role: AppUserRole;
  invitedBy?: string;
}

/**
 * Tenant provisioning + membership/invitation admin (meld doc 12 / prog tenant domain).
 * Each write commits the row(s) + an outbox event in one transaction (doc 05), so the
 * cross-domain reactions (welcome/invitation email, network→Stripe customer) fire off the
 * event, not an inline call. yarns' TenantMember.role is AppUserRole (ORGANISER/CANVASSER);
 * a tenant owner is an ORGANISER.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
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
            role: AppUserRole.ORGANISER,
            addedBy: ownerUserId,
          },
        });
        await this.outbox.append(tx, {
          tenantId: tenant.id,
          eventType: "tenant.member.added",
          aggregateId: tenant.id,
          payload: { tenantId: tenant.id, userId: ownerUserId, role: AppUserRole.ORGANISER },
        });
      }
      return tenant;
    });
  }

  async getTenant(id: string): Promise<Tenant> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) throw new NotFoundException("Tenant not found");
    return tenant;
  }

  async updateTenant(
    id: string,
    input: { name?: string; slug?: string; settings?: Prisma.InputJsonValue },
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
    if (input.settings !== undefined) data.settings = input.settings;
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

  // ── Members ──────────────────────────────────────────────────────────
  async listMembers(tenantId: string): Promise<TenantMember[]> {
    await this.getTenant(tenantId);
    return this.prisma.tenantMember.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
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

  /** Guard: a tenant must keep at least one ORGANISER (owner-equivalent). */
  private async assertNotLastOrganiser(tenantId: string, userId: string): Promise<void> {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (member?.role !== AppUserRole.ORGANISER) return;
    const organisers = await this.prisma.tenantMember.count({
      where: { tenantId, role: AppUserRole.ORGANISER },
    });
    if (organisers <= 1) throw new BadRequestException("Cannot remove or demote the last organiser of a tenant");
  }

  async updateMemberRole(tenantId: string, userId: string, role: AppUserRole): Promise<TenantMember> {
    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) throw new NotFoundException("Membership not found");
    if (existing.role === AppUserRole.ORGANISER && role !== AppUserRole.ORGANISER) {
      await this.assertNotLastOrganiser(tenantId, userId);
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
    await this.assertNotLastOrganiser(tenantId, userId);
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

  // ── Invitations (issuing; accept/preview live in IamFlowsService) ─────
  async createInvitation(
    tenantId: string,
    input: CreateInvitationInput,
  ): Promise<{ id: string; token: string }> {
    await this.getTenant(tenantId);
    const email = input.email.trim().toLowerCase();
    if (!email) throw new BadRequestException("email is required");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    return this.prisma.$transaction(async (tx) => {
      // One pending invite per (tenant, email): re-issue resets the token/expiry.
      const invitation = await tx.tenantInvitation.upsert({
        where: { tenantId_email: { tenantId, email } },
        create: {
          tenantId,
          email,
          role: input.role,
          status: "pending",
          token,
          expiresAt,
          invitedBy: input.invitedBy ?? null,
        },
        update: { role: input.role, status: "pending", token, expiresAt, invitedBy: input.invitedBy ?? null },
      });
      // Reuse the existing catalogue event; the invitation-email reaction fires off this.
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.invitation.sent",
        aggregateId: invitation.id,
        payload: { invitationId: invitation.id, tenantId, email },
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
