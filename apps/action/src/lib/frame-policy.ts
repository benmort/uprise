/**
 * Frame-ancestors policy for the action-page routes. The per-page allowlist
 * (ActionPage.embedDomains — hostnames or *.wildcards, validated at write time
 * by the admin grammar, so values are CSP-injection-proof by construction)
 * turns into a CSP the embed route ships; the plain page never allows foreign
 * framing. Pure helpers so the policy maths is unit-testable without Next.
 */

export type FramePolicy = { embedDomains: string[] } | null;

/** The admin app's origin — allowed to frame BOTH routes for the live preview. */
export function adminOrigin(): string {
  // NEXT_PUBLIC_ADMIN_ORIGIN is resolved + inlined by next.config (explicit
  // env → derived from the API host → local :3000), same as the insights iframe.
  return (
    process.env.NEXT_PUBLIC_ADMIN_ORIGIN ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    "http://localhost:3000"
  );
}

/** Hostname/wildcard grammar (defence in depth behind the admin write-time validation). */
const DOMAIN_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function sanitiseDomains(domains: unknown): string[] {
  if (!Array.isArray(domains)) return [];
  return domains
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => DOMAIN_RE.test(d));
}

/**
 * The Content-Security-Policy for a request to an action-page route.
 *
 * - Plain page: `'self'` + admin (preview iframe) — never foreign-framable.
 * - Embed route, allowlist configured: `'self'` + admin + the listed hosts.
 * - Embed route, EMPTY allowlist: embeddable anywhere ⇒ NO header (returning
 *   null), per the locked "allowlist optional" decision.
 * - Embed route, policy fetch failed: fail closed to `'self'` + admin.
 */
export function buildFrameAncestors(opts: {
  isEmbedRoute: boolean;
  policy: FramePolicy;
  policyFetchFailed: boolean;
  admin?: string;
}): string | null {
  const admin = opts.admin ?? adminOrigin();
  const base = `frame-ancestors 'self' ${admin}`;
  if (!opts.isEmbedRoute) return base;
  if (opts.policyFetchFailed || !opts.policy) return base;
  const domains = sanitiseDomains(opts.policy.embedDomains);
  if (domains.length === 0) return null;
  return `${base} ${domains.map((d) => `https://${d}`).join(" ")}`;
}
