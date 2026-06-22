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
import { AppUserRole } from "@yarns/db";
import { APP_USER_ROLE_TO_ROLE } from "@yarns/permissions";
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
    const allowed = new Set(["/iam/sessions", "/api/v1/iam/sessions"]);
    return this.requestPathCandidates(request).some((c) => allowed.has(c));
  }

  /** Session token from the auth_token cookie or a (non-cron) Bearer header. */
  private getSessionToken(request: Request, authHeader?: string): string {
    if (authHeader?.startsWith("Bearer ")) return authHeader.slice("Bearer ".length);
    const cookie = request.headers.cookie;
    if (cookie) {
      for (const part of cookie.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === "auth_token") return decodeURIComponent(v.join("="));
      }
    }
    return "";
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
      "/api/v1/inbound-text-message-hook",
      "/api/v1/twilio-status-callback",
      "/api/v1/voice-status-callback",
      "/api/v1/email-webhook",
      "/api/v1/payment-webhook",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.method?.toUpperCase() === "OPTIONS") return true;
    if (this.isPublicWebhookPath(request)) return true;
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
    const sessionToken = this.getSessionToken(request, authHeader);
    if (sessionToken && this.sessions) {
      return this.authenticateSession(request, sessionToken);
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

    // Per-user login (canvassers/organisers) — only when a DB is wired. Without
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
    if (!membership) {
      throw new UnauthorizedException("User has no tenant membership");
    }
    request.user = {
      id: user.id,
      role: membership.role,
      tenantId: membership.tenantId,
      email: user.email,
      roles: rolesFor(membership.role),
      isSuperAdmin: false,
    };
    return true;
  }

  /** Authenticate via an opaque session token (cookie or Bearer). */
  private async authenticateSession(
    request: Request & { user?: AuthUser },
    token: string,
  ): Promise<boolean> {
    const resolved = await this.sessions!.resolve(token);
    if (!resolved) throw new UnauthorizedException("Invalid or expired session");
    request.user = {
      id: resolved.userId,
      role: resolved.role as AppUserRole,
      tenantId: resolved.tenantId,
      email: resolved.email,
      roles: rolesFor(resolved.role as AppUserRole),
      isSuperAdmin: false,
    };
    return true;
  }
}
