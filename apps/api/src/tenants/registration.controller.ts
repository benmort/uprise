import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { RegistrationService } from "./registration.service";
import { IamFlowsService } from "../auth/iam-flows.service";
import { SessionService } from "../auth/session.service";
import { setSessionCookie } from "../auth/session-cookie.util";
import { requestMeta } from "../auth/request-meta";
import {
  ConfirmAccessByPhoneDto,
  ConfirmAccessDto,
  RegisterDto,
  RequestAccessByPhoneDto,
  RequestAccessDto,
} from "./dto/tenants.dto";
import { RequireCaptcha } from "../common/captcha/require-captcha.decorator";

/**
 * Self-service sign-up (meld doc 12). Public (pre-session, allowlisted in the guard) — it
 * CREATES the session. The target of the auth app's /sign-up and the marketing /sign-up redirect.
 * Also hosts the request-access flow (self-signup → admin approval; the inverse of invite) —
 * those issue NO session (the prospect can't log in until an organiser approves them).
 */
@Controller("auth")
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly flows: IamFlowsService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  @RequireCaptcha("strict")
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const grant = await this.registration.register(dto);
    // Log the sign-up device (IP + user agent) — surfaced under Active sessions.
    await this.sessions.stampLoginMeta(grant.token, requestMeta(req));
    setSessionCookie(res, this.config, grant.token, grant.expiresAt);
    return {
      token: grant.token,
      user: { id: grant.userId, tenantId: grant.tenantId, memberships: grant.memberships },
      memberships: grant.memberships,
    };
  }

  @RequireCaptcha("strict")
  @Post("request-access")
  requestAccess(@Body() dto: RequestAccessDto) {
    return this.flows.requestAccess(dto);
  }

  @Post("request-access/verify")
  confirmAccess(@Body() dto: ConfirmAccessDto) {
    return this.flows.confirmAccess(dto.email, dto.code, dto.tenantSlug);
  }

  // ── Phone-first self-signup → admin approval (volunteers) ───────────
  @RequireCaptcha("strict")
  @Post("request-access/phone")
  requestAccessByPhone(@Body() dto: RequestAccessByPhoneDto) {
    return this.flows.requestAccessByPhone(dto);
  }

  @Post("request-access/phone/verify")
  confirmAccessByPhone(@Body() dto: ConfirmAccessByPhoneDto) {
    return this.flows.confirmAccessByPhone(dto.phone, dto.code, dto.tenantSlug);
  }
}
