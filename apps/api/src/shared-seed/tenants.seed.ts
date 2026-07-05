/**
 * Canonical survivor set for the production reset (scripts/reset-to-tenants.ts)
 * and the single tenant the shared demo/tour seed writes into (SeedService.org()).
 *
 * Framework-free (no Prisma, no Nest) so both the Nest-free reset script and the
 * Nest SeedService can import it. `slug` is the natural key used for match/upsert.
 */

// The only human account that survives a reset; owner of every kept tenant and
// the platform super-admin (User.isSuperAdmin). Password is supplied at run time
// via SUPERADMIN_PASSWORD — never committed here.
export const SUPERADMIN_EMAIL = "contact@upriselabs.org";

export type SeedTenant = { slug: string; name: string };

// The tenants that survive a reset. Everything else is deleted. Order is
// irrelevant; the first entry is the primary tenant (see PRIMARY_TENANT).
export const KEEP_TENANTS: readonly SeedTenant[] = [
  { slug: "uprise-labs", name: "Uprise Labs" },
  { slug: "common-threads", name: "Common Threads" },
  { slug: "climate-200", name: "Climate 200" },
  { slug: "australian-progress", name: "Australian Progress" },
  { slug: "getup", name: "GetUp" },
] as const;

// The tenant all demo/tour/seed data is written into.
export const PRIMARY_TENANT: SeedTenant = KEEP_TENANTS[0];
