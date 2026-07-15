import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthUser } from "./auth-user";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { SessionService } from "./session.service";
import { IamFlowsService } from "./iam-flows.service";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie.util";
import { requestMeta } from "./request-meta";
import { RequireCaptcha } from "../common/captcha/require-captcha.decorator";

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

  @RequireCaptcha("soft")
  @Post("sessions")
  async login(
    @Body() body: { email?: string; password?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.flows.signIn(body.email, body.password);
    if (result.kind === "invalid") throw new UnauthorizedException("Invalid email or password");
    if (result.kind === "pending") {
      throw new ForbiddenException("Your request to join is awaiting approval by an organiser.");
    }
    if (result.kind === "no-membership") throw new UnauthorizedException("User has no tenant membership");
    if (result.kind === "twofa") return { twofaRequired: true, challengeId: result.challengeId };

    // Log the login device (IP + user agent) — surfaced under Active sessions.
    await this.sessions.stampLoginMeta(result.token, requestMeta(req));
    setSessionCookie(res, this.config, result.token, result.expiresAt);
    return {
      token: result.token,
      user: {
        // A super-admin may sign in with zero tenant memberships, so guard the [0]
        // access; mirror session.service's fallback (role OWNER, no active tenant).
        id: result.userId,
        email: result.email,
        role: result.memberships[0]?.role ?? "OWNER",
        tenantId: result.memberships[0]?.tenantId ?? null,
      },
      memberships: result.memberships,
    };
  }

  @Delete("sessions")
  async logout(@Req() req: Request & { user?: AuthUser }, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(this.currentToken(req));
    clearSessionCookie(res, this.config);
    return { ok: true };
  }

  // ── Active-sessions management (self-scoped; needs a session) ──────────
  // Path is /iam/my-sessions to avoid the allowlisted /iam/sessions auth path.
  private userId(req: Request & { user?: AuthUser }): string {
    const id = req.user?.id;
    if (!id) throw new UnauthorizedException("Authentication required");
    return id;
  }

  /** The token of the session THIS request authenticated with (AuthUser.sessionToken) —
   *  falls back to the first auth_token cookie only when the guard recorded none. Using the
   *  resolved token keeps "current session" correct when a stale duplicate cookie is present. */
  private currentToken(req: Request & { user?: AuthUser }): string {
    return req.user?.sessionToken ?? readSessionToken(req) ?? "";
  }

  @Get("my-sessions")
  listSessions(@Req() req: Request & { user?: AuthUser }) {
    return this.sessions.listForUser(this.userId(req), this.currentToken(req));
  }

  @Delete("my-sessions/:id")
  async revokeSession(@Req() req: Request & { user?: AuthUser }, @Param("id") id: string) {
    await this.sessions.revokeById(this.userId(req), id);
    return { ok: true };
  }

  @Post("my-sessions/revoke-others")
  async revokeOtherSessions(@Req() req: Request & { user?: AuthUser }) {
    await this.sessions.revokeOthers(this.userId(req), this.currentToken(req));
    return { ok: true };
  }
}
