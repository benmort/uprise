import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createStreamToken } from "./stream-token";

@Controller("auth")
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Get("check")
  check() {
    return { ok: true };
  }

  @Get("stream-token")
  streamToken() {
    const fallbackSecret = this.config.get<string>("INTEGRATION_CREDENTIAL_SECRET", "");
    const secret = this.config.get<string>("STREAM_TOKEN_SECRET", fallbackSecret);
    const ttlRaw = Number(this.config.get<string>("STREAM_TOKEN_TTL_SECONDS", "43200"));
    const ttlSeconds = Number.isFinite(ttlRaw) ? Math.min(Math.max(60, Math.trunc(ttlRaw)), 86400) : 43200;
    const issued = createStreamToken(secret, ttlSeconds);
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  }
}
