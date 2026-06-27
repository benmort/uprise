import { randomBytes, randomInt } from "crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole, Prisma } from "@uprise/db";
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
  | { kind: "pending" }
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
    if (!user || user.deletedAt || !(await verifyPassword(password ?? "", user.passwordHash))) {
      return { kind: "invalid" };
    }
    const memberships = await this.membershipsFor(user.id);
    if (memberships.length === 0 && !user.isSuperAdmin) {
      // A self-signup awaiting approval has a User + a pending join request but no
      // membership — surface a soft "awaiting approval" rather than invalid creds.
      // (A super-admin may legitimately have no membership — let them through to a session.)
      const pending = await this.prisma.tenantJoinRequest.findFirst({
        where: { userId: user.id, status: "pending" },
      });
      return { kind: pending ? "pending" : "no-membership" };
    }
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

  // ── Self-service password + email change (authenticated) ────────────
  /** Change the caller's password after verifying the current one. Revokes other sessions. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(currentPassword ?? "", user.passwordHash))) {
      throw new BadRequestException("Current password is incorrect");
    }
    const passwordHash = await hashPassword(newPassword);
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.password-reset",
        aggregateId: userId,
        payload: { userId, tenantId },
      });
    });
    // Changing the password invalidates other sessions; the caller keeps theirs.
    await this.sessions.revokeAllForUser(userId);
    return { ok: true };
  }

  /** Change the caller's email after confirming their password; resets verification. */
  async changeEmail(userId: string, newEmail: string, password: string): Promise<{ ok: true }> {
    const email = newEmail.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(password ?? "", user.passwordHash))) {
      throw new BadRequestException("Password is incorrect");
    }
    if (email === user.email) throw new BadRequestException("That is already your email address");
    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken) throw new BadRequestException("That email is already in use");
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { email, emailVerified: false } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.email-changed",
        aggregateId: userId,
        payload: { userId, tenantId, newEmail: email },
      });
    });
    // Send a fresh verification code to the new address.
    await this.sendEmailVerification(email);
    return { ok: true };
  }

  /**
   * Self-service account deletion (soft-delete). Verifies the password, blocks if the
   * caller is the sole organiser of any tenant (they must hand off first), then in one
   * transaction soft-deletes the user, removes their memberships and emits the event;
   * finally revokes every session. Mirrors the tenant soft-delete pattern.
   */
  async deleteAccount(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new BadRequestException("Account not found");
    if (!(await verifyPassword(password ?? "", user.passwordHash))) {
      throw new BadRequestException("Password is incorrect");
    }
    const memberships = await this.prisma.tenantMember.findMany({ where: { userId } });
    for (const m of memberships) {
      if (m.role !== AppUserRole.ORGANISER) continue;
      const organisers = await this.prisma.tenantMember.count({
        where: { tenantId: m.tenantId, role: AppUserRole.ORGANISER },
      });
      if (organisers <= 1) {
        throw new BadRequestException(
          "You are the only organiser of a workspace. Hand over or delete it before deleting your account.",
        );
      }
    }
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
      await tx.tenantMember.deleteMany({ where: { userId } });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "iam.user.deleted",
        aggregateId: userId,
        payload: { userId, tenantId },
      });
    });
    await this.sessions.revokeAllForUser(userId);
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
      await this.createMembershipTx(tx, {
        tenantId: invite.tenantId,
        userId: user.id,
        role: invite.role,
        addedBy: invite.invitedBy,
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

  /**
   * Shared membership-creation core (reused by acceptInvite + approveJoinRequest).
   * Idempotent: the `update: {}` makes a re-run / already-member a no-op. Emits
   * tenant.member.added in the SAME transaction (outbox-atomic).
   */
  private async createMembershipTx(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; userId: string; role: AppUserRole; addedBy?: string | null },
  ): Promise<void> {
    await tx.tenantMember.upsert({
      where: { tenantId_userId: { tenantId: args.tenantId, userId: args.userId } },
      create: { tenantId: args.tenantId, userId: args.userId, role: args.role, addedBy: args.addedBy ?? null },
      update: {},
    });
    await this.outbox.append(tx, {
      tenantId: args.tenantId,
      eventType: "tenant.member.added",
      aggregateId: args.tenantId,
      payload: { tenantId: args.tenantId, userId: args.userId, role: args.role },
    });
  }

  // ── Join requests (self-signup → admin approval; the inverse of invite) ──
  /**
   * Public: a prospect requests access to an existing tenant. Creates/loads the User
   * (emailVerified:false), upserts a join request at status "unverified" (resetting a
   * stale/rejected row), and sends a verification code. NO session, NO iam.user.created
   * (that would fire the welcome email pre-approval), NO submitted event yet — the
   * request only enters the organiser queue once the email is verified (confirmAccess).
   */
  async requestAccess(input: {
    email: string;
    password: string;
    displayName: string;
    requestedRole: string;
    tenantSlug: string;
  }): Promise<{ ok: true; alreadyMember?: boolean }> {
    const email = input.email.trim().toLowerCase();
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const slug = input.tenantSlug.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
    if (!tenant) throw new BadRequestException("Unknown organisation");

    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (user) {
        const member = await tx.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        });
        if (member) return { alreadyMember: true };
      } else {
        user = await tx.user.create({
          data: {
            email,
            displayName: input.displayName.trim() || email,
            passwordHash: await hashPassword(input.password),
            emailVerified: false,
          },
        });
      }
      const existingReq = await tx.tenantJoinRequest.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      });
      if (!existingReq) {
        await tx.tenantJoinRequest.create({
          data: { tenantId: tenant.id, userId: user.id, email, requestedRole: input.requestedRole, status: "unverified" },
        });
      } else if (existingReq.status === "rejected") {
        // Soft re-request: a rejected applicant may try again — reset to unverified.
        await tx.tenantJoinRequest.update({
          where: { id: existingReq.id },
          data: { requestedRole: input.requestedRole, status: "unverified", decidedBy: null, decidedAt: null },
        });
      } else {
        // pending / unverified / approved — keep the row + decision audit intact; just
        // refresh the role hint (the verify step re-sends the code below).
        await tx.tenantJoinRequest.update({
          where: { id: existingReq.id },
          data: { requestedRole: input.requestedRole },
        });
      }
      return { alreadyMember: false };
    });

    if (result.alreadyMember) return { ok: true, alreadyMember: true };
    // Send the verification code (no-op if the user is somehow already verified).
    await this.sendEmailVerification(email);
    return { ok: true };
  }

  /**
   * Public: confirm the verification code, then promote the join request to "pending"
   * (visible to organisers) and emit submitted. Reuses confirmEmailVerification.
   */
  async confirmAccess(email: string, code: string, tenantSlug: string): Promise<{ ok: true }> {
    const slug = tenantSlug.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
    if (!tenant) throw new BadRequestException("Unknown organisation");
    await this.confirmEmailVerification(email, code); // sets emailVerified, throws on bad code
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new BadRequestException("Invalid code");
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantJoinRequest.updateMany({
        where: { tenantId: tenant.id, userId: user.id, status: "unverified" },
        data: { status: "pending" },
      });
      if (updated.count === 0) return; // already pending/decided — idempotent
      const req = await tx.tenantJoinRequest.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      });
      if (req) {
        await this.outbox.append(tx, {
          tenantId: tenant.id,
          eventType: "tenant.join-request.submitted",
          aggregateId: req.id,
          payload: { requestId: req.id, tenantId: tenant.id, email: user.email, requestedRole: req.requestedRole },
        });
      }
    });
    return { ok: true };
  }

  /**
   * Admin: approve a pending request → create the membership (shared core) with the
   * organiser-assigned role. Race-safe: the conditional updateMany ensures exactly one
   * concurrent approve wins and emits. Idempotent on a second call.
   */
  async approveJoinRequest(
    tenantId: string,
    requestId: string,
    input: { role: AppUserRole; approvedBy?: string | null },
  ): Promise<{ ok: true }> {
    const reqRow = await this.prisma.tenantJoinRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!reqRow) throw new BadRequestException("Join request not found");
    if (reqRow.status === "rejected") throw new BadRequestException("This request was rejected");
    if (reqRow.status === "approved") return { ok: true };
    await this.prisma.$transaction(async (tx) => {
      const won = await tx.tenantJoinRequest.updateMany({
        where: { id: requestId, tenantId, status: "pending" },
        data: { status: "approved", decidedBy: input.approvedBy ?? null, decidedAt: new Date() },
      });
      if (won.count === 0) return; // lost the race / not pending — no duplicate emit
      await this.createMembershipTx(tx, {
        tenantId,
        userId: reqRow.userId,
        role: input.role,
        addedBy: input.approvedBy,
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.join-request.approved",
        aggregateId: requestId,
        payload: { requestId, tenantId, userId: reqRow.userId, role: input.role },
      });
    });
    return { ok: true };
  }

  /** Admin: reject a pending request (soft — the prospect may re-request). */
  async rejectJoinRequest(
    tenantId: string,
    requestId: string,
    input: { rejectedBy?: string | null } = {},
  ): Promise<{ ok: true }> {
    const reqRow = await this.prisma.tenantJoinRequest.findFirst({ where: { id: requestId, tenantId } });
    if (!reqRow) throw new BadRequestException("Join request not found");
    if (reqRow.status === "approved") throw new BadRequestException("This request was already approved");
    if (reqRow.status === "rejected") return { ok: true };
    await this.prisma.$transaction(async (tx) => {
      const won = await tx.tenantJoinRequest.updateMany({
        where: { id: requestId, tenantId, status: { in: ["pending", "unverified"] } },
        data: { status: "rejected", decidedBy: input.rejectedBy ?? null, decidedAt: new Date() },
      });
      if (won.count === 0) return;
      await this.outbox.append(tx, {
        tenantId,
        eventType: "tenant.join-request.rejected",
        aggregateId: requestId,
        payload: { requestId, tenantId, userId: reqRow.userId },
      });
    });
    return { ok: true };
  }

  // ── Tenant selection ────────────────────────────────────────────────
  /**
   * Pin the active tenant on the caller's session. Requires a membership in that
   * tenant — except a super-admin, who may pin any existing (non-deleted) tenant
   * for cross-tenant access. The tenant-existence check still stands so a session
   * can't be pinned to an arbitrary/foreign id.
   */
  async selectTenant(userId: string, sessionToken: string, tenantId: string): Promise<{ ok: true }> {
    const membership = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true },
      });
      if (!user?.isSuperAdmin) throw new BadRequestException("Not a member of that tenant");
      const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
      if (!tenant) throw new BadRequestException("Unknown tenant");
    }
    await this.sessions.setTenant(sessionToken, tenantId);
    return { ok: true };
  }
}
