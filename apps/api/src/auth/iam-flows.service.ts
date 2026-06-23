import { randomBytes, randomInt } from "crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole } from "@yarns/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { SessionService } from "./session.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../messaging/transactional-dispatcher";
import { hashPassword, verifyPassword } from "./password.util";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const TWOFA_CODE_TTL_MS = 10 * 60 * 1000;

export interface Membership {
  tenantId: string;
  tenantName: string;
  role: AppUserRole;
  /** Billing context from the owning network (null for network-less tenants). */
  network: { id: string; planName: string | null; subscriptionStatus: string | null } | null;
}

export interface SessionGrant {
  userId: string;
  token: string;
  expiresAt: Date;
  memberships: Membership[];
}

/** Result of a password sign-in attempt (the controller maps these to HTTP). */
export type SignInResult =
  | { kind: "invalid" }
  | { kind: "no-membership" }
  | { kind: "twofa"; challengeId: string }
  | ({ kind: "ok"; email: string } & SessionGrant);

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
    private readonly outbox: OutboxService,
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
      where: { userId, tenant: { deletedAt: null } }, // exclude soft-deleted tenants (WS3)
      orderBy: { createdAt: "asc" },
      include: {
        tenant: {
          select: {
            name: true,
            network: { select: { id: true, planName: true, subscriptionStatus: true } },
          },
        },
      },
    });
    return rows.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      role: m.role,
      network: m.tenant.network
        ? {
            id: m.tenant.network.id,
            planName: m.tenant.network.planName,
            subscriptionStatus: m.tenant.network.subscriptionStatus,
          }
        : null,
    }));
  }

  /**
   * Password sign-in (extracted from the controller so it's unit-testable).
   * Returns a discriminated result; the controller maps it to HTTP + the cookie.
   */
  async signIn(email: string | undefined, password: string | undefined): Promise<SignInResult> {
    const normalised = email?.trim().toLowerCase();
    const user = normalised
      ? await this.prisma.user.findUnique({ where: { email: normalised } })
      : null;
    if (!user || !(await verifyPassword(password ?? "", user.passwordHash))) {
      return { kind: "invalid" };
    }
    const memberships = await this.membershipsFor(user.id);
    if (memberships.length === 0) return { kind: "no-membership" };
    // 2FA-enabled users complete login via POST /iam/2fa/verify; no session yet.
    if (user.twofaEnabled) {
      const { challengeId } = await this.start2fa(user.id);
      return { kind: "twofa", challengeId };
    }
    const grant = await this.grantSession(user.id);
    return { kind: "ok", email: user.email, ...grant };
  }

  /** Account flags for /auth/check so a settings UI needn't make a second call (WS3). */
  async userFlags(userId: string): Promise<{ emailVerified: boolean; mobileVerified: boolean; twofaEnabled: boolean }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, mobileVerified: true, twofaEnabled: true },
    });
    return {
      emailVerified: !!u?.emailVerified,
      mobileVerified: !!u?.mobileVerified,
      twofaEnabled: !!u?.twofaEnabled,
    };
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
    const memberships = await this.membershipsFor(userId);
    const tenantId = memberships[0]?.tenantId ?? (await this.resolveTenantId(userId));
    const { token, expiresAt } = await this.sessions.create(userId, { tenantId });
    // Sign-in audit event — every session-issuing path funnels through here (WS3).
    await this.prisma.$transaction((tx) =>
      this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.signed-in",
        aggregateId: userId,
        payload: { userId, tenantId },
      }),
    );
    return { userId, token, expiresAt, memberships };
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
        vars: { link: this.link("sign-in/magic-link", token) },
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

  /** Non-consuming reset-link validity check so the UI can show "link expired" pre-submit. */
  async verifyResetToken(token: string): Promise<{ valid: boolean }> {
    const reset = await this.prisma.passwordReset.findUnique({ where: { token } });
    return { valid: !!reset && !reset.consumedAt && reset.expiresAt.getTime() > Date.now() };
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
    const tenantId = await this.resolveTenantId(reset.userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordReset.update({ where: { id: reset.id }, data: { consumedAt: new Date() } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.password-reset",
        aggregateId: reset.userId,
        payload: { userId: reset.userId, tenantId },
      });
    });
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
    const tenantId = await this.resolveTenantId(user.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.email-verified",
        aggregateId: user.id,
        payload: { userId: user.id, tenantId },
      });
    });
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

  // ── 2FA enrolment + mobile capture (WS3 — without this the 2FA login is dead) ──
  /** Set/replace the caller's mobile (resets verification). */
  async setMobile(userId: string, mobile: string): Promise<{ ok: true }> {
    const trimmed = mobile.trim();
    if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) throw new BadRequestException("mobile must be E.164");
    await this.prisma.user.update({ where: { id: userId }, data: { mobile: trimmed, mobileVerified: false } });
    return { ok: true };
  }

  /** Send an SMS code to the caller's mobile (reuses the start2fa challenge). */
  async sendMobileVerification(userId: string): Promise<{ challengeId: string }> {
    return this.start2fa(userId);
  }

  /** Confirm the SMS code → mark the mobile verified. */
  async confirmMobileVerification(userId: string, code: string): Promise<{ ok: true }> {
    const record = await this.prisma.mobileVerification.findFirst({
      where: { userId, code, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!record) throw new BadRequestException("Invalid or expired code");
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
      await tx.user.update({ where: { id: userId }, data: { mobileVerified: true } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.mobile-verified",
        aggregateId: userId,
        payload: { userId, tenantId },
      });
    });
    return { ok: true };
  }

  /** Enable SMS 2FA — requires a verified mobile, else the login challenge can't send. */
  async enable2fa(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mobileVerified) throw new BadRequestException("Verify your mobile number first");
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twofaEnabled: true } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.2fa-enabled",
        aggregateId: userId,
        payload: { userId, tenantId },
      });
    });
    return { ok: true };
  }

  async disable2fa(userId: string): Promise<{ ok: true }> {
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twofaEnabled: false } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.2fa-disabled",
        aggregateId: userId,
        payload: { userId, tenantId },
      });
    });
    return { ok: true };
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
      const isNewUser = !user;
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
      // Emit the events the invite path was previously silent on (WS3).
      if (isNewUser) {
        await this.outbox.append(tx, {
          tenantId: invite.tenantId,
          eventType: "iam.user.created",
          aggregateId: user.id,
          payload: { userId: user.id, email: user.email, tenantId: invite.tenantId },
        });
      }
      await this.outbox.append(tx, {
        tenantId: invite.tenantId,
        eventType: "tenant.member.added",
        aggregateId: invite.tenantId,
        payload: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
      });
      await this.outbox.append(tx, {
        tenantId: invite.tenantId,
        eventType: "tenant.invitation.accepted",
        aggregateId: invite.id,
        payload: { invitationId: invite.id, tenantId: invite.tenantId, userId: user.id },
      });
      return user.id;
    });

    return this.grantSession(grant);
  }

  /** Invitee-side decline (single-use): marks the invite declined + emits the event. */
  async declineInvite(token: string): Promise<{ ok: true }> {
    const invite = await this.loadValidInvite(token);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantInvitation.update({ where: { id: invite.id }, data: { status: "declined" } });
      await this.outbox.append(tx, {
        tenantId: invite.tenantId,
        eventType: "tenant.invitation.declined",
        aggregateId: invite.id,
        payload: { invitationId: invite.id, tenantId: invite.tenantId },
      });
    });
    return { ok: true };
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
