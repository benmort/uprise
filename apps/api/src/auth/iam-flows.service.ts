import { randomBytes, randomInt } from "crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppUserRole, CanvassCampaignStatus, Prisma, TurfAssignmentStatus } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { SessionService } from "./session.service";
import { DomainLogger } from "../common/logging/domain-logger.service";
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../messaging/transactional-dispatcher";
import { hashPassword, verifyPassword } from "./password.util";
import { PlanLimitsService } from "../common/flags/plan-limits.service";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const VERIFY_CODE_TTL_MS = 15 * 60 * 1000;
const TWOFA_CODE_TTL_MS = 10 * 60 * 1000;
// Phone-first passwordless login: short-lived codes, a per-phone send cap (SMS-bomb
// guard) and a per-challenge attempt cap (brute-force guard).
const PHONE_LOGIN_TTL_MS = 5 * 60 * 1000;
const PHONE_SEND_WINDOW_MS = 15 * 60 * 1000;
const PHONE_MAX_SENDS_PER_WINDOW = 3;
const MAX_OTP_ATTEMPTS = 5;

/** Throws unless `raw` is a valid E.164 number; returns the trimmed value. */
function assertE164(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) {
    throw new BadRequestException("Enter a valid mobile number in international format, e.g. +61400000000");
  }
  return trimmed;
}

/**
 * Synthesised, non-deliverable identifier email for a phone-only user. `User.email`
 * is required + unique; phone users carry their real number in `mobile` and a stable
 * placeholder here (the `.invalid` TLD is reserved + unroutable, RFC 6761).
 */
function phonePlaceholderEmail(mobile: string): string {
  return `${mobile.replace(/\D/g, "")}@phone.uprise.invalid`;
}

/** Start of the current week (Monday 00:00 UTC) — the window for the join hero's "doors this week". */
function startOfWeekUtc(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** Assemble advisory doorknocker onboarding prefs into a JSON bag (undefined if none set). */
function buildCanvassPrefs(input: {
  walkingCapability?: string;
  sessionLength?: string;
}): Prisma.InputJsonValue | undefined {
  const prefs: Record<string, string> = {};
  if (input.walkingCapability) prefs.walkingCapability = input.walkingCapability;
  if (input.sessionLength) prefs.sessionLength = input.sessionLength;
  return Object.keys(prefs).length ? prefs : undefined;
}

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: AppUserRole;
  /** The tenant's logo (landscape preferred, block fallback) for switcher/field brand marks. */
  logoUrl: string | null;
  /** Plan key of the owning network, flattened for the client (null when network-less). */
  planName: string | null;
  /** Billing context from the owning network (null for network-less tenants). */
  network: { id: string; planName: string | null; subscriptionStatus: string | null } | null;
}

export interface SessionGrant {
  userId: string;
  token: string;
  expiresAt: Date;
  memberships: Membership[];
}

/** A new-workspace signup awaiting super-admin approval — the super Signups queue row.
 *  Structurally mirrors PendingSignup in @uprise/contracts (the api doesn't depend on it). */
export interface PendingSignup {
  requestId: string;
  tenantId: string;
  orgName: string;
  slug: string;
  email: string;
  displayName: string | null;
  createdAt: string;
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
    private readonly planLimits: PlanLimitsService,
  ) {}

  // ── shared helpers ──────────────────────────────────────────────────
  private newToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, "0");
  }

  /**
   * Send an OTP SMS, tolerating a missing SMS provider in DEVELOPMENT. In production
   * a failed send rethrows (the caller must learn the code didn't go out, e.g. 2FA);
   * in dev (no Twilio configured → TwilioService throws ServiceUnavailable) we swallow
   * it so the challenge still completes — the code is surfaced on-screen by the dev
   * hint (GET /iam/dev/otp) instead, keeping phone-first login / 2FA testable sans SMS.
   */
  private async sendOtpSms(input: Parameters<TransactionalDispatcher["sendSms"]>[0]): Promise<void> {
    const isProd = this.config.get<string>("NODE_ENV") === "production";
    // In dev the code is shown on-screen (GET /iam/dev/otp), so we skip the real SMS by
    // default. Set DEV_SEND_OTP_SMS=true to actually dispatch via Twilio for end-to-end
    // testing on a real phone (requires TWILIO_* configured). Production always sends.
    const devSend = this.config.get<boolean>("DEV_SEND_OTP_SMS") === true;
    if (!isProd && !devSend) {
      this.logger.warn("iam", "OTP SMS skipped in dev (set DEV_SEND_OTP_SMS=true to send); code on-screen", {
        purpose: input.purpose,
      });
      return;
    }
    try {
      await this.dispatcher.sendSms(input);
    } catch (err) {
      if (isProd) throw err;
      // dev + DEV_SEND_OTP_SMS=true but the send failed (e.g. Twilio not configured) —
      // surface it loudly; the on-screen dev code still works as a fallback.
      this.logger.warn("iam", "OTP SMS send failed in dev (DEV_SEND_OTP_SMS=true) — check TWILIO_* config", {
        purpose: input.purpose,
        error: String(err),
      });
    }
  }

  /**
   * Send a transactional auth email WITHOUT leaking account existence or 500-ing
   * the request. A provider failure (SendGrid unconfigured / unverified sender /
   * transient outage) is logged server-side — and EmailService has already marked
   * the Email row FAILED with the reason — but the endpoint still returns ok, so
   * the response is byte-identical whether or not the account exists. (Previously
   * a send throw only occurred for REAL accounts, which both broke the UX and
   * leaked existence via the 500.)
   */
  private async dispatchAuthEmail(
    input: Parameters<TransactionalDispatcher["sendEmail"]>[0],
  ): Promise<void> {
    try {
      await this.dispatcher.sendEmail(input);
      this.logger.log("iam", "Auth email dispatched", { purpose: input.purpose, to: input.toAddress });
    } catch (err) {
      this.logger.error(
        "iam",
        "Auth email send FAILED — check SENDGRID_API_KEY/SENDGRID_FROM_EMAIL, sender verification, and the Email row",
        undefined,
        { purpose: input.purpose, to: input.toAddress, error: String(err) },
      );
    }
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
            slug: true,
            network: { select: { id: true, planName: true, subscriptionStatus: true } },
          },
        },
      },
    });
    // Batch each tenant's logo in one query (openJoinList pattern) for the switcher/field marks.
    const profiles = await this.prisma.orgProfile.findMany({
      where: { tenantId: { in: rows.map((m) => m.tenantId) } },
      select: { tenantId: true, logoLandscapeUrl: true, logoBlockUrl: true },
    });
    const logoByTenant = new Map(profiles.map((p) => [p.tenantId, p.logoLandscapeUrl ?? p.logoBlockUrl ?? null]));
    return rows.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant.name,
      tenantSlug: m.tenant.slug,
      role: m.role,
      logoUrl: logoByTenant.get(m.tenantId) ?? null,
      planName: m.tenant.network?.planName ?? null,
      network: m.tenant.network
        ? {
            id: m.tenant.network.id,
            planName: m.tenant.network.planName,
            subscriptionStatus: m.tenant.network.subscriptionStatus,
          }
        : null,
    }));
  }

  /** Minimal {id,name,slug} for a live tenant — used to label a super-admin's active
   *  "acting as" tenant on /auth/check when it isn't one of their memberships. */
  async tenantSummary(tenantId: string): Promise<{ id: string; name: string; slug: string } | null> {
    const t = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
    return t ?? null;
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

  /** Tenant to attribute a transactional send / audit event to: the user's first membership,
   *  or null if they belong to no tenant (membership-less accounts are not attributed to a
   *  default org — callers fail safe: skip the send / skip the tenant-scoped event). */
  private async resolveTenantId(userId: string): Promise<string | null> {
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return membership?.tenantId ?? null;
  }

  private async grantSession(userId: string): Promise<SessionGrant> {
    const memberships = await this.membershipsFor(userId);
    const tenantId = memberships[0]?.tenantId ?? null;
    const { token, expiresAt } = await this.sessions.create(userId, { tenantId });
    // Sign-in audit event — every session-issuing path funnels through here (WS3). Skipped
    // for a membership-less sign-in (no tenant to attribute it to; they hit select-tenant).
    if (tenantId) {
      await this.prisma.$transaction((tx) =>
        this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.signed-in",
          aggregateId: userId,
          payload: { userId, tenantId },
        }),
      );
    }
    return { userId, token, expiresAt, memberships };
  }

  // ── Magic link ──────────────────────────────────────────────────────
  /** Request a magic-link email. Always succeeds (never leaks account existence). */
  async requestMagicLink(email: string): Promise<{ ok: true }> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalised } });
    const tenantId = user ? await this.resolveTenantId(user.id) : null;
    if (user && tenantId) {
      const token = this.newToken();
      await this.prisma.magicLink.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
      });
      await this.dispatchAuthEmail({
        tenantId,
        toAddress: user.email,
        templateKey: "magic_link",
        vars: { link: this.link("sign-in/magic-link", token) },
        purpose: "magic_link",
      });
    } else {
      // Server-side breadcrumb only (never surfaced to the client, preserving
      // anti-enumeration) so ops can tell "no account" from "send failed".
      this.logger.log("iam", "Magic-link requested for an email with no account — nothing sent", {
        email: normalised,
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
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalised } });
    const tenantId = user ? await this.resolveTenantId(user.id) : null;
    if (user && tenantId) {
      const token = this.newToken();
      await this.prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      });
      await this.dispatchAuthEmail({
        tenantId,
        toAddress: user.email,
        templateKey: "recovery",
        vars: { link: this.link("reset-password", token) },
        purpose: "password_reset",
      });
    } else {
      this.logger.log("iam", "Password reset requested for an email with no account — nothing sent", {
        email: normalised,
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
      // The reset itself is user-level; the audit event is tenant-scoped, so skip it for a
      // membership-less user rather than attributing to a default org.
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.password-reset",
          aggregateId: reset.userId,
          payload: { userId: reset.userId, tenantId },
        });
      }
    });
    // A reset invalidates every existing session for that user.
    await this.sessions.revokeAllForUser(reset.userId);
    return { ok: true };
  }

  // ── Email verification (code) ───────────────────────────────────────
  async sendEmailVerification(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const tenantId = user ? await this.resolveTenantId(user.id) : null;
    if (user && !user.emailVerified && tenantId) {
      const code = this.newCode();
      await this.prisma.mobileVerification.create({
        data: { userId: user.id, code, expiresAt: new Date(Date.now() + VERIFY_CODE_TTL_MS) },
      });
      await this.dispatchAuthEmail({
        tenantId,
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.email-verified",
          aggregateId: user.id,
          payload: { userId: user.id, tenantId },
        });
      }
    });
    return { ok: true };
  }

  // ── SMS 2FA ─────────────────────────────────────────────────────────
  /** Start a 2FA challenge for a user (called by login when twofaEnabled). Returns the challenge id. */
  async start2fa(userId: string): Promise<{ challengeId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mobile) throw new BadRequestException("No mobile number on file for 2FA");
    // Per-user send cap (SMS-bomb guard) — covers 2FA resend, mobile capture and the
    // request-access-by-phone path, all of which funnel through here. Over the cap the
    // challenge row is still written but no SMS goes out.
    const recentSends = await this.prisma.mobileVerification.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - PHONE_SEND_WINDOW_MS) } },
    });
    const code = this.newCode();
    const record = await this.prisma.mobileVerification.create({
      data: { userId, code, expiresAt: new Date(Date.now() + TWOFA_CODE_TTL_MS) },
    });
    const tenantId = await this.resolveTenantId(userId);
    if (tenantId && recentSends < PHONE_MAX_SENDS_PER_WINDOW) {
      await this.sendOtpSms({
        tenantId,
        toPhone: user.mobile,
        body: `Your verification code is ${code}`,
        purpose: "2fa",
      });
    }
    return { challengeId: record.id };
  }

  /** Resend the code for an existing 2FA challenge. */
  async resend2fa(challengeId: string): Promise<{ challengeId: string }> {
    const existing = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!existing?.userId) throw new BadRequestException("Invalid challenge");
    return this.start2fa(existing.userId);
  }

  async verify2fa(challengeId: string, code: string): Promise<SessionGrant> {
    const invalid = () => new BadRequestException("Invalid or expired code");
    const record = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!record || !record.userId || record.verifiedAt || record.expiresAt.getTime() <= Date.now()) {
      throw invalid();
    }
    if (record.attempts >= MAX_OTP_ATTEMPTS) throw invalid();
    if (record.code !== code) {
      await this.prisma.mobileVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }
    await this.prisma.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
    return this.grantSession(record.userId);
  }

  /**
   * DEV-ONLY: the plaintext OTP for an SMS challenge, so the code screens can show
   * it on-screen when no real SMS is sent (local development). Returns null in
   * production — and BasicAuthGuard only routes this pre-session in development — so
   * a live code is never exposed off a dev box. Covers both 2FA and phone-login
   * challenges (both are `MobileVerification` rows).
   *
   * Only surfaces a code that could actually verify: it requires a real `userId`
   * (so the phone-login DECOY rows written for unknown numbers — which can never
   * grant a session, see verifyPhoneLogin — are not shown), unverified and unexpired.
   * No code shown ⇒ that number isn't a real, active account in this database.
   */
  async devPeekOtp(challengeId: string): Promise<{ code: string | null; smsSent: boolean }> {
    // `smsSent` lets the code screens label accurately — a real SMS also goes out when
    // DEV_SEND_OTP_SMS is on (vs the code being on-screen only).
    const smsSent = this.config.get<boolean>("DEV_SEND_OTP_SMS") === true;
    if (this.config.get<string>("NODE_ENV") === "production") return { code: null, smsSent: false };
    if (!challengeId) return { code: null, smsSent };
    const record = await this.prisma.mobileVerification.findUnique({
      where: { id: challengeId },
      select: { code: true, userId: true, mobile: true, verifiedAt: true, expiresAt: true },
    });
    // A real account (userId) OR an invited-phone challenge (mobile, pre-user) — both can
    // verify; decoy rows (neither) can never grant, so they stay hidden.
    if (
      !record ||
      (!record.userId && !record.mobile) ||
      record.verifiedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      return { code: null, smsSent };
    }
    return { code: record.code, smsSent };
  }

  // ── Phone-first passwordless login (volunteers/canvassers) ──────────────
  /**
   * Start a phone-login challenge. ALWAYS returns a challengeId — even for an
   * unknown number — so the endpoint never reveals whether a phone is registered
   * (a decoy row is written and no SMS is sent). The SMS only goes to a real,
   * active account, and only under the per-phone send cap (SMS-bomb guard).
   */
  async startPhoneLogin(rawPhone: string): Promise<{ challengeId: string }> {
    const mobile = assertE164(rawPhone);
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    const recentSends = await this.prisma.mobileVerification.count({
      where: { mobile, createdAt: { gt: new Date(Date.now() - PHONE_SEND_WINDOW_MS) } },
    });
    const code = this.newCode();
    const record = await this.prisma.mobileVerification.create({
      data: { userId: user?.id ?? null, mobile, code, expiresAt: new Date(Date.now() + PHONE_LOGIN_TTL_MS) },
    });
    const tenantId = user ? await this.resolveTenantId(user.id) : null;
    if (user && tenantId && !user.deletedAt && recentSends < PHONE_MAX_SENDS_PER_WINDOW) {
      await this.sendOtpSms({
        tenantId,
        toPhone: mobile,
        body: `Your sign-in code is ${code}`,
        purpose: "phone_login",
      });
    }
    return { challengeId: record.id };
  }

  /** Resend the code for an existing phone-login challenge (re-issues by its number). */
  async resendPhoneLogin(challengeId: string): Promise<{ challengeId: string }> {
    const existing = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!existing?.mobile) throw new BadRequestException("Invalid challenge");
    return this.startPhoneLogin(existing.mobile);
  }

  /**
   * Verify a phone-login code → issue a session. Generic error for every failure
   * (enumeration + brute-force resistance), an attempt cap per challenge, and the
   * same no-membership/pending gate as password sign-in (a verified phone with no
   * workspace, e.g. awaiting approval, gets no session).
   */
  async verifyPhoneLogin(challengeId: string, code: string): Promise<SessionGrant> {
    const invalid = () => new BadRequestException("Invalid or expired code");
    const record = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!record || !record.userId || record.verifiedAt || record.expiresAt.getTime() <= Date.now()) {
      throw invalid();
    }
    if (record.attempts >= MAX_OTP_ATTEMPTS) throw invalid();
    if (record.code !== code) {
      await this.prisma.mobileVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }
    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) throw invalid();
    const memberships = await this.membershipsFor(user.id);
    if (memberships.length === 0 && !user.isSuperAdmin) {
      const pending = await this.prisma.tenantJoinRequest.findFirst({
        where: { userId: user.id, status: "pending" },
      });
      throw new BadRequestException(
        pending
          ? "Your request to join is awaiting an organiser's approval."
          : "This number isn't linked to a workspace yet — ask for an invite or request to join.",
      );
    }
    await this.prisma.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
    return this.grantSession(user.id);
  }

  // ── 2FA enrolment + mobile capture (WS3 — without this the 2FA login is dead) ──
  /** Set/replace the caller's mobile (resets verification). */
  async setMobile(userId: string, mobile: string): Promise<{ ok: true }> {
    const trimmed = assertE164(mobile);
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.mobile-verified",
          aggregateId: userId,
          payload: { userId, tenantId },
        });
      }
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.2fa-enabled",
          aggregateId: userId,
          payload: { userId, tenantId },
        });
      }
    });
    return { ok: true };
  }

  async disable2fa(userId: string): Promise<{ ok: true }> {
    const tenantId = await this.resolveTenantId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twofaEnabled: false } });
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.2fa-disabled",
          aggregateId: userId,
          payload: { userId, tenantId },
        });
      }
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.password-reset",
          aggregateId: userId,
          payload: { userId, tenantId },
        });
      }
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.email-changed",
          aggregateId: userId,
          payload: { userId, tenantId, newEmail: email },
        });
      }
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
      if (tenantId) {
        await this.outbox.append(tx, {
          tenantId,
          eventType: "iam.user.deleted",
          aggregateId: userId,
          payload: { userId, tenantId },
        });
      }
    });
    await this.sessions.revokeAllForUser(userId);
    return { ok: true };
  }

  // ── Invitation ──────────────────────────────────────────────────────
  async previewInvite(
    token: string,
  ): Promise<{
    email: string;
    phone: string | null;
    tenantName: string;
    logoUrl: string | null;
    role: AppUserRole;
    invitedChannel: string | null;
  }> {
    const invite = await this.loadValidInvite(token);
    const [tenant, profile] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: invite.tenantId } }),
      this.prisma.orgProfile.findFirst({
        where: { tenantId: invite.tenantId },
        select: { logoLandscapeUrl: true, logoBlockUrl: true },
      }),
    ]);
    return {
      email: invite.email ?? "",
      phone: invite.phone ?? null,
      tenantName: tenant?.name ?? "",
      logoUrl: profile?.logoLandscapeUrl ?? profile?.logoBlockUrl ?? null,
      role: invite.role,
      invitedChannel: invite.invitedChannel ?? null,
    };
  }

  /**
   * Issue + SMS a phone OTP for an invited number. Unlike startPhoneLogin (which only
   * texts an existing account, decoy otherwise), holding a valid invite authorises the
   * send — this is how a brand-new invited volunteer gets their code in the onboarding
   * wizard. The verified challengeId is then passed to acceptInvite.
   */
  async inviteStartPhone(token: string, rawPhone: string): Promise<{ challengeId: string }> {
    const invite = await this.loadValidInvite(token);
    const mobile = assertE164(rawPhone);
    const recentSends = await this.prisma.mobileVerification.count({
      where: { mobile, createdAt: { gt: new Date(Date.now() - PHONE_SEND_WINDOW_MS) } },
    });
    const code = this.newCode();
    const record = await this.prisma.mobileVerification.create({
      data: { userId: null, mobile, code, expiresAt: new Date(Date.now() + PHONE_LOGIN_TTL_MS) },
    });
    if (recentSends < PHONE_MAX_SENDS_PER_WINDOW) {
      await this.sendOtpSms({
        tenantId: invite.tenantId,
        toPhone: mobile,
        body: `Your sign-in code is ${code}`,
        purpose: "phone_login",
      });
    }
    return { challengeId: record.id };
  }

  /**
   * Verify a pre-user phone challenge (no membership requirement, unlike verifyPhoneLogin)
   * → returns the verified E.164 number. Brute-force capped per challenge. Used by the
   * onboarding wizard to bind an OTP-verified mobile onto the invite-accepted user.
   */
  private async verifyPhoneChallenge(challengeId: string, code: string): Promise<string> {
    const invalid = () => new BadRequestException("Invalid or expired code");
    const record = await this.prisma.mobileVerification.findUnique({ where: { id: challengeId } });
    if (!record || !record.mobile || record.expiresAt.getTime() <= Date.now()) throw invalid();
    // Idempotent: the onboarding wizard verifies the code at the code step for immediate
    // feedback (POST /iam/phone/check), then `accept` verifies again at the end. An
    // already-verified challenge re-presented with the SAME code is still valid, so both
    // succeed; a different code on a verified challenge is still rejected.
    if (record.verifiedAt) {
      if (record.code !== code) throw invalid();
      return record.mobile;
    }
    if (record.attempts >= MAX_OTP_ATTEMPTS) throw invalid();
    if (record.code !== code) {
      await this.prisma.mobileVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }
    await this.prisma.mobileVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
    return record.mobile;
  }

  /**
   * Verify a phone OTP WITHOUT issuing a session or creating anything — the onboarding wizard
   * calls this the moment the sixth digit is typed, so a wrong code is caught at the code step
   * instead of only failing at the very end. `accept` re-verifies (idempotently) as the source
   * of truth. Throws on a bad/expired code.
   */
  async verifyPhoneCode(challengeId: string, code: string): Promise<{ ok: true; existingUser: boolean }> {
    const mobile = await this.verifyPhoneChallenge(challengeId, code);
    // Safe to reveal only now, AFTER the OTP proves control of the number (no pre-verify
    // enumeration). Lets the onboarding wizard skip the signup questions for a returning
    // volunteer and just log them in + join.
    const existing = await this.prisma.user.findUnique({ where: { mobile }, select: { id: true } });
    return { ok: true, existingUser: Boolean(existing) };
  }

  async acceptInvite(
    token: string,
    input: {
      displayName?: string;
      password?: string;
      // Onboarding wizard: a verified phone OTP to bind + the volunteer's prefs.
      challengeId?: string;
      code?: string;
      preferredRole?: string;
      availabilityDays?: string[];
      walkingCapability?: string;
      sessionLength?: string;
    },
  ): Promise<SessionGrant> {
    const invite = await this.loadValidInvite(token);
    const isPhone = Boolean(invite.phone) && !invite.email;
    // Consume the OTP before the write tx so the per-challenge attempt cap can't be
    // rolled back by a later transaction abort.
    const verifiedMobile =
      input.challengeId && input.code
        ? await this.verifyPhoneChallenge(input.challengeId, input.code)
        : null;

    const grant = await this.prisma.$transaction(async (tx) => {
      let user: { id: string; email: string };
      let isNewUser: boolean;

      if (isPhone) {
        const mobile = invite.phone as string;
        const existing = await tx.user.findUnique({ where: { mobile } });
        isNewUser = !existing;
        user =
          existing ??
          (await tx.user.create({
            data: {
              email: phonePlaceholderEmail(mobile),
              displayName: input.displayName?.trim() || mobile,
              mobile,
              // Holding the link SMS'd to this number proves control of it.
              mobileVerified: true,
            },
          }));
      } else {
        const email = (invite.email ?? "").trim().toLowerCase();
        if (!email) throw new BadRequestException("This invitation is invalid.");
        const existing = await tx.user.findUnique({ where: { email } });
        isNewUser = !existing;
        if (existing) {
          user = existing;
        } else {
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
      }

      // Bind the OTP-verified mobile (the wizard's phone step) so phone sign-in works
      // next time. Safe for the phone-invite path (same number) and email invites alike.
      if (verifiedMobile) {
        await tx.user.update({
          where: { id: user.id },
          data: { mobile: verifiedMobile, mobileVerified: true },
        });
      }

      await this.createMembershipTx(tx, {
        tenantId: invite.tenantId,
        userId: user.id,
        role: invite.role,
        addedBy: invite.invitedBy,
        preferredRole: input.preferredRole,
        availabilityDays: input.availabilityDays,
        canvassPrefs: buildCanvassPrefs(input),
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
    args: {
      tenantId: string;
      userId: string;
      role: AppUserRole;
      addedBy?: string | null;
      // Volunteer onboarding prefs — set on a NEW membership only (advisory).
      preferredRole?: string | null;
      availabilityDays?: string[];
      canvassPrefs?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    // Plan limit: only a genuinely new seat counts (an existing member re-runs as a
    // no-op below, so it must not trip the limit).
    const existing = await tx.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: args.tenantId, userId: args.userId } },
      select: { userId: true },
    });
    if (!existing) await this.planLimits.assertTeamSeatAvailable(tx, args.tenantId);

    await tx.tenantMember.upsert({
      where: { tenantId_userId: { tenantId: args.tenantId, userId: args.userId } },
      create: {
        tenantId: args.tenantId,
        userId: args.userId,
        role: args.role,
        addedBy: args.addedBy ?? null,
        preferredRole: args.preferredRole ?? null,
        availabilityDays: args.availabilityDays ?? [],
        ...(args.canvassPrefs !== undefined ? { canvassPrefs: args.canvassPrefs } : {}),
      },
      update: {},
    });
    await this.outbox.append(tx, {
      tenantId: args.tenantId,
      eventType: "tenant.member.added",
      aggregateId: args.tenantId,
      payload: { tenantId: args.tenantId, userId: args.userId, role: args.role },
    });
  }

  // ── Open campaign join (tokenless self-enrol; per-campaign master switch) ──
  /**
   * Load a campaign that's open for tokenless enrolment, or throw. The gate is the
   * campaign's own `openJoinEnabled` flag (off by default) plus an ACTIVE status – this
   * is what replaces the invite token as the authorisation to onboard + the SMS send.
   */
  private async loadOpenCampaign(campaignId: string) {
    const campaign = await this.prisma.canvassCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, tenantId: true, openJoinEnabled: true, status: true, channel: true },
    });
    if (!campaign || !campaign.openJoinEnabled || campaign.status !== CanvassCampaignStatus.ACTIVE) {
      throw new BadRequestException("This campaign isn't open for sign-ups.");
    }
    return campaign;
  }

  /** Public preview for the `/volunteer/[campaignId]` landing – campaign + org name, gated. */
  async openJoinPreview(campaignId: string): Promise<{
    channel: string;
    campaignId: string;
    tenantId: string;
    campaignName: string;
    tenantName: string;
    logoUrl: string | null;
    primaryColour: string | null;
    secondaryColour: string | null;
    customCss: string | null;
    volunteerCount: number;
    doorsThisWeek: number;
  }> {
    const campaign = await this.loadOpenCampaign(campaignId);
    const [tenant, profile, stats] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: campaign.tenantId }, select: { name: true } }),
      // The org's block/avatar logo + brand colours — so the join hero wears the tenant's brand.
      this.prisma.orgProfile.findFirst({
        where: { tenantId: campaign.tenantId },
        select: { logoBlockUrl: true, primaryColour: true, secondaryColour: true, customCss: true },
      }),
      this.campaignJoinStats(campaign.tenantId, campaign.id),
    ]);
    return {
      channel: campaign.channel,
      campaignId: campaign.id,
      tenantId: campaign.tenantId,
      campaignName: campaign.name,
      tenantName: tenant?.name ?? "",
      logoUrl: profile?.logoBlockUrl ?? null,
      primaryColour: profile?.primaryColour ?? null,
      secondaryColour: profile?.secondaryColour ?? null,
      customCss: profile?.customCss ?? null,
      ...stats,
    };
  }

  /**
   * Recruitment social-proof for the join hero. Real + best-effort: a stat query failure returns 0
   * (the hero hides zero stats) so it can never break the critical open-join preview.
   * `volunteerCount` = distinct volunteers holding a turf in the campaign; `doorsThisWeek` = door
   * knocks since the start of the week (Mon 00:00 UTC) on the campaign's turfs.
   */
  private async campaignJoinStats(
    tenantId: string,
    campaignId: string,
  ): Promise<{ volunteerCount: number; doorsThisWeek: number }> {
    try {
      const [volunteers, doorsThisWeek] = await Promise.all([
        this.prisma.turfAssignment.findMany({
          where: { status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId, campaignId } },
          select: { volunteerId: true },
          distinct: ["volunteerId"],
        }),
        this.prisma.doorKnock.count({
          where: { tenantId, createdAt: { gte: startOfWeekUtc() }, contact: { turf: { campaignId } } },
        }),
      ]);
      return { volunteerCount: volunteers.length, doorsThisWeek };
    } catch {
      return { volunteerCount: 0, doorsThisWeek: 0 };
    }
  }

  /**
   * Public board for the `/volunteer` landing – every campaign that has opted into tokenless
   * open-join (openJoinEnabled + ACTIVE), with its org name + logo. Same item shape as
   * {@link openJoinPreview}, so the board can deep-link each opportunity into
   * `/volunteer/[campaignId]`. Pre-session (allowlisted). With `tenantSlug` the board is scoped to
   * that one tenant (the tenant-wide recruit page `/volunteer?org=<slug>`); without it, all tenants.
   */
  async openJoinList(tenantSlug?: string): Promise<
    Array<{
      campaignId: string;
      tenantId: string;
      campaignName: string;
      tenantName: string;
      logoUrl: string | null;
      primaryColour: string | null;
      secondaryColour: string | null;
      customCss: string | null;
      volunteerCount: number;
      doorsThisWeek: number;
    }>
  > {
    // Tenant-scoped board: resolve the slug to a tenant id (CanvassCampaign references tenant
    // id-only — no cross-schema relation to filter through). An unknown slug → empty board.
    let tenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findFirst({
        where: { slug: tenantSlug, deletedAt: null },
        select: { id: true },
      });
      if (!tenant) return [];
      tenantId = tenant.id;
    }
    const campaigns = await this.prisma.canvassCampaign.findMany({
      where: { openJoinEnabled: true, status: CanvassCampaignStatus.ACTIVE, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, name: true, tenantId: true },
      orderBy: { name: "asc" },
    });
    if (campaigns.length === 0) return [];
    // One round-trip per related table across the distinct tenants (not per campaign).
    const tenantIds = [...new Set(campaigns.map((c) => c.tenantId))];
    const [tenants, profiles] = await Promise.all([
      this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
      this.prisma.orgProfile.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, logoBlockUrl: true, primaryColour: true, secondaryColour: true },
      }),
    ]);
    const nameById = new Map(tenants.map((t) => [t.id, t.name]));
    const profileById = new Map(profiles.map((p) => [p.tenantId, p]));
    // The board is a card list, not the branded hero — so it carries logo + colour for each card but
    // NOT the per-campaign stats (kept cheap; the hero fetches those on select) or customCss.
    return campaigns.map((c) => {
      const p = profileById.get(c.tenantId);
      return {
        campaignId: c.id,
        tenantId: c.tenantId,
        campaignName: c.name,
        tenantName: nameById.get(c.tenantId) ?? "",
        logoUrl: p?.logoBlockUrl ?? null,
        primaryColour: p?.primaryColour ?? null,
        secondaryColour: p?.secondaryColour ?? null,
        customCss: null,
        volunteerCount: 0,
        doorsThisWeek: 0,
      };
    });
  }

  /**
   * Issue + SMS a phone OTP for a tokenless open-join. The campaign's `openJoinEnabled`
   * flag authorises the send to an unregistered number (mirrors inviteStartPhone, but
   * the master switch is the campaign, not an invite token). Rate-limited per phone.
   */
  async openJoinStartPhone(campaignId: string, rawPhone: string): Promise<{ challengeId: string }> {
    const campaign = await this.loadOpenCampaign(campaignId);
    const mobile = assertE164(rawPhone);
    const recentSends = await this.prisma.mobileVerification.count({
      where: { mobile, createdAt: { gt: new Date(Date.now() - PHONE_SEND_WINDOW_MS) } },
    });
    const code = this.newCode();
    const record = await this.prisma.mobileVerification.create({
      data: { userId: null, mobile, code, expiresAt: new Date(Date.now() + PHONE_LOGIN_TTL_MS) },
    });
    if (recentSends < PHONE_MAX_SENDS_PER_WINDOW) {
      await this.sendOtpSms({
        tenantId: campaign.tenantId,
        toPhone: mobile,
        body: `Your sign-in code is ${code}`,
        purpose: "phone_login",
      });
    }
    return { challengeId: record.id };
  }

  /**
   * Finalise a tokenless open-join: verify the phone OTP, upsert the phone-only user,
   * create an IMMEDIATE VOLUNTEER membership in the campaign's tenant (no approval), and
   * grant the session. Shares acceptInvite's tail minus the invite/email branches.
   */
  async openJoinAccept(
    campaignId: string,
    input: {
      challengeId?: string;
      code?: string;
      displayName?: string;
      preferredRole?: string;
      availabilityDays?: string[];
      walkingCapability?: string;
      sessionLength?: string;
    },
  ): Promise<SessionGrant> {
    const campaign = await this.loadOpenCampaign(campaignId);
    if (!input.challengeId || !input.code) {
      throw new BadRequestException("Verify your mobile number first.");
    }
    // Consume the OTP before the write tx (the per-challenge attempt cap can't roll back).
    const mobile = await this.verifyPhoneChallenge(input.challengeId, input.code);

    const userId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { mobile } });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email: phonePlaceholderEmail(mobile),
            displayName: input.displayName?.trim() || mobile,
            mobile,
            mobileVerified: true,
            signupSource: "open_join",
          },
        }));
      // Holding the OTP'd number proves control of it – verify a returning user too.
      if (existing && !existing.mobileVerified) {
        await tx.user.update({ where: { id: existing.id }, data: { mobileVerified: true } });
      }
      await this.createMembershipTx(tx, {
        tenantId: campaign.tenantId,
        userId: user.id,
        role: AppUserRole.VOLUNTEER,
        preferredRole: input.preferredRole,
        availabilityDays: input.availabilityDays,
        canvassPrefs: buildCanvassPrefs(input),
      });
      if (!existing) {
        await this.outbox.append(tx, {
          tenantId: campaign.tenantId,
          eventType: "iam.user.created",
          aggregateId: user.id,
          payload: { userId: user.id, email: user.email, tenantId: campaign.tenantId },
        });
      }
      return user.id;
    });

    return this.grantSession(userId);
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
   * Public (phone-first): a prospect requests access by mobile number. Mirrors
   * requestAccess but keyed on the phone — find-or-create the user by `mobile`
   * (synthesised placeholder email, mobileVerified:false), upsert the join request
   * at "unverified", and send an SMS code. NO session, NO submitted event until the
   * code is confirmed. Never leaks whether the number already has an account.
   */
  async requestAccessByPhone(input: {
    phone: string;
    displayName: string;
    requestedRole: string;
    tenantSlug: string;
    signupSource?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrerChannel?: string;
  }): Promise<{ ok: true; alreadyMember?: boolean }> {
    const mobile = assertE164(input.phone);
    const slug = input.tenantSlug.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
    if (!tenant) throw new BadRequestException("Unknown organisation");

    const result = await this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { mobile } });
      if (user) {
        const member = await tx.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        });
        if (member) return { alreadyMember: true, userId: user.id };
      } else {
        user = await tx.user.create({
          data: {
            email: phonePlaceholderEmail(mobile),
            displayName: input.displayName.trim() || mobile,
            mobile,
            mobileVerified: false,
            signupSource: input.signupSource ?? "volunteer_request",
            utmSource: input.utmSource ?? null,
            utmMedium: input.utmMedium ?? null,
            utmCampaign: input.utmCampaign ?? null,
            referrerChannel: input.referrerChannel ?? null,
          },
        });
      }
      const existingReq = await tx.tenantJoinRequest.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      });
      if (!existingReq) {
        await tx.tenantJoinRequest.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            email: user.email,
            phone: mobile,
            requestedRole: input.requestedRole,
            status: "unverified",
          },
        });
      } else if (existingReq.status === "rejected") {
        await tx.tenantJoinRequest.update({
          where: { id: existingReq.id },
          data: { requestedRole: input.requestedRole, status: "unverified", decidedBy: null, decidedAt: null },
        });
      } else {
        await tx.tenantJoinRequest.update({
          where: { id: existingReq.id },
          data: { requestedRole: input.requestedRole },
        });
      }
      return { alreadyMember: false, userId: user.id };
    });

    if (result.alreadyMember) return { ok: true, alreadyMember: true };
    await this.sendMobileVerification(result.userId); // SMS the verification code
    return { ok: true };
  }

  /**
   * Public (phone-first): confirm the SMS code → mark the mobile verified and promote
   * the join request to "pending" (organiser queue) + emit submitted. Mirrors
   * confirmAccess; reuses confirmMobileVerification.
   */
  async confirmAccessByPhone(phone: string, code: string, tenantSlug: string): Promise<{ ok: true }> {
    const mobile = assertE164(phone);
    const slug = tenantSlug.trim().toLowerCase();
    const tenant = await this.prisma.tenant.findFirst({ where: { slug, deletedAt: null } });
    if (!tenant) throw new BadRequestException("Unknown organisation");
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user) throw new BadRequestException("Invalid or expired code");
    await this.confirmMobileVerification(user.id, code); // sets mobileVerified, throws on bad code
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

  // ── Super-admin signup approvals (new self-service workspaces) ────────
  /**
   * Pending new-workspace signups awaiting super-admin review. These are OWNER join requests on
   * member-less tenants created by the gated /auth/register path (SIGNUP_APPROVAL_REQUIRED) — the
   * `requestedRole = "OWNER"` marks them apart from ordinary organiser-approved join requests.
   */
  async listPendingSignups(): Promise<PendingSignup[]> {
    const rows = await this.prisma.tenantJoinRequest.findMany({
      where: { status: "pending", requestedRole: AppUserRole.OWNER, tenant: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      include: { tenant: { select: { name: true, slug: true } } },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, email: true, displayName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      requestId: r.id,
      tenantId: r.tenantId,
      orgName: r.tenant.name,
      slug: r.tenant.slug,
      email: byId.get(r.userId)?.email ?? r.email,
      displayName: byId.get(r.userId)?.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Super-admin: approve a pending signup → mint the OWNER membership (reuses approveJoinRequest,
   *  which emits tenant.join-request.approved → the "you're in" email). Role is fixed server-side. */
  async approveSignup(requestId: string, approvedBy?: string | null): Promise<{ ok: true }> {
    const req = await this.prisma.tenantJoinRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new BadRequestException("Signup request not found");
    return this.approveJoinRequest(req.tenantId, requestId, { role: AppUserRole.OWNER, approvedBy });
  }

  /**
   * Super-admin: reject a pending signup → completely undo it. The workspace was never activated
   * (member-less, no data), so it's hard-deleted — freeing its unique slug (a soft delete keeps the
   * row + its @unique slug, so the URL couldn't be reused). The cascade removes the pending join
   * request; the orphaned owner account is deleted too (when it has no other memberships/requests)
   * so the email is free to sign up again. Idempotent if the tenant is already gone.
   */
  async rejectSignup(requestId: string): Promise<{ ok: true }> {
    const req = await this.prisma.tenantJoinRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new BadRequestException("Signup request not found");
    await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: req.tenantId } });
      if (tenant) {
        await tx.tenant.delete({ where: { id: req.tenantId } }); // cascades the join request
        await this.outbox.append(tx, {
          tenantId: req.tenantId,
          eventType: "tenant.tenant.deleted",
          aggregateId: req.tenantId,
          payload: { tenantId: req.tenantId },
        });
      }
      const [memberships, otherRequests] = await Promise.all([
        tx.tenantMember.count({ where: { userId: req.userId } }),
        tx.tenantJoinRequest.count({ where: { userId: req.userId } }),
      ]);
      // Best-effort: never 500 the reject on an unexpected FK — the tenant removal is what matters.
      if (memberships === 0 && otherRequests === 0) {
        await tx.user.delete({ where: { id: req.userId } }).catch(() => undefined);
      }
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
