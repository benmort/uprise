import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { verifyStreamToken } from "./stream-token";

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  private isAnalyticsStreamPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/analytics/stream",
      "/api/v1/analytics/stream",
    ]);
    const candidates = [request.path, request.originalUrl, request.url]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split("?")[0]);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  private hasValidStreamToken(request: Request): boolean {
    const fallbackSecret = this.config.get<string>("INTEGRATION_CREDENTIAL_SECRET", "");
    const secret = this.config.get<string>("STREAM_TOKEN_SECRET", fallbackSecret);
    const rawToken = request.query?.token;
    const queryToken =
      typeof rawToken === "string"
        ? rawToken
        : Array.isArray(rawToken) && typeof rawToken[0] === "string"
          ? rawToken[0]
          : "";
    return verifyStreamToken(queryToken, secret);
  }

  private isCronDispatchPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/blasts/dispatch-due",
      "/api/v1/blasts/dispatch-due",
    ]);
    const candidates = [request.path, request.originalUrl, request.url]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split("?")[0]);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  private isPublicWebhookPath(request: Request): boolean {
    const allowedPaths = new Set([
      "/inbound-text-message-hook",
      "/api/v1/inbound-text-message-hook",
    ]);
    const candidates = [request.path, request.originalUrl, request.url]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.split("?")[0]);
    return candidates.some((candidate) => allowedPaths.has(candidate));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
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
    if (!expectedUser || !expectedPassword) {
      throw new UnauthorizedException("Basic auth is not configured");
    }

    const base64Credentials = authHeader.slice(6);
    let credentials: string;
    try {
      credentials = Buffer.from(base64Credentials, "base64").toString("utf8");
    } catch {
      throw new UnauthorizedException("Invalid Authorization header");
    }

    const [username, password] = credentials.split(":", 2);
    if (username !== expectedUser || password !== expectedPassword) {
      throw new UnauthorizedException("Invalid username or password");
    }
    return true;
  }
}
