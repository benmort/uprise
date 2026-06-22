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
