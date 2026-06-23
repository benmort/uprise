import { Body, Controller, Post, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { RegistrationService } from "./registration.service";
import { setSessionCookie } from "../auth/session-cookie.util";
import { RegisterDto } from "./dto/tenants.dto";

/**
 * Self-service sign-up (meld doc 12). Public (pre-session, allowlisted in the guard) — it
 * CREATES the session. The target of the auth app's /sign-up and the marketing /sign-up redirect.
 */
@Controller("auth")
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const grant = await this.registration.register(dto);
    setSessionCookie(res, this.config, grant.token, grant.expiresAt);
    return {
      token: grant.token,
      user: { id: grant.userId, tenantId: grant.tenantId, memberships: grant.memberships },
      memberships: grant.memberships,
    };
  }
}
