import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AppUserRole } from "@yarns/db";
import { AuthUser } from "./auth-user";
import { ROLES_KEY } from "./roles.decorator";

/**
 * Enforces @Roles(...) using the principal BasicAuthGuard attached to
 * request.user. The env super-admin (role ORGANISER) passes organiser-gated
 * routes. Routes with no @Roles() are unrestricted.
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
    const role = request.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException("Insufficient role for this action");
    }
    return true;
  }
}
