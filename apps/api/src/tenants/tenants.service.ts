import { randomBytes } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppUserRole, Network, Prisma, Tenant, TenantInvitation, TenantMember } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    const name = input.name.trim();
    if (!name) throw new BadRequestException("name is required");
    if (await this.prisma.tenant.findUnique({ where: { slug } })) {
      throw new ConflictException("slug_already_taken");
    }
    if (input.networkId && !(await this.prisma.network.findUnique({ where: { id: input.networkId } }))) {
      throw new NotFoundException("network_not_found");
    }

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
      if (input.ownerUserId) {
        await tx.tenantMember.create({
          data: {
            tenantId: tenant.id,
            userId: input.ownerUserId,
            role: AppUserRole.ORGANISER,
            addedBy: input.ownerUserId,
          },
        });
        await this.outbox.append(tx, {
          tenantId: tenant.id,
          eventType: "tenant.member.added",
          aggregateId: tenant.id,
          payload: { tenantId: tenant.id, userId: input.ownerUserId, role: AppUserRole.ORGANISER },
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

  async updateTenant(id: string, input: { name?: string; settings?: Prisma.InputJsonValue }): Promise<Tenant> {
    await this.getTenant(id);
    const data: Prisma.TenantUpdateInput = {};
    if (input.name !== undefined && input.name.trim()) data.name = input.name.trim();
    if (input.settings !== undefined) data.settings = input.settings;
    return this.prisma.tenant.update({ where: { id }, data });
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

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: input.role, addedBy: input.addedBy ?? null },
        update: { role: input.role },
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

  async updateMemberRole(tenantId: string, userId: string, role: AppUserRole): Promise<TenantMember> {
    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) throw new NotFoundException("Membership not found");
    return this.prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { role },
    });
  }

  async removeMember(tenantId: string, userId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!existing) throw new NotFoundException("Membership not found");
    await this.prisma.tenantMember.delete({ where: { tenantId_userId: { tenantId, userId } } });
    return { ok: true };
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

  async revokeInvitation(tenantId: string, invitationId: string): Promise<{ ok: true }> {
    const invite = await this.prisma.tenantInvitation.findFirst({ where: { id: invitationId, tenantId } });
    if (!invite) throw new NotFoundException("Invitation not found");
    await this.prisma.tenantInvitation.update({ where: { id: invitationId }, data: { status: "declined" } });
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
}
