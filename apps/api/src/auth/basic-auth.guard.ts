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
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "./auth-user";
import { verifyPassword } from "./password.util";
import { resolveStreamTokenSecret } from "./stream-token-secret";
import { verifyStreamTokenDetailed } from "./stream-token";

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(BasicAuthGuard.name);
  private readonly loggedStreamFailures = new Set<string>();
  private warnedFallbackSecret = false;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

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
      "/api/v1/inbound-text-message-hook",
      "/api/v1/twilio-status-callback",
    ]);
    const candidates = this.requestPathCandidates(request);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.method?.toUpperCase() === "OPTIONS") return true;
    if (this.isPublicWebhookPath(request)) return true;
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
      request.user = { id: "env-admin", role: AppUserRole.ORGANISER, organizationId: null, email: username };
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
    const user = await this.prisma!.appUser.findUnique({ where: { email: username } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid username or password");
    }
    request.user = {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      email: user.email,
    };
    return true;
  }
}
