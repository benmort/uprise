import { NextRequest, NextResponse } from "next/server";

/**
 * SSO gate (meld doc 14). With no session cookie, bounce to the standalone auth
 * app carrying return_to so the canvasser lands back here after signing in. The
 * cookie is the parent-domain httpOnly session (SESSION_COOKIE_DOMAIN). Screens
 * still resolve the principal from /auth/check for the volunteer id + role.
 */
const COOKIE = "auth_token";

export function middleware(req: NextRequest): NextResponse {
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  // Volunteers get the mobile, phone-first auth flow (/v), not the organiser /sign-in.
  const url = new URL("/v", authAppUrl);
  url.searchParams.set("return_to", req.nextUrl.href);
  return NextResponse.redirect(url);
}

export const config = {
  // Gate everything except Next internals, the PWA service-worker assets, and
  // static files (so the login bounce never blocks JS/CSS/icons).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|workbox-|worker-|fallback-|images/|icons/|.*\\.(?:png|jpg|jpeg|svg|gif|ico|json|js|css|woff2?)).*)",
  ],
};
