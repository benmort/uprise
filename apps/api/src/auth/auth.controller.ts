import { Controller, Get, InternalServerErrorException, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AuthUser } from "./auth-user";
import { IamFlowsService } from "./iam-flows.service";
import { createStreamToken } from "./stream-token";
import { resolveStreamTokenSecret } from "./stream-token-secret";
import { RequirePermission } from "./require-permission.decorator";
import { TenantId } from "./tenant-id.decorator";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly flows: IamFlowsService,
  ) {}

  @Get("check")
  async check(@Req() req: Request & { user?: AuthUser }) {
    // BasicAuthGuard attaches the principal. Frontends read this to learn the
    // user's id + active role/tenant and whether to offer tenant selection.
    if (!req.user) return { ok: true, user: null };
    const [memberships, flags] = await Promise.all([
      this.flows.membershipsFor(req.user.id),
      this.flows.userFlags(req.user.id),
    ]);
    // When the active tenant isn't one of the user's memberships, surface its name/slug
    // so the switcher + shell can label it. This is the super-admin "acting as" case
    // (they have no membership in the tenant they've pinned); null for ordinary users.
    const activeTenantId = req.user.tenantId;
    const activeTenant =
      activeTenantId && !memberships.some((m) => m.tenantId === activeTenantId)
        ? await this.flows.tenantSummary(activeTenantId)
        : null;
    return {
      ok: true,
      user: {
        id: req.user.id,
        role: req.user.role,
        tenantId: req.user.tenantId,
        email: req.user.email ?? null,
        isSuperAdmin: req.user.isSuperAdmin,
        memberships,
        activeTenant,
        ...flags,
      },
    };
  }

  // Mints the SSE stream token, bound to the caller's tenant so the stream is filtered to it.
  // Gated on analytics read (the stream only carries analytics/inbox events) + a live tenant.
  @Get("stream-token")
  @RequirePermission({ action: "read", resource: "analytics.all" })
  streamToken(@TenantId() tenantId: string) {
    const { secret } = resolveStreamTokenSecret(this.config);
    if (!secret) {
      throw new InternalServerErrorException("Stream token secret is not configured");
    }
    const ttlRaw = Number(this.config.get<string>("STREAM_TOKEN_TTL_SECONDS", "43200"));
    const ttlSeconds = Number.isFinite(ttlRaw) ? Math.min(Math.max(60, Math.trunc(ttlRaw)), 86400) : 43200;
    const issued = createStreamToken(secret, ttlSeconds, tenantId);
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
    };
  }
}
