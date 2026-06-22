import { Controller, Get, InternalServerErrorException, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AuthUser } from "./auth-user";
import { IamFlowsService } from "./iam-flows.service";
import { createStreamToken } from "./stream-token";
import { resolveStreamTokenSecret } from "./stream-token-secret";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly flows: IamFlowsService,
  ) {}

  @Get("check")
  async check(@Req() req: Request & { user?: AuthUser }) {
    // BasicAuthGuard attaches the principal. Frontends read this to learn the
    // user's id + active role/tenant and whether to offer tenant selection.
    if (!req.user) return { ok: true, user: null };
    const memberships = await this.flows.membershipsFor(req.user.id);
    return {
      ok: true,
      user: {
        id: req.user.id,
        role: req.user.role,
        tenantId: req.user.tenantId,
        email: req.user.email ?? null,
        memberships,
      },
    };
  }

  @Get("stream-token")
  streamToken() {
    const { secret } = resolveStreamTokenSecret(this.config);
    if (!secret) {
      throw new InternalServerErrorException("Stream token secret is not configured");
    }
    const ttlRaw = Number(this.config.get<string>("STREAM_TOKEN_TTL_SECONDS", "43200"));
    const ttlSeconds = Number.isFinite(ttlRaw) ? Math.min(Math.max(60, Math.trunc(ttlRaw)), 86400) : 43200;
    const issued = createStreamToken(secret, ttlSeconds);
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  }
}
