import { SetMetadata } from "@nestjs/common";
import { AppUserRole } from "../../src/generated/prisma";

export const ROLES_KEY = "roles";

/** Restrict a route to specific AppUser roles. Used with RolesGuard. */
export const Roles = (...roles: AppUserRole[]) => SetMetadata(ROLES_KEY, roles);
