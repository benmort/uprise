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

/**
 * Every parent domain uprise itself owns. A host under one of these is NEVER a tenant's
 * white-label domain, whatever shape it takes.
 *
 * Deliberately a **separate, wider list** from `DEFAULT_PLATFORM_ROOTS`, which answers a
 * narrower question: under which roots is a bare first label a tenant *slug*.
 * `upriselabs.org` is ours — `apps/organisation-marketing` serves `www.upriselabs.org` and
 * consumes `@uprise/api-client` — but it hosts no tenants, so adding it to the roots list
 * would wrongly make `acme.upriselabs.org` resolve as tenant "acme".
 *
 * Matched by suffix, so any depth is covered — `dev.uprise.org.au` and any future
 * `staging.uprise.org.au` are ours without being listed.
 *
 * `lvh.me` is deliberately **absent**: it is a third-party public wildcard that resolves
 * `*.lvh.me` to 127.0.0.1, so we do not own it and this list would be lying if it were here.
 * Local dev is covered by `DEFAULT_PLATFORM_ROOTS` instead, which `isCustomParentHost`
 * checks first. Keeping the two lists honest about what they assert is the point.
 *
 * `isCustomParentHost` consults this **explicitly** rather than inferring "custom" from the
 * absence of a roots match. That inversion is the whole point: an allowlist fails closed on
 * a host shape nobody thought of, whereas "no match ⇒ must be a tenant's" fails open — and
 * did, for trailing-dot FQDNs and for `www.upriselabs.org`.
 */
export const PLATFORM_OWNED_DOMAINS: readonly string[] = ["uprise.org.au", "upriselabs.org"];

/** Tenant-slug shape (mirrors the API SLUG_RE): lowercase alphanumerics + inner hyphens. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Multi-label public suffixes that must never be handed back as a registrable parent.
 *
 * This is NOT a full Public Suffix List, and deliberately so — this package is
 * zero-dependency by design because it is imported by the API, four Next apps and Edge
 * middleware. It is a bounded list covering the suffixes uprise actually operates in
 * (Australia) plus the common internationals a customer might bring.
 *
 * Why it has to exist: before this, `parentDomain`'s only guard was "the parent has ≥2
 * labels", so `admin.org.au` yielded `org.au`. That is a public suffix — a cookie scoped
 * to `.org.au` would be rejected by browsers at best, and shared across every `.org.au`
 * site at worst, and `siblingOrigin` would emit `https://auth.org.au`. Harmless while we
 * only ever served `*.uprise.org.au`; load-bearing the moment a customer supplies their
 * own apex.
 *
 * If a customer's suffix is missing here, their domain fails CLOSED (no parent derived,
 * callers fall back to platform env URLs) rather than opening a hole — so adding to this
 * list is a safe, additive fix.
 */
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  // Australia — uprise's market
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "asn.au",
  "id.au",
  // common internationals
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "co.nz",
  "net.nz",
  "org.nz",
  "govt.nz",
  "co.za",
  "co.jp",
  "co.in",
  "com.br",
  "com.cn",
  "com.mx",
  "com.sg",
]);

/**
 * True when `domain` is a public suffix rather than something registrable — either a bare
 * single label (`au`) or a known multi-label suffix (`org.au`). Subsumes the old
 * `rest.includes(".")` check in `parentDomain`.
 */
export function isPublicSuffix(domain: string): boolean {
  const d = stripPort(domain);
  if (!d) return false;
  return !d.includes(".") || PUBLIC_SUFFIXES.has(d);
}

/**
 * Host with any `:port` and surrounding whitespace removed, lowercased, and with a
 * trailing FQDN dot stripped.
 *
 * The trailing dot matters more than it looks. `admin.uprise.org.au.` is a legal,
 * *routable* host — it reaches our production apps today — and browsers send it in the
 * `Host` header verbatim. Left in place it makes the parent compute as `uprise.org.au.`,
 * which matches no entry in any roots list, so every "is this one of ours?" check reads
 * such a host as a stranger's. Normalising here fixes `parentDomain`,
 * `isCustomParentHost`, `cookieDomainForHost`, `tenantSlugFromPlatformHost` and
 * `isPlatformAppHost` in one place.
 */
export function stripPort(host: string): string {
  return (host || "")
    .split(":")[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
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
  // App-subdomain host: parent is everything after the app label, provided that remainder is
  // actually registrable. `isPublicSuffix` rejects both `au` and `org.au` — see its docblock
  // for why the two-label case matters now that a customer supplies the apex.
  if (RESERVED_APP_SUBDOMAINS.has(labels[0]) && !isPublicSuffix(rest)) return rest;
  // Bare tenant subdomain of a known platform root: the parent is that root.
  if (roots.includes(rest)) return rest;
  return null;
}

/** True when `parent` is a uprise-owned domain, or any subdomain of one. */
export function isPlatformOwnedDomain(parent: string): boolean {
  const p = stripPort(parent);
  if (!p) return false;
  return PLATFORM_OWNED_DOMAINS.some((owned) => p === owned || p.endsWith(`.${owned}`));
}

/**
 * True when the host's registrable parent is a white-label parent attached for a tenant
 * (`admin.commonthreads.org.au`) rather than one of ours.
 *
 * This is the predicate every Part B branch is gated on. It is a **useful default, not a
 * safety boundary** — treat it as "probably a tenant's" and never as proof that a host is
 * not ours. Anything that must not fire on a uprise host needs its own explicit check; the
 * first version of this function inferred "custom" purely from the absence of a roots match
 * and so returned true for trailing-dot FQDNs and for `www.upriselabs.org`, both live.
 *
 * A parent is ours if it is in the caller's `roots` (so a caller-supplied list stays
 * additive) or under `PLATFORM_OWNED_DOMAINS`.
 */
export function isCustomParentHost(
  host: string,
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): boolean {
  const parent = parentDomain(host, roots);
  if (!parent) return false;
  if (roots.includes(parent)) return false;
  return !isPlatformOwnedDomain(parent);
}

/**
 * The cookie `Domain` attribute for a host — `.<parent>` when there is a registrable
 * parent, or `""` meaning host-only.
 *
 * One source of truth for cookie scoping, so the API's session cookie, the brand cookie
 * (`packages/ui/src/lib/brand-cookie.ts`) and the theme cookie stop each deriving their own
 * answer. `""` is the correct host-only signal for all three: it matches what
 * `sessionCookieOptions` already does when `SESSION_COOKIE_DOMAIN` is unset, so localhost
 * and ported dev hosts behave exactly as they do today.
 *
 * Deliberately **port-blind**: `admin.lvh.me:3002` still yields `.lvh.me`, because ports take
 * no part in cookie scoping — a host-only cookie on `admin.lvh.me` is not sent to
 * `api.lvh.me`, so scoping to the parent is the only thing that makes local cross-app SSO
 * work at all. This matches what `brandCookieDomain` already does today. It follows that
 * `Secure` must be decided by the request protocol, NOT by "a domain was set" — see the
 * `secure:` line in `apps/api/src/auth/session-cookie.util.ts`, which currently conflates
 * the two and would drop this cookie over http.
 *
 *  - `admin.uprise.org.au`        → `.uprise.org.au`
 *  - `admin.commonthreads.org.au` → `.commonthreads.org.au`
 *  - `admin.lvh.me:3002`          → `.lvh.me`
 *  - `localhost:3000` / `admin.org.au` / `commonthreads.org.au` → `""`
 */
export function cookieDomainForHost(
  host: string,
  roots: readonly string[] = DEFAULT_PLATFORM_ROOTS,
): string {
  const parent = parentDomain(host, roots);
  // Belt and braces: parentDomain already refuses a public suffix, but a cookie scoped to
  // one is the single worst outcome in this module, so never let it through on a second path.
  if (!parent || isPublicSuffix(parent)) return "";
  return `.${parent}`;
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
