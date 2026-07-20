"use client";

import { auth, loginRedirectUrl, type AuthPrincipal } from "@uprise/api-client";

/**
 * Client session helpers (meld doc 14), shared by apps/field and apps/admin. The
 * httpOnly parent-domain cookie is the session (issued by the standalone auth app);
 * these read the current principal from /auth/check and bounce to the auth app when
 * there's no valid session.
 */
export async function getSession(): Promise<AuthPrincipal | null> {
  const res = await auth.checkSession();
  return res.ok ? res.data.user : null;
}

/** Send the user to the auth app, preserving where they were headed. The field app sets
 *  `window.__LOGIN_PATH__` (`/volunteer/sign-in`) + `__LOGIN_ORG__` (tenant slug), so a
 *  volunteer whose session expired lands on the branded volunteer sign-in for their org. */
export function goToLogin(): void {
  if (typeof window === "undefined") return;
  window.location.assign(loginRedirectUrl(window.location.href));
}

export async function logout(): Promise<void> {
  await auth.logout();
  goToLogin();
}
