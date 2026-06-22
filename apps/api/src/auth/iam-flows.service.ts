import { randomBytes, randomInt } from "crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "./session.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../messaging/transactional-dispatcher";
import { hashPassword } from "./password.util";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const TWOFA_CODE_TTL_MS = 10 * 60 * 1000;

export interface Membership {
  tenantId: string;
  tenantName: string;
  role: AppUserRole;
}

export interface SessionGrant {
  userId: string;
  token: string;
  expiresAt: Date;
  memberships: Membership[];
}

/**
 * IAM auth flows (meld doc 14) — magic-link, password reset, email verification,
 * SMS 2FA, invitation acceptance, tenant selection. Each issuance sends via the
 * TRANSACTIONAL_DISPATCHER seam (consent-exempt, doc 06) using the existing email
 * templates (magic_link/recovery/verification) and SMS (purpose "2fa"). Tokens are
 * single-use; presence of an account is never leaked on request endpoints.
 */
@Injectable()
export class IamFlowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    @Inject(TRANSACTIONAL_DISPATCHER) private readonly dispatcher: TransactionalDispatcher,
    private readonly logger: DomainLogger,
  ) {}

  // ── shared helpers ──────────────────────────────────────────────────
  private newToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  private authAppUrl(): string {
    return this.config.get<string>("AUTH_APP_URL", "http://localhost:3002").replace(/\/+$/, "");
  }

  private link(path: string, token: string): string {
    return `${this.authAppUrl()}/${path}?token=${encodeURIComponent(token)}`;
  }

  async membershipsFor(userId: string): Promise<Membership[]> {
    const rows = await this.prisma.tenantMember.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { tenant: { select: { name: true } } },
    });
    return rows.map((m) => ({ tenantId: m.tenantId, tenantName: m.tenant.name, role: m.role }));
  }

  /** Tenant to attribute a transactional send to: the user's first membership, else the default org. */
  private async resolveTenantId(userId: string): Promise<string> {
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (membership) return membership.tenantId;
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    const org = await this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
    return org.id;
  }

  private async grantSession(userId: string): Promise<SessionGrant> {
    const { token, expiresAt } = await this.sessions.create(userId);
    return { userId, token, expiresAt, memberships: await this.membershipsFor(userId) };
  }

  // ── Magic link ──────────────────────────────────────────────────────
  /** Request a magic-link email. Always succeeds (never leaks account existence). */
  async requestMagicLink(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user) {
      const token = this.newToken();
      await this.prisma.magicLink.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
      });
      await this.dispatcher.sendEmail({
        tenantId: await this.resolveTenantId(user.id),
        toAddress: user.email,
        templateKey: "magic_link",
        vars: { link: this.link("magic-link", token) },
        purpose: "magic_link",
      });
    }
    return { ok: true };
  }

  async consumeMagicLink(token: string): Promise<SessionGrant> {
    const link = await this.prisma.magicLink.findUnique({ where: { token } });
    if (!link || link.consumedAt || link.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid or expired link");
    }
    await this.prisma.magicLink.update({ where: { id: link.id }, data: { consumedAt: new Date() } });
    return this.grantSession(link.userId);
  }

  // ── Password reset ──────────────────────────────────────────────────
  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user) {
      const token = this.newToken();
      await this.prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.dispatcher.sendEmail({
        tenantId: await this.resolveTenantId(user.id),
        toAddress: user.email,
        templateKey: "recovery",
        vars: { link: this.link("reset-password", token) },
        purpose: "password_reset",
      });
    }
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const reset = await this.prisma.passwordReset.findUnique({ where: { token } });
    if (!reset || reset.consumedAt || reset.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Invalid or expired reset token");
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { consumedAt: new Date() } }),
    ]);
    // A reset invalidates every existing session for that user.
    await this.sessions.revokeAllForUser(reset.userId);
    return { ok: true };
  }

  // ── Email verification (code) ───────────────────────────────────────
  async sendEmailVerification(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && !user.emailVerified) {
      const code = this.newCode();
      await this.prisma.mobileVerification.create({
        data: { userId: user.id, code, expiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS) },
      });
      await this.dispatcher.sendEmail({
        tenantId: await this.resolveTenantId(user.id),
        toAddress: user.email,
        templateKey: "verification",
        vars: { code },
        purpose: "email_verification",
      });
    }
    return { ok: true };
  }

  async confirmEmailVerification(email: string, code: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new BadRequestException("Invalid code");
    const record = await this.prisma.mobileVerification.findFirst({
      where: { userId: user.id, code, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new BadRequestException("Invalid or expired code");
    await this.prisma.$transaction([
      this.prisma.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } }),
      this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    ]);
    return { ok: true };
  }

  // ── SMS 2FA ─────────────────────────────────────────────────────────
  /** Start a 2FA challenge for a user (called by login when twofaEnabled). Returns the challenge id. */
  async start2fa(userId: string): Promise<{ challengeId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mobile) throw new BadRequestException("No mobile number on file for 2FA");
    const code = this.newCode();
    const record = await this.prisma.mobileVerification.create({
      data: { userId, code, expiresAt: new Date(Date.now() + TWOFA_CODE_TTL_MS) },
    });
    await this.dispatcher.sendSms({
      tenantId: await this.resolveTenantId(userId),
      toPhone: user.mobile,
      body: `Your verification code is ${code}`,
      purpose: "2fa",
    });
    return { challengeId: record.id };
  }

  /** Resend the code for an existing 2FA challenge. */
  async resend2fa(challengeId: string): Promise<{ challengeId: string }> {
    const existing = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!existing) throw new BadRequestException("Invalid challenge");
    return this.start2fa(existing.userId);
  }

  async verify2fa(challengeId: string, code: string): Promise<SessionGrant> {
    const record = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!record || record.verifiedAt || record.expiresAt.getTime() <= Date.now() || record.code !== code) {
      throw new BadRequestException("Invalid or expired code");
    }
    await this.prisma.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
    return this.grantSession(record.userId);
  }

  // ── Invitation ──────────────────────────────────────────────────────
  async previewInvite(token: string): Promise<{ email: string; tenantName: string; role: AppUserRole }> {
    const invite = await this.loadValidInvite(token);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: invite.tenantId } });
    return { email: invite.email, tenantName: tenant?.name ?? "", role: invite.role };
  }

  async acceptInvite(
    token: string,
    input: { displayName?: string; password?: string },
  ): Promise<SessionGrant> {
    const invite = await this.loadValidInvite(token);
    const email = invite.email.trim().toLowerCase();

    const grant = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        if (!input.password || input.password.length < 8) {
          throw new BadRequestException("Password must be at least 8 characters");
        }
        user = await tx.user.create({
          data: {
            email,
            displayName: input.displayName?.trim() || email,
            passwordHash: await hashPassword(input.password),
            emailVerified: true, // an invite to this address proves control of it
          },
        });
      }
      await tx.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
        create: { tenantId: invite.tenantId, userId: user.id, role: invite.role, addedBy: invite.invitedBy },
        update: {},
      });
      await tx.tenantInvitation.update({ where: { id: invite.id }, data: { status: "accepted" } });
      return user.id;
    });

    return this.grantSession(grant);
  }

  private async loadValidInvite(token: string) {
    const invite = await this.prisma.tenantInvitation.findUnique({ where: { token } });
    if (
      !invite ||
      invite.status !== "pending" ||
      (invite.expiresAt && invite.expiresAt.getTime() <= Date.now())
    ) {
      throw new BadRequestException("Invalid or expired invitation");
    }
    return invite;
  }

  // ── Tenant selection ────────────────────────────────────────────────
  /** Pin the active tenant on the caller's session. Requires a membership in that tenant. */
  async selectTenant(userId: string, sessionToken: string, tenantId: string): Promise<{ ok: true }> {
    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw new BadRequestException("Not a member of that tenant");
    await this.sessions.setTenant(sessionToken, tenantId);
    return { ok: true };
  }
}
