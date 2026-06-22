import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { AppUserRole } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { SessionService } from "../auth/session.service";
import { hashPassword } from "../auth/password.util";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  /** Organisation/workspace name for the new tenant. */
  orgName: string;
  /** Desired tenant slug (subdomain). */
  slug: string;
}

export interface RegistrationGrant {
  userId: string;
  tenantId: string;
  token: string;
  expiresAt: Date;
  memberships: { tenantId: string; tenantName: string; role: AppUserRole }[];
}

/**
 * Self-service sign-up (meld doc 12 / prog RegisterUser + CreateTenant onboarding). Creates the
 * User + their first Tenant + owner membership atomically, emits the iam.user.created /
 * tenant.tenant.created / tenant.member.added events (which drive the welcome-email reaction),
 * then issues a session pinned to the new tenant. The target of the auth app's /sign-up and the
 * marketing /sign-up redirect.
 */
@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly sessions: SessionService,
  ) {}

  async register(input: RegisterInput): Promise<RegistrationGrant> {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new BadRequestException("email is required");
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const slug = input.slug.trim().toLowerCase();
    if (!slug) throw new BadRequestException("slug is required");
    const orgName = input.orgName.trim();
    if (!orgName) throw new BadRequestException("orgName is required");

    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException("email_already_registered");
    }
    if (await this.prisma.tenant.findUnique({ where: { slug } })) {
      throw new ConflictException("slug_already_taken");
    }

    const passwordHash = await hashPassword(input.password);
    const displayName = input.displayName?.trim() || email;

    const { userId, tenantId } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, displayName, passwordHash, emailVerified: false },
      });
      const tenant = await tx.tenant.create({ data: { slug, name: orgName } });
      await tx.tenantMember.create({
        data: { tenantId: tenant.id, userId: user.id, role: AppUserRole.ORGANISER, addedBy: user.id },
      });
      await this.outbox.append(tx, {
        tenantId: tenant.id,
        eventType: "iam.user.created",
        aggregateId: user.id,
        payload: { userId: user.id, email: user.email, tenantId: tenant.id },
      });
      await this.outbox.append(tx, {
        tenantId: tenant.id,
        eventType: "tenant.tenant.created",
        aggregateId: tenant.id,
        payload: { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, networkId: null },
      });
      await this.outbox.append(tx, {
        tenantId: tenant.id,
        eventType: "tenant.member.added",
        aggregateId: tenant.id,
        payload: { tenantId: tenant.id, userId: user.id, role: AppUserRole.ORGANISER },
      });
      return { userId: user.id, tenantId: tenant.id };
    });

    const { token, expiresAt } = await this.sessions.create(userId, { tenantId });
    return {
      userId,
      tenantId,
      token,
      expiresAt,
      memberships: [{ tenantId, tenantName: orgName, role: AppUserRole.ORGANISER }],
    };
  }
}
