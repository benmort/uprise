import { Body, Controller, Delete, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "./session.service";
import { verifyPassword } from "./password.util";

const COOKIE = "auth_token";

/**
 * Session endpoints backing the standalone auth frontend (meld doc 14). Login
 * verifies a password and issues an httpOnly session cookie; logout revokes it.
 * Both are reachable without a prior session (allowlisted in the auth guard).
 */
@Controller("iam")
export class IamController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
  ) {}

  private cookieOpts(expires?: Date) {
    const secure = this.config.get<string>("NODE_ENV") === "production";
    return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", ...(expires ? { expires } : {}) };
  }

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
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) throw new UnauthorizedException("User has no tenant membership");

    const { token, expiresAt } = await this.sessions.create(user.id);
    res.cookie(COOKIE, token, this.cookieOpts(expiresAt));
    return {
      token,
      user: { id: user.id, email: user.email, role: membership.role, tenantId: membership.tenantId },
    };
  }

  @Delete("sessions")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromCookie = req.headers.cookie
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length)
      : undefined;
    await this.sessions.revoke(fromCookie ? decodeURIComponent(fromCookie) : bearer ?? "");
    res.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  }
}
