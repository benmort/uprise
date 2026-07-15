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
  /**
   * The opaque session token the guard actually resolved (session-auth path only;
   * absent for Basic/env-admin/password auth). Endpoints that mutate "the current
   * session" (select-tenant, sign-out, sign-out-others) MUST target this rather than
   * re-reading the cookie — the browser can hold more than one `auth_token`, and the
   * first cookie isn't necessarily the one that authenticated (see BasicAuthGuard).
   */
  sessionToken?: string;
};
