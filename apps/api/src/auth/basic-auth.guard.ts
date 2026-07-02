import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AppUserRole } from "@uprise/db";
import { APP_USER_ROLE_TO_ROLE } from "@uprise/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth-user";
import { SessionService } from "./session.service";
import { verifyPassword } from "./password.util";
import { resolveStreamTokenSecret } from "./stream-token-secret";
import { verifyStreamTokenDetailed } from "./stream-token";

/** Unified role ids for an AppUserRole-bearing membership (CASL roles[]). */
function rolesFor(role: AppUserRole): string[] {
  return [APP_USER_ROLE_TO_ROLE[role] ?? "member"];
}

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(BasicAuthGuard.name);
  private readonly loggedStreamFailures = new Set<string>();
  private warnedFallbackSecret = false;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly sessions?: SessionService,
  ) {}

  /** Auth endpoints that issue/clear sessions — reachable without a session. */
  private isAuthEndpointPath(request: Request): boolean {
    // Pre-session IAM flows (meld doc 14): they issue/complete a session, so they
    // must be reachable without one. NOTE: /iam/select-tenant is deliberately NOT
    // here — it requires an authenticated session.
    const exact = new Set([
      "/iam/sessions",
      "/iam/magic-link",
      "/iam/magic-link/consume",
      "/iam/forgot-password",
      "/iam/reset-password",
      "/iam/reset-password/verify",
      "/iam/verify-email/send",
      "/iam/verify-email/confirm",
      "/iam/2fa/send",
      "/iam/2fa/verify",
      "/iam/phone/start",
      "/iam/phone/resend",
      "/iam/phone/verify",
      "/auth/register", // self-service sign-up (meld doc 12) — issues the session
      "/auth/request-access", // self-signup → admin approval (issues NO session)
      "/auth/request-access/verify",
      "/auth/request-access/phone",
      "/auth/request-access/phone/verify",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some(
      (c) =>
        exact.has(c) ||
        exact.has(c.replace(/^\/api\/v1/, "")) ||
        // invite preview (GET /iam/invite/:token) + accept (POST /iam/invite/accept)
        /^(?:\/api\/v1)?\/iam\/invite\//.test(c) ||
        // tokenless open-join (preview + phone/start + accept) — gated by the campaign flag
        /^(?:\/api\/v1)?\/iam\/open-join\//.test(c),
    );
  }

  /**
   * Candidate session tokens, in priority order: a (non-cron) Bearer header wins,
   * otherwise every `auth_token` cookie value. The browser can hold more than one
   * `auth_token` — e.g. a stale host-only cookie left over from an earlier
   * cookie-domain config shadowing the current parent-domain one — and sends them
   * all in the Cookie header. We must try each, not just the first, or a stale
   * token shadows a valid session and yields a spurious 401.
   */
  private getSessionTokens(request: Request, authHeader?: string): string[] {
    if (authHeader?.startsWith("Bearer ")) return [authHeader.slice("Bearer ".length)];
    const cookie = request.headers.cookie;
    const tokens: string[] = [];
    if (cookie) {
      for (const part of cookie.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === "auth_token") {
          const value = decodeURIComponent(v.join("="));
          if (value) tokens.push(value);
        }
      }
    }
    return tokens;
  }

  private requestPathCandidates(request: Request): string[] {
    return [request.originalUrl, request.url]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split("?")[0]);
  }

  private isAnalyticsStreamPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/analytics/stream",
      "/api/v1/analytics/stream",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  private getStreamTokenFromQuery(request: Request): string {
    const rawToken = request.query?.token;
    return typeof rawToken === "string"
      ? rawToken
      : Array.isArray(rawToken) && typeof rawToken[0] === "string"
        ? rawToken[0]
        : "";
  }

  private hasValidStreamToken(request: Request): boolean {
    const { secret, source } = resolveStreamTokenSecret(this.config);
    const queryToken = this.getStreamTokenFromQuery(request);
    const result = verifyStreamTokenDetailed(queryToken, secret);
    if (!result.ok) {
      const reason =
        result.reason === "missing_secret"
          ? `missing_secret(source=${source || "none"})`
          : result.reason;
      if (!this.loggedStreamFailures.has(reason)) {
        this.logger.warn(`Denied analytics stream token: ${reason}`);
        this.loggedStreamFailures.add(reason);
      }
      return false;
    }
    if (source !== "STREAM_TOKEN_SECRET" && !this.warnedFallbackSecret) {
      this.logger.warn(
        "Analytics stream token accepted with fallback secret source INTEGRATION_CREDENTIAL_SECRET",
      );
      this.warnedFallbackSecret = true;
    }
    return true;
  }

  private isCronDispatchPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/blasts/dispatch-due",
      "/api/v1/blasts/dispatch-due",
      "/audiences/dispatch-imports",
      "/api/v1/audiences/dispatch-imports",
      "/journeys/sweep-due",
      "/api/v1/journeys/sweep-due",
      "/telephony/provisioning/poll",
      "/api/v1/telephony/provisioning/poll",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  private isPublicWebhookPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/inbound-text-message-hook",
      "/twilio-status-callback",
      "/voice-status-callback",
      "/email-webhook",
      "/payment-webhook",
      "/telephony/bundle-status-callback",
      "/api/v1/inbound-text-message-hook",
      "/api/v1/twilio-status-callback",
      "/api/v1/voice-status-callback",
      "/api/v1/email-webhook",
      "/api/v1/payment-webhook",
      "/api/v1/telephony/bundle-status-callback",
      // Public marketing-site form intake (meld doc 12).
      "/marketing/contact",
      "/marketing/demo-request",
      "/marketing/newsletter",
      "/api/v1/marketing/contact",
      "/api/v1/marketing/demo-request",
      "/api/v1/marketing/newsletter",
      // Public slug pre-check for the sign-up UI (meld doc 12).
      "/tenants/availability",
      "/api/v1/tenants/availability",
      // Public tenant brand by slug for the volunteer auth panel.
      "/tenants/brand",
      "/api/v1/tenants/brand",
      // Public pricing — visible plans for the marketing site (no auth).
      "/plans/public",
      "/api/v1/plans/public",
      // Public health check for uptime monitoring (no auth).
      "/health",
      "/api/v1/health",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  /**
   * DEV-ONLY: the on-screen OTP hint endpoint (GET /iam/dev/otp), reachable
   * pre-session in development so the SMS-code screens can show the code when no
   * real SMS is sent. Never allowlisted in production (the handler also returns null).
   */
  private isDevOtpPeekPath(request: Request): boolean {
    if (this.config.get<string>("NODE_ENV") === "production") return false;
    const candidates = this.requestPathCandidates(request);
    return candidates.some((c) => c === "/iam/dev/otp" || c === "/api/v1/iam/dev/otp");
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.method?.toUpperCase() === "OPTIONS") return true;
    if (this.isPublicWebhookPath(request)) return true;
    if (this.isDevOtpPeekPath(request)) return true; // dev-only OTP hint (non-prod)
    if (this.isAuthEndpointPath(request)) return true; // login/logout issue the session
    if (this.isAnalyticsStreamPath(request) && this.hasValidStreamToken(request)) return true;

    const authHeader = request.headers.authorization;
    if (this.isCronDispatchPath(request) && authHeader?.startsWith("Bearer ")) {
      const expected = this.config.get<string>("CRON_SECRET");
      const token = authHeader.slice("Bearer ".length);
      if (!expected || token !== expected) {
        throw new UnauthorizedException("Invalid cron bearer token");
      }
      return true;
    }

    // Session token (cookie or non-cron Bearer) — the standard login path once
    // the auth frontend (meld doc 14) is wired. Basic auth remains as a fallback.
    const sessionTokens = this.getSessionTokens(request, authHeader);
    if (sessionTokens.length > 0 && this.sessions) {
      return this.authenticateSession(request, sessionTokens);
    }

    if (!authHeader?.startsWith("Basic ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header");
    }

    const expectedUser = this.config.get<string>("BASIC_AUTH_USERNAME");
    const expectedPassword = this.config.get<string>("BASIC_AUTH_PASSWORD");

    const base64Credentials = authHeader.slice(6);
    let credentials: string;
    try {
      credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
    } catch {
      throw new UnauthorizedException("Invalid Authorization header");
    }

    const [username, password] = credentials.split(":", 2);

    // Env super-admin: the original single-credential organiser login, unchanged.
    if (expectedUser && expectedPassword && username === expectedUser && password === expectedPassword) {
      request.user = {
        id: "env-admin",
        role: AppUserRole.ORGANISER,
        tenantId: null,
        email: username,
        roles: ["super-admin"],
        isSuperAdmin: true,
      };
      return true;
    }

    // Per-user login (volunteers/organisers) — only when a DB is wired. Without
    // prisma we preserve the original synchronous behaviour exactly.
    if (this.prisma) {
      return this.authenticateAppUser(request, username, password);
    }

    if (!expectedUser || !expectedPassword) {
      throw new UnauthorizedException("Basic auth is not configured");
    }
    throw new UnauthorizedException("Invalid username or password");
  }

  private async authenticateAppUser(
    request: Request & { user?: AuthUser },
    username: string,
    password: string,
  ): Promise<boolean> {
    const user = await this.prisma!.user.findUnique({ where: { email: username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid username or password");
    }
    // Identity (User) and membership (TenantMember) are separate: resolve the
    // user's tenant + role from their membership. A user with no membership
    // cannot act in any tenant.
    const membership = await this.prisma!.tenantMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    // A super-admin (DB flag) can act with no membership; everyone else needs one.
    if (!membership && !user.isSuperAdmin) {
      throw new UnauthorizedException("User has no tenant membership");
    }
    const isSuper = user.isSuperAdmin === true;
    const baseRoles = membership ? rolesFor(membership.role) : [];
    request.user = {
      id: user.id,
      role: membership?.role ?? AppUserRole.OWNER,
      tenantId: membership?.tenantId ?? null,
      email: user.email,
      roles: isSuper ? [...baseRoles, "super-admin"] : baseRoles,
      isSuperAdmin: isSuper,
    };
    return true;
  }

  /**
   * Authenticate via opaque session tokens (cookie or Bearer). Tries each
   * candidate in order and authenticates with the first that resolves, so a stale
   * duplicate `auth_token` cookie can't shadow a valid one (see getSessionTokens).
   */
  private async authenticateSession(
    request: Request & { user?: AuthUser },
    tokens: string[],
  ): Promise<boolean> {
    const meta = {
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: request.ip ?? request.socket?.remoteAddress ?? null,
    };
    let resolved = null;
    for (const token of tokens) {
      resolved = await this.sessions!.resolve(token, meta);
      if (resolved) break;
    }
    if (!resolved) throw new UnauthorizedException("Invalid or expired session");
    const isSuper = resolved.isSuperAdmin === true;
    const baseRoles = rolesFor(resolved.role as AppUserRole);
    request.user = {
      id: resolved.userId,
      role: resolved.role as AppUserRole,
      tenantId: resolved.tenantId,
      email: resolved.email,
      roles: isSuper ? [...baseRoles, "super-admin"] : baseRoles,
      isSuperAdmin: isSuper,
    };
    return true;
  }
}
