import { stripPort } from "@uprise/domains";

/** Just the header bag we need — keeps this pure/unit-testable without an express type. */
export interface HostReadable {
  headers: Record<string, string | string[] | undefined>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The host of an `Origin` header value (`https://acme.uprise.org.au` → `acme.uprise.org.au`). */
function hostFromOrigin(origin: string | undefined): string {
  if (!origin) return "";
  try {
    return stripPort(new URL(origin).host);
  } catch {
    return "";
  }
}

/**
 * The host that identifies the TENANT for a request — which is the **calling app's origin**,
 * not the API's own host. The browser calls `api.<root>` from `<tenant>.<root>`, so the
 * tenant subdomain rides in the `Origin` header while `Host` is always the API. We therefore
 * read `Origin` first, then fall back to `x-forwarded-host`/`Host` (covers a same-origin
 * deployment or a server-side call where the tenant host IS the request host).
 *
 * `Origin` is browser-set and unspoofable by page JS, and CORS already validates it; a forged
 * value still needs a valid session + membership to act (else the guard 403s), so trusting it
 * for tenant resolution grants nothing a session wouldn't.
 */
export function readTenantHost(req: HostReadable): string {
  const originHost = hostFromOrigin(first(req.headers.origin));
  if (originHost) return originHost;
  const fwd = first(req.headers["x-forwarded-host"]) ?? req.headers.host;
  return stripPort(String(fwd ?? "").split(",")[0].trim());
}
