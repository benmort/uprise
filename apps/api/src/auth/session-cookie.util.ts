import type { ConfigService } from "@nestjs/config";
import type { CookieOptions, Request, Response } from "express";

/** The httpOnly session cookie name (also read by BasicAuthGuard). */
export const SESSION_COOKIE = "auth_token";

/** Read the session token from the auth_token cookie, or a Bearer header. */
export function readSessionToken(req: Request): string | undefined {
  const fromCookie = req.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (fromCookie) return decodeURIComponent(fromCookie);
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
}

/**
 * Cookie options for the session (meld doc 14). When SESSION_COOKIE_DOMAIN is set
 * (e.g. ".uprise.org.au" in prod, ".lvh.me" in dev) the cookie is scoped to the
 * parent domain so every subdomain app shares one session (SSO). Unset → the
 * cookie is bound to the exact request host (single-app behaviour).
 */
export function sessionCookieOptions(config: ConfigService, expires?: Date): CookieOptions {
  const domain = config.get<string>("SESSION_COOKIE_DOMAIN", "").trim();
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.get<string>("NODE_ENV") === "production",
    path: "/",
    ...(domain ? { domain } : {}),
    ...(expires ? { expires } : {}),
  };
}

export function setSessionCookie(
  res: Response,
  config: ConfigService,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(config, expiresAt));
}

export function clearSessionCookie(res: Response, config: ConfigService): void {
  const domain = config.get<string>("SESSION_COOKIE_DOMAIN", "").trim();
  res.clearCookie(SESSION_COOKIE, { path: "/", ...(domain ? { domain } : {}) });
}
