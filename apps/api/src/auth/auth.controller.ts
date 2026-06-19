import { Controller, Get, InternalServerErrorException, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AuthUser } from "./auth-user";
import { createStreamToken } from "./stream-token";
import { resolveStreamTokenSecret } from "./stream-token-secret";

@Controller("auth")
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Get("check")
  check(@Req() req: Request & { user?: AuthUser }) {
    // BasicAuthGuard attaches the principal. The web login reads this to learn
    // the user's id + role (e.g. to store the canvasser id for the field app).
    return {
      ok: true,
      user: req.user
        ? { id: req.user.id, role: req.user.role, organizationId: req.user.organizationId }
        : null,
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
