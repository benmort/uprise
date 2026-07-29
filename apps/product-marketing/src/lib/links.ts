/** The auth app origin (SSO hub) — where "Log in" and "Sign up" go. */
export function authAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __AUTH_APP_URL__?: string }).__AUTH_APP_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
}

/**
 * The canvasser (field) PWA origin — where the homepage's embedded demo walk view is served from.
 *
 * Derived from the current host by default (uprise.org.au → field.uprise.org.au, and the same for
 * the dev tunnel), so no env var is needed for the embed to work in any environment. An explicit
 * NEXT_PUBLIC_FIELD_APP_URL (surfaced at runtime as __FIELD_APP_URL__, like the others) wins.
 */
export function fieldAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __FIELD_APP_URL__?: string }).__FIELD_APP_URL__;
    if (runtime) return runtime;
    const { protocol, hostname } = window.location;
    // Local dev runs the apps on separate ports rather than subdomains.
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:3005";
    return `${protocol}//field.${hostname.replace(/^www\./, "")}`;
  }
  return process.env.NEXT_PUBLIC_FIELD_APP_URL || "http://localhost:3005";
}

/** The admin/organiser app origin — where "Continue as <email>" sends an authed user. */
export function adminAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __APP_URL__?: string }).__APP_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
