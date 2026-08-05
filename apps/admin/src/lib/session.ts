"use client";

import { auth, getAuthAppUrl, type AuthPrincipal } from "@uprise/api-client";

/**
 * Client session helpers (meld doc 14). apps/admin no longer holds credentials —
 * the httpOnly parent-domain cookie is the session, issued by the standalone auth
 * app. These read the current principal from /auth/check and bounce to the auth
 * app when there's no valid session.
 */
export async function getSession(): Promise<AuthPrincipal | null> {
  const res = await auth.checkSession();
  return res.ok ? res.data.user : null;
}

/** Resolve outcome for /auth/check, distinguishing three failures that must be handled
 *  differently: "no session" (→ login), "no access to THIS workspace" – a 403 raised when
 *  a tenant-subdomain / white-label host forces a tenant the signed-in user isn't a member
 *  of, which must show an access-denied screen rather than loop through login – and
 *  "the check never reached a verdict", which must not sign anyone out at all. */
export interface SessionOutcome {
  user: AuthPrincipal | null;
  deniedWorkspace: boolean;
  /** The check failed for a reason that says nothing about the session: the fetch was
   *  rejected (offline, DNS, TLS, a CORS block – no HTTP status at all), or the API/edge
   *  errored (5xx, a Vercel 502). Treating this as "signed out" bounces an authenticated
   *  user to the login page on one flaky first load and abandons their fresh session.
   *  Optional so existing callers keep compiling; getSessionOutcome always sets it. */
  unreachable?: boolean;
}

/** `unreachable` means one thing only: the check never produced a verdict about the session.
 *  That is a rejected fetch (no HTTP status at all) or the server failing on its own account
 *  (5xx). A 400/404/429 is a reply from a working server – it says nothing about reachability,
 *  so claiming otherwise would make the flag mean "not 401/403", which is no signal at all.
 *  Newer @uprise/api-client builds flag the rejected-fetch case explicitly; read it
 *  structurally so this compiles either way. */
function isUnreachable(res: { status?: number }): boolean {
  if ((res as { networkError?: unknown }).networkError === true) return true;
  if (typeof res.status !== "number") return true;
  return res.status >= 500;
}

export async function getSessionOutcome(): Promise<SessionOutcome> {
  const res = await auth.checkSession();
  if (res.ok) return { user: res.data.user, deniedWorkspace: false, unreachable: false };
  return { user: null, deniedWorkspace: res.status === 403, unreachable: isUnreachable(res) };
}

/** Send the user to the auth app, preserving where they were headed. */
export function goToLogin(): void {
  if (typeof window === "undefined") return;
  const returnTo = encodeURIComponent(window.location.href);
  window.location.assign(`${getAuthAppUrl()}/sign-in?return_to=${returnTo}`);
}

export async function logout(): Promise<void> {
  await auth.logout();
  goToLogin();
}
