// The cross-app brand hand-off. The volunteer signs in on auth.<domain> but lands on
// field.<domain> — different origins, so localStorage can't carry the tenant brand across
// and the field app's FIRST paint used to be unbranded (Uprise blue + the "U" mark) until
// two network round-trips finished. A parent-domain cookie CAN cross that gap (the same
// trick as the shared `theme` cookie): auth writes it while the volunteer signs in, field
// reads it pre-paint. The cookie carries the PRECOMPUTED CSS (brandVarsCss output) so the
// pre-hydration inline script never needs colour-conversion logic.

export type BrandCookie = {
  slug?: string | null;
  name?: string | null;
  logoUrl?: string | null;
  logoBlockUrl?: string | null;
  /** The `:root{--primary…}` rule from brandVarsCss — injected verbatim pre-paint. */
  css?: string | null;
};

export const BRAND_COOKIE_NAME = "uprise_brand";
const MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * The cookie domain that spans our subdomains: drop the first label so
 * `field.uprise.org.au` → `.uprise.org.au` (shared with auth./admin.). Bare hosts
 * (localhost, IPs) get a host-only cookie (empty string → omit the attribute).
 */
export function brandCookieDomain(hostname: string): string {
  if (!hostname || hostname === "localhost" || /^[0-9.:]+$/.test(hostname)) return "";
  const parts = hostname.split(".");
  if (parts.length < 3) return ""; // apex or single-label — host-only
  return `.${parts.slice(1).join(".")}`;
}

export function writeBrandCookie(brand: BrandCookie): void {
  if (typeof document === "undefined") return;
  try {
    const value = encodeURIComponent(JSON.stringify(brand));
    const domain = brandCookieDomain(window.location.hostname);
    document.cookie =
      `${BRAND_COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE_S}; SameSite=Lax` +
      (domain ? `; domain=${domain}` : "") +
      (window.location.protocol === "https:" ? "; Secure" : "");
  } catch {
    // Best-effort — a blocked cookie just means the next first paint isn't pre-branded.
  }
}

export function readBrandCookie(): BrandCookie | null {
  if (typeof document === "undefined") return null;
  try {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${BRAND_COOKIE_NAME}=([^;]+)`));
    if (!m) return null;
    return JSON.parse(decodeURIComponent(m[1])) as BrandCookie;
  } catch {
    return null;
  }
}
