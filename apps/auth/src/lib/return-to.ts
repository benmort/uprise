import { DEFAULT_PLATFORM_ROOTS, parentDomain } from "@uprise/domains";

/**
 * return_to validation (meld doc 14). A successful login may only redirect back
 * to an origin on the configured allowlist — never an arbitrary URL (open-redirect
 * guard). Anything invalid falls back to the first allowed origin.
 */
function allowedOrigins(): string[] {
  return (process.env.NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function defaultReturnTo(): string {
  return allowedOrigins()[0] || "http://localhost:3000";
}

/**
 * The platform root(s) THIS deployment's allowlisted origins live under — the env-scoped subset
 * of {@link DEFAULT_PLATFORM_ROOTS}. Prod origins sit under `uprise.org.au`, dev under
 * `dev.uprise.org.au`; gating the tenant-subdomain fallback to these stops prod auth accepting a
 * `*.dev.uprise.org.au` return_to (and vice versa) even though both are platform roots.
 */
function envPlatformRoots(): string[] {
  const parents = new Set<string>();
  for (const origin of allowedOrigins()) {
    try {
      const parent = parentDomain(new URL(origin).hostname);
      if (parent) parents.add(parent);
    } catch {
      // skip a malformed allowlist entry
    }
  }
  return DEFAULT_PLATFORM_ROOTS.filter((root) => parents.has(root));
}

/**
 * Carry an inbound `return_to` across an internal hop, so a volunteer bounced here from
 * the field app still lands back there once they finish. The value is passed through
 * untouched – it is `validateReturnTo` at the actual redirect that gates the origin, so
 * a hostile value never becomes a redirect no matter how many internal links it crosses.
 */
export function withReturnTo(path: string, returnTo: string | null | undefined): string {
  if (!returnTo) return path;
  return `${path}${path.includes("?") ? "&" : "?"}return_to=${encodeURIComponent(returnTo)}`;
}

export function validateReturnTo(raw: string | null | undefined): string {
  const fallback = defaultReturnTo();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, fallback);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    if (allowedOrigins().map((o) => o.toLowerCase()).includes(origin)) {
      return url.toString();
    }
    // Tenant subdomains (e.g. common-threads.uprise.org.au) aren't in the static env
    // allowlist, so also accept any host whose registrable parent is a platform root —
    // but only THIS deployment's root. Prod origins live under uprise.org.au, dev under
    // dev.uprise.org.au; scoping to the env's own root keeps a tenant subdomain working
    // while stopping prod auth honouring a *.dev.uprise.org.au return_to (and vice versa).
    // Still an open-redirect guard: only the platform's own domains pass, never an
    // arbitrary external host.
    const parent = parentDomain(url.hostname);
    if (parent && envPlatformRoots().includes(parent)) {
      return url.toString();
    }
  } catch {
    // fall through
  }
  return fallback;
}
