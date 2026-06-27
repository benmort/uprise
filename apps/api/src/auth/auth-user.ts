import { AppUserRole } from "@uprise/db";

/**
 * The principal attached to `request.user` by the auth guard.
 *
 * `role` (AppUserRole) is the primary tenant role, kept for the existing
 * RolesGuard. `roles` are the unified CASL role ids (see @uprise/permissions)
 * used by AbilityGuard; `isSuperAdmin` is the env break-glass flag.
 */
export type AuthUser = {
  id: string;
  role: AppUserRole;
  tenantId: string | null;
  email?: string;
  roles: string[];
  isSuperAdmin: boolean;
};
