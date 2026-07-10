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
    const origin = `${url.protocol}//${url.host}`.toLowerCase();
    if (allowedOrigins().map((o) => o.toLowerCase()).includes(origin)) {
      return url.toString();
    }
  } catch {
    // fall through
  }
  return fallback;
}
