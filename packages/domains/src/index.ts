/**
 * Host-derivation primitives for uprise' tenant routing.
 *
 * The whole routing design keys off a request host's **registrable parent domain**:
 * the platform (`uprise.org.au`) is just the special case, and a white-label parent
 * (`commonthreads.org.au`) is structurally identical. This module is a pure,
 * zero-dependency helper so the SAME parsing + reserved set live in one place — used
 * by the API (Node), the Next apps (browser/RSC) and Edge middleware.
 *
 * Two host shapes matter:
 *  - **App-subdomain host** — `admin.<parent>` / `auth.<parent>` / … (a reserved first
 *    label). The parent is everything after that label. This is how BOTH the platform
 *    app hosts (`admin.uprise.org.au`) and white-label hosts (`admin.commonthreads.org.au`)
 *    look.
 *  - **Bare tenant subdomain** — `<slug>.<platform-root>` (`common-threads.uprise.org.au`),
 *    which serves the admin app scoped to that tenant. The first label is the tenant slug.
 */

/** The apps that get their own host under a parent domain. */
export type AppName = "admin" | "auth" | "api" | "action" | "field";

/**
 * First labels that are never a tenant slug — the platform's own app surfaces plus
 * infrastructure/reserved names a tenant must not be able to claim. A `<label>.<root>`
 * host whose label is in here is resolved by session, not as a tenant subdomain, and
 * `createTenant` rejects these as slugs. Mirrors prog's `RESERVED_SUBDOMAINS`
 * (clients/auth-client/lib/utils/tenancy.ts) unioned with uprise's app labels.
 */
export const RESERVED_APP_SUBDOMAINS: ReadonlySet<string> = new Set([
  // uprise app surfaces (admin/auth/api/action/field + the marketing sites)
  "admin",
  "auth",
  "api",
  "action",
  "field",
  "app",
  "www",
  "marketing",
  "labs",
  // infrastructure / reserved (prog parity) — kept off-limits so a tenant slug can never
  // shadow a platform host we might stand up later.
  "static",
  "cdn",
  "assets",
  "status",
  "help",
  "support",
  "billing",
  "mail",
  "ftp",
  "blog",
  "shop",
  "store",
  "docs",
  "staging",
  "dev",
  "test",
  "demo",
  "beta",
  "alpha",
  "uat",
]);

/**
 * Multi-label roots under which a bare first label is a TENANT slug. `uprise.org.au` is
 * prod, `dev.uprise.org.au` staging, `lvh.me` local. The API passes its single
 * per-env `PLATFORM_BASE_DOMAIN` instead of this default; the frontend uses the list.
 */
export const DEFAULT_PLATFORM_ROOTS: readonly string[] = [
  "uprise.org.au",
  "dev.uprise.org.au",
  "lvh.me",
];

/** Tenant-slug shape (mirrors the API SLUG_RE): lowercase alphanumerics + inner hyphens. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Host with any `:port` and surrounding whitespace removed, lowercased. */
export function stripPort(host: string): string {
  return (host || "").split(":")[0].trim().toLowerCase();
}

/** `localhost` or a bare IPv4 — never a routable tenant/app host. */
export function hostIsLocal(host: string): boolean {
  const h = stripPort(host);
  return h === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(h);
}

/** True when the host carries an explicit non-default (non-80/443) port, e.g. `:3000`. */
export function hostHasNonDefaultPort(host: string): boolean {
  const m = (host || "").match(/:(\d+)$/);
  return m !== null && m[1] !== "80" && m[1] !== "443";
}

/**
 * Whether siblings can be derived from this host alone. Dev hosts carry per-app ports
 * (`localhost:3000`, `admin.lvh.me:3002`) a hostname-only derivation can't recover, so
 * we signal "not derivable" and callers fall back to their explicit env URLs — which is
 * exactly what keeps local dev behaving as it does today.
 */
export function isDerivableHost(host: string): boolean {
  return !hostIsLocal(host) && !hostHasNonDefaultPort(host);
}

/**
 * The registrable parent domain of a host, or null when there isn't one (local host,
 * bare label, or an apex root that isn't itself a tenant/app surface).
 *
 *  - `admin.uprise.org.au`        → `uprise.org.au`        (app-subdomain host)
 *  - `admin.commonthreads.org.au` → `commonthreads.org.au` (white-label app host)
 *  - `common-threads.uprise.org.au` → `uprise.org.au`      (bare tenant subdomain)
 *  - `uprise.org.au` / `localhost`  → null
 */
export function parentDomain(
  host: string,
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): string | null {
  const h = stripPort(host);
  if (!h || hostIsLocal(h)) return null;
  const labels = h.split(".");
  if (labels.length < 2) return null;
  const rest = labels.slice(1).join(".");
  // App-subdomain host: parent is everything after the app label (needs ≥2 labels so a
  // single-label / public-suffix "parent" like `au` is never produced).
  if (RESERVED_APP_SUBDOMAINS.has(labels[0]) && rest.includes(".")) return rest;
  // Bare tenant subdomain of a known platform root: the parent is that root.
  if (roots.includes(rest)) return rest;
  return null;
}

/**
 * The tenant slug when the host is a bare `<slug>.<platform-root>` subdomain, else null.
 * Reserved app labels, apex roots, and custom (white-label) hosts all return null —
 * a white-label tenant is NOT knowable from the host (its first label is `admin`), so
 * this is for the platform-subdomain case only and is safe for cosmetic use.
 */
export function tenantSlugFromPlatformHost(
  host: string,
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): string | null {
  const h = stripPort(host);
  if (!h || hostIsLocal(h)) return null;
  const labels = h.split(".");
  if (labels.length < 2) return null;
  const first = labels[0];
  const rest = labels.slice(1).join(".");
  if (RESERVED_APP_SUBDOMAINS.has(first)) return null;
  if (!roots.includes(rest)) return null;
  return SLUG_RE.test(first) ? first : null;
}

/** True for a platform app host (`admin.uprise.org.au`) — reserved label on a platform root. */
export function isPlatformAppHost(
  host: string,
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): boolean {
  const h = stripPort(host);
  const labels = h.split(".");
  if (labels.length < 2) return false;
  return RESERVED_APP_SUBDOMAINS.has(labels[0]) && roots.includes(labels.slice(1).join("."));
}

/** `https` / `http` with any trailing colon removed. */
function normaliseProto(proto: string): string {
  return (proto || "https").replace(/:$/, "");
}

/**
 * The origin of a sibling app under the current host's parent domain, or null when the
 * host isn't derivable (dev/ported/local) so the caller falls back to its env URL.
 *
 *  - siblingOrigin("admin.commonthreads.org.au", "auth") → "https://auth.commonthreads.org.au"
 *  - siblingOrigin("common-threads.uprise.org.au", "api") → "https://api.uprise.org.au"
 *  - siblingOrigin("localhost:3000", "auth")             → null
 */
export function siblingOrigin(
  host: string,
  app: AppName,
  proto = "https",
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): string | null {
  if (!isDerivableHost(host)) return null;
  const parent = parentDomain(host, roots);
  if (!parent) return null;
  return `${normaliseProto(proto)}://${app}.${parent}`;
}
