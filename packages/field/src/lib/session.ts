"use client";

import { auth, loginRedirectUrl, type AuthPrincipal } from "@uprise/api-client";

/**
 * Client session helpers (meld doc 14), shared by apps/field and apps/admin. The
 * httpOnly parent-domain cookie is the session (issued by the standalone auth app);
 * these read the current principal from /auth/check and bounce to the auth app when
 * there's no valid session.
 */

/** The three honest answers a session check can give. `unreachable` is the one a naive
 *  null conflates with signed-out: the network/API failed, so we DON'T know — a field
 *  volunteer on patchy mobile data must not be bounced to sign-in over a dropped packet. */
export type SessionProbe =
  | { state: "authed"; user: AuthPrincipal }
  | { state: "signed-out" }
  | { state: "unreachable"; error: string };

export async function probeSession(): Promise<SessionProbe> {
  const res = await auth.checkSession();
  if (res.ok) {
    return res.data.user ? { state: "authed", user: res.data.user } : { state: "signed-out" };
  }
  // Only a definitive auth answer means signed-out; anything else (network failure,
  // timeout, 5xx) is the API being unreachable, not the session being invalid.
  return res.status === 401 || res.status === 403
    ? { state: "signed-out" }
    : { state: "unreachable", error: res.error };
}

/** The simple read most callers want: the principal, or null when there's no usable
 *  session answer. Prefer `probeSession()` anywhere the unreachable case must not be
 *  treated as signed-out (e.g. the shell's login bounce). */
export async function getSession(): Promise<AuthPrincipal | null> {
  const probe = await probeSession();
  return probe.state === "authed" ? probe.user : null;
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
