import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { IamFlowsService, type SessionGrant } from "./iam-flows.service";
import type { AuthUser } from "./auth-user";
import { readSessionToken, setSessionCookie } from "./session-cookie.util";
import { RequireCaptcha } from "../common/captcha/require-captcha.decorator";
import {
  AcceptInviteDto,
  ConfirmEmailDto,
  EmailDto,
  ResetPasswordDto,
  SelectTenantDto,
  TokenDto,
  TwofaSendDto,
  TwofaVerifyDto,
} from "./dto/auth-flows.dto";

/**
 * IAM auth flows (meld doc 14) backing the standalone auth frontend. Pre-session
 * flows are allowlisted in BasicAuthGuard; select-tenant requires a session.
 * Grants set the parent-domain session cookie (SSO).
 */
@Controller("iam")
export class AuthFlowsController {
  constructor(
    private readonly flows: IamFlowsService,
    private readonly config: ConfigService,
  ) {}

  private grantResponse(res: Response, grant: SessionGrant) {
    setSessionCookie(res, this.config, grant.token, grant.expiresAt);
    return {
      token: grant.token,
      user: { id: grant.userId, memberships: grant.memberships },
      memberships: grant.memberships,
    };
  }

  @RequireCaptcha("soft")
  @Post("magic-link")
  requestMagicLink(@Body() dto: EmailDto) {
    return this.flows.requestMagicLink(dto.email);
  }

  @Post("magic-link/consume")
  async consumeMagicLink(@Body() dto: TokenDto, @Res({ passthrough: true }) res: Response) {
    return this.grantResponse(res, await this.flows.consumeMagicLink(dto.token));
  }

  @RequireCaptcha("soft")
  @Post("forgot-password")
  forgotPassword(@Body() dto: EmailDto) {
    return this.flows.forgotPassword(dto.email);
  }

  @RequireCaptcha("soft")
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.flows.resetPassword(dto.token, dto.password);
  }

  @Post("reset-password/verify")
  verifyResetToken(@Body() dto: TokenDto) {
    return this.flows.verifyResetToken(dto.token);
  }

  @RequireCaptcha("soft")
  @Post("verify-email/send")
  sendEmailVerification(@Body() dto: EmailDto) {
    return this.flows.sendEmailVerification(dto.email);
  }

  @Post("verify-email/confirm")
  confirmEmailVerification(@Body() dto: ConfirmEmailDto) {
    return this.flows.confirmEmailVerification(dto.email, dto.code);
  }

  @RequireCaptcha("strict")
  @Post("2fa/send")
  resend2fa(@Body() dto: TwofaSendDto) {
    return this.flows.resend2fa(dto.challengeId);
  }

  @Post("2fa/verify")
  async verify2fa(@Body() dto: TwofaVerifyDto, @Res({ passthrough: true }) res: Response) {
    return this.grantResponse(res, await this.flows.verify2fa(dto.challengeId, dto.code));
  }

  @Get("invite/:token")
  previewInvite(@Param("token") token: string) {
    return this.flows.previewInvite(token);
  }

  @Post("invite/accept")
  async acceptInvite(@Body() dto: AcceptInviteDto, @Res({ passthrough: true }) res: Response) {
    const grant = await this.flows.acceptInvite(dto.token, {
      displayName: dto.displayName,
      password: dto.password,
    });
    return this.grantResponse(res, grant);
  }

  @Post("invite/decline")
  declineInvite(@Body() dto: TokenDto) {
    return this.flows.declineInvite(dto.token);
  }

  @Post("select-tenant")
  async selectTenant(
    @Body() dto: SelectTenantDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const userId = req.user?.id;
    const token = readSessionToken(req);
    if (!userId || !token) throw new UnauthorizedException("Authentication required");
    return this.flows.selectTenant(userId, token, dto.tenantId);
  }
}
