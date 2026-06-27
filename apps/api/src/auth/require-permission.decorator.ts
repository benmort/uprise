import { SetMetadata } from "@nestjs/common";

export const REQUIRE_PERMISSION_KEY = "require_permission";

export interface RequiredPermission {
  action: string;
  resource: string;
}

/**
 * Gate a route on a CASL permission (see @uprise/permissions). The AbilityGuard
 * builds the caller's ability from their roles and allows only if it grants
 * `action` on `resource`. Routes without this decorator are not permission-gated
 * (auth is still enforced by the auth guard).
 */
export const RequirePermission = (perm: RequiredPermission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, perm);
