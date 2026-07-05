import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthUser } from "./auth-user";
import { SUPER_ADMIN_KEY } from "./super-admin.decorator";

/**
 * Enforces @SuperAdmin() using the principal BasicAuthGuard attaches to request.user.
 * Runs after BasicAuthGuard (global). Allow-by-default: routes without @SuperAdmin() pass
 * (matching AbilityGuard/RolesGuard), so this is a no-op unless the decorator is present.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.user?.isSuperAdmin === true) return true;
    throw new ForbiddenException("Super-admin only");
  }
}
