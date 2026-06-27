import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { defineAbilityFor, type AuthenticatedActor } from "@uprise/permissions";
import { AuthUser } from "./auth-user";
import { REQUIRE_PERMISSION_KEY, type RequiredPermission } from "./require-permission.decorator";

/**
 * CASL permission guard. Runs after the auth guard (which attaches request.user).
 * A route opts in with @RequirePermission({ action, resource }); routes without
 * it are allowed (auth already enforced upstream). The actor's ability is built
 * from its unified roles — super-admin/env break-glass grants everything.
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException("Not authenticated");

    const actor: AuthenticatedActor = {
      id: user.id,
      type: "user",
      email: user.email ?? "",
      tenantId: user.tenantId,
      roles: user.roles ?? [],
      isSuperAdmin: user.isSuperAdmin === true,
    };
    const ability = defineAbilityFor(actor);
    if (!ability.can(required.action, required.resource)) {
      throw new ForbiddenException(`Missing permission: ${required.action} ${required.resource}`);
    }
    return true;
  }
}
