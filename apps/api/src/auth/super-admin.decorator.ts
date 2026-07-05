import { SetMetadata } from "@nestjs/common";

export const SUPER_ADMIN_KEY = "super_admin";

/**
 * Gate a route on the env break-glass super-admin flag (`request.user.isSuperAdmin`).
 * For platform-operator actions that no tenant role — not even OWNER — should reach.
 * Routes without this decorator are not super-admin-gated (auth + any @RequirePermission
 * still apply). Enforced by SuperAdminGuard.
 */
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);
