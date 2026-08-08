import { hostIsLocal, parentDomain, siblingOrigin } from "@uprise/domains";

/**
 * Sibling-app origins derived from the field host this app is served from.
 *
 * Derived rather than configured, because this package runs inside the field app, which
 * does not set `NEXT_PUBLIC_APP_URL` — `getAdminAppUrl()` would therefore answer
 * `localhost:3000` in production. The request host always knows the answer, on the platform
 * hosts, on a bare tenant subdomain and on a tenant's own domain alike.
 *
 * Lives in `lib/` rather than beside its one caller because it is pure host arithmetic with
 * a history of being got wrong, and this is where the field package keeps testable logic.
 */

/** Admin's port in local dev — the one thing a hostname cannot carry. */
export const DEV_ADMIN_PORT = 3000;

/**
 * The admin app's origin for a given field host: `field.<parent>` → `admin.<parent>`.
 *
 * The previous implementation overwrote the first label unconditionally
 * (`parts[0] = "admin"`), which had two failure modes. On anything without a leading app
 * label it produced nonsense — an apex `uprise.org.au` became `admin.org.au`, a public
 * suffix belonging to nobody. And it dropped the dev port, so `field.lvh.me:3005` addressed
 * `admin.lvh.me` with no port at all. `siblingOrigin` owns the label arithmetic and declines
 * the shapes that have no answer, which is what the dev branch below keys off.
 *
 * @param host     `window.location.host` — with the port, if any.
 * @param protocol `window.location.protocol` (`"https:"`); the colon is optional.
 */
export function adminOriginFor(host: string, protocol = "https"): string {
  const derived = siblingOrigin(host, "admin", protocol);
  if (derived) return derived;
  const proto = protocol.replace(/:$/, "");
  // Local or ported dev. Keep the parent where there is one, so the session cookie — scoped
  // to `.lvh.me` — still reaches admin.
  //
  // Everything else lands on localhost: bare localhost has no parent to keep, and neither
  // does a host we cannot derive from at all (an apex, a preview deploy). There is no honest
  // answer for those — the field app is never served from them — and localhost at least
  // fails where a developer will see it rather than pointing at a domain we do not own.
  const parent = hostIsLocal(host) ? null : parentDomain(host);
  return parent
    ? `${proto}://admin.${parent}:${DEV_ADMIN_PORT}`
    : `${proto}://localhost:${DEV_ADMIN_PORT}`;
}

/** `adminOriginFor` bound to the current browser location; `""` during SSR. */
export function adminOrigin(): string {
  if (typeof window === "undefined") return "";
  return adminOriginFor(window.location.host, window.location.protocol);
}
