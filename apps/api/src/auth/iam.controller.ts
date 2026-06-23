import { Body, Controller, Delete, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { SessionService } from "./session.service";
import { IamFlowsService } from "./iam-flows.service";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie.util";

/**
 * Session endpoints backing the standalone auth frontend (meld doc 14). Login
 * verifies a password and issues an httpOnly parent-domain session cookie (SSO);
 * a 2FA-enabled user gets a challenge instead. Logout revokes the session. Both
 * are reachable without a prior session (allowlisted in the auth guard).
 */
@Controller("iam")
export class IamController {
  constructor(
    private readonly sessions: SessionService,
    private readonly flows: IamFlowsService,
    private readonly config: ConfigService,
  ) {}

  @Post("sessions")
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.flows.signIn(body.email, body.password);
    if (result.kind === "invalid") throw new UnauthorizedException("Invalid email or password");
    if (result.kind === "no-membership") throw new UnauthorizedException("User has no tenant membership");
    if (result.kind === "twofa") return { twofaRequired: true, challengeId: result.challengeId };

    setSessionCookie(res, this.config, result.token, result.expiresAt);
    return {
      token: result.token,
      user: {
        id: result.userId,
        email: result.email,
        role: result.memberships[0].role,
        tenantId: result.memberships[0].tenantId,
      },
      memberships: result.memberships,
    };
  }

  @Delete("sessions")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(readSessionToken(req) ?? "");
    clearSessionCookie(res, this.config);
    return { ok: true };
  }
}
