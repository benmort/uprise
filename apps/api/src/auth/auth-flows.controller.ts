import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { IamFlowsService, type SessionGrant } from "./iam-flows.service";
import { SessionService } from "./session.service";
import type { AuthUser } from "./auth-user";
import { readSessionToken, setSessionCookie } from "./session-cookie.util";
import { requestMeta } from "./request-meta";
import { RequireCaptcha } from "../common/captcha/require-captcha.decorator";
import {
  AcceptInviteDto,
  ConfirmEmailDto,
  EmailDto,
  InviteStartPhoneDto,
  OpenJoinAcceptDto,
  OpenJoinStartPhoneDto,
  PhoneResendDto,
  PhoneStartDto,
  PhoneVerifyDto,
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
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  private async grantResponse(req: Request, res: Response, grant: SessionGrant) {
    // Log the login device (IP + user agent) on the freshly-issued session —
    // surfaced under Active sessions on the security page.
    await this.sessions.stampLoginMeta(grant.token, requestMeta(req));
    setSessionCookie(res, this.config, grant.token, grant.expiresAt);
    return {
      token: grant.token,
      user: { id: grant.userId, memberships: grant.memberships },
      memberships: grant.memberships,
    };
  }

  // DEV-ONLY: surface the SMS code on the OTP screens when no real SMS is sent in
  // local development. Hard-gated to non-production in the service + BasicAuthGuard.
  @Get("dev/otp")
  devPeekOtp(@Query("challengeId") challengeId?: string) {
    return this.flows.devPeekOtp(challengeId ?? "");
  }

  @RequireCaptcha("soft")
  @Post("magic-link")
  requestMagicLink(@Body() dto: EmailDto) {
    return this.flows.requestMagicLink(dto.email);
  }

  @Post("magic-link/consume")
  async consumeMagicLink(@Body() dto: TokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.grantResponse(req, res, await this.flows.consumeMagicLink(dto.token));
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
  async verify2fa(@Body() dto: TwofaVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.grantResponse(req, res, await this.flows.verify2fa(dto.challengeId, dto.code));
  }

  // ── Phone-first passwordless login (volunteers/canvassers) ──────────────
  @RequireCaptcha("strict")
  @Post("phone/start")
  startPhoneLogin(@Body() dto: PhoneStartDto) {
    return this.flows.startPhoneLogin(dto.phone);
  }

  @RequireCaptcha("strict")
  @Post("phone/resend")
  resendPhoneLogin(@Body() dto: PhoneResendDto) {
    return this.flows.resendPhoneLogin(dto.challengeId);
  }

  @Post("phone/verify")
  async verifyPhoneLogin(@Body() dto: PhoneVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.grantResponse(req, res, await this.flows.verifyPhoneLogin(dto.challengeId, dto.code));
  }

  /** Check an OTP mid-flow (onboarding wizard) — validates the code, issues NO session. */
  @Post("phone/check")
  checkPhoneCode(@Body() dto: PhoneVerifyDto) {
    return this.flows.verifyPhoneCode(dto.challengeId, dto.code);
  }

  @Get("invite/:token")
  previewInvite(@Param("token") token: string) {
    return this.flows.previewInvite(token);
  }

  // Send an OTP to an invited number (onboarding wizard). Token-gated; the invite
  // authorises the SMS to a not-yet-registered number.
  @RequireCaptcha("strict")
  @Post("invite/phone/start")
  inviteStartPhone(@Body() dto: InviteStartPhoneDto) {
    return this.flows.inviteStartPhone(dto.token, dto.phone);
  }

  @Post("invite/accept")
  async acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const grant = await this.flows.acceptInvite(dto.token, {
      displayName: dto.displayName,
      password: dto.password,
      challengeId: dto.challengeId,
      code: dto.code,
      preferredRole: dto.preferredRole,
      availabilityDays: dto.availabilityDays,
      walkingCapability: dto.walkingCapability,
      sessionLength: dto.sessionLength,
    });
    return this.grantResponse(req, res, grant);
  }

  @Post("invite/decline")
  declineInvite(@Body() dto: TokenDto) {
    return this.flows.declineInvite(dto.token);
  }

  // ── Tokenless open-join (per-campaign master switch) ────────────────────
  // Same onboarding wizard as the invite path, but gated by the campaign's
  // openJoinEnabled flag instead of a token. Reachable pre-session (allowlisted).
  // Declared BEFORE the :campaignId route so the static path wins over the param
  // (else "opportunities" would be read as a campaignId). Matches the pre-session
  // /iam/open-join/ allowlist.
  @Get("open-join/opportunities")
  openJoinList(@Query("tenant") tenantSlug?: string) {
    return this.flows.openJoinList(tenantSlug);
  }

  @Get("open-join/:campaignId")
  openJoinPreview(@Param("campaignId") campaignId: string) {
    return this.flows.openJoinPreview(campaignId);
  }

  @RequireCaptcha("strict")
  @Post("open-join/phone/start")
  openJoinStartPhone(@Body() dto: OpenJoinStartPhoneDto) {
    return this.flows.openJoinStartPhone(dto.campaignId, dto.phone);
  }

  @Post("open-join/accept")
  async openJoinAccept(@Body() dto: OpenJoinAcceptDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const grant = await this.flows.openJoinAccept(dto.campaignId, {
      challengeId: dto.challengeId,
      code: dto.code,
      displayName: dto.displayName,
      preferredRole: dto.preferredRole,
      availabilityDays: dto.availabilityDays,
      walkingCapability: dto.walkingCapability,
      sessionLength: dto.sessionLength,
    });
    return this.grantResponse(req, res, grant);
  }

  @Post("select-tenant")
  async selectTenant(
    @Body() dto: SelectTenantDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const userId = req.user?.id;
    // Pin the SAME session the guard authenticated (req.user.sessionToken), not the
    // first auth_token cookie — a stale duplicate cookie would otherwise get the pin
    // while /auth/check keeps reading the real session (tenant switch never sticks).
    const token = req.user?.sessionToken ?? readSessionToken(req);
    if (!userId || !token) throw new UnauthorizedException("Authentication required");
    return this.flows.selectTenant(userId, token, dto.tenantId);
  }
}
