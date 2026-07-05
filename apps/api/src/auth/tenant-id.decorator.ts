import { createParamDecorator, ExecutionContext, ForbiddenException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./auth-user";

/**
 * Resolves the caller's active tenant from the authenticated session
 * (`req.user.tenantId`, set by BasicAuthGuard and switchable via session.setTenant).
 *
 * Fails closed: a request with no active tenant is rejected rather than falling back to
 * a default org. Super-admins "acting as" a tenant carry that tenant in `req.user.tenantId`
 * (pinned via the switcher), so this works for them too; a super-admin who has not selected
 * a tenant is rejected until they do.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new ForbiddenException("No active tenant");
  return tenantId;
});
