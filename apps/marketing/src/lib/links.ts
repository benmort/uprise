/** The auth app origin (SSO hub) — where "Log in" and "Sign up" go. */
export function authAppUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as unknown as { __AUTH_APP_URL__?: string }).__AUTH_APP_URL__;
    if (runtime) return runtime;
  }
  return process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
}
