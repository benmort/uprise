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

/** Resolve outcome for /auth/check, distinguishing "no session" (→ login) from "no
 *  access to THIS workspace" — a 403 raised when a tenant-subdomain / white-label host
 *  forces a tenant the signed-in user isn't a member of. The latter must show an
 *  access-denied screen, not bounce to login (which would just loop). */
export interface SessionOutcome {
  user: AuthPrincipal | null;
  deniedWorkspace: boolean;
}

export async function getSessionOutcome(): Promise<SessionOutcome> {
  const res = await auth.checkSession();
  if (res.ok) return { user: res.data.user, deniedWorkspace: false };
  return { user: null, deniedWorkspace: res.status === 403 };
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
