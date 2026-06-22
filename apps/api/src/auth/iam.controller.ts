import { Body, Controller, Delete, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "./session.service";
import { IamFlowsService } from "./iam-flows.service";
import { verifyPassword } from "./password.util";
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
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly flows: IamFlowsService,
    private readonly config: ConfigService,
  ) {}

  @Post("sessions")
  async login(
    @Body() body: { email?: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const email = body.email?.trim().toLowerCase();
    const user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !(await verifyPassword(body.password ?? "", user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const memberships = await this.flows.membershipsFor(user.id);
    if (memberships.length === 0) throw new UnauthorizedException("User has no tenant membership");

    // 2FA-enabled users complete login via POST /iam/2fa/verify; no session yet.
    if (user.twofaEnabled) {
      const { challengeId } = await this.flows.start2fa(user.id);
      return { twofaRequired: true, challengeId };
    }

    const { token, expiresAt } = await this.sessions.create(user.id);
    setSessionCookie(res, this.config, token, expiresAt);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: memberships[0].role,
        tenantId: memberships[0].tenantId,
      },
      memberships,
    };
  }

  @Delete("sessions")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(readSessionToken(req) ?? "");
    clearSessionCookie(res, this.config);
    return { ok: true };
  }
}
