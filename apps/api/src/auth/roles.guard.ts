import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AppUserRole } from "@uprise/db";
import { AuthUser } from "./auth-user";
import { ROLES_KEY } from "./roles.decorator";

/** Role hierarchy — a higher rank satisfies any gate at or below it ("organiser and up"). */
const ROLE_RANK: Record<AppUserRole, number> = {
  [AppUserRole.OWNER]: 3,
  [AppUserRole.ORGANISER]: 2,
  [AppUserRole.VOLUNTEER]: 1,
};

/**
 * Enforces @Roles(...) using the principal BasicAuthGuard attaches to request.user.
 * Rank-aware: a user passes when their role rank >= the LOWEST required rank, so
 * `@Roles(ORGANISER)` admits ORGANISER *and* OWNER. The env break-glass super-admin
 * (`isSuperAdmin`) passes every gate, matching AbilityGuard. Routes with no @Roles()
 * are unrestricted.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppUserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    // Break-glass super-admin clears every role gate.
    if (user?.isSuperAdmin) return true;

    const role = user?.role;
    const minRequired = Math.min(...required.map((r) => ROLE_RANK[r] ?? Infinity));
    if (!role || (ROLE_RANK[role] ?? 0) < minRequired) {
      throw new ForbiddenException("Insufficient role for this action");
    }
    return true;
  }
}
