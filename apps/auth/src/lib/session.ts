import type { Membership } from "@uprise/contracts";
import { validateReturnTo } from "./return-to";

/**
 * Post-auth redirect (meld doc 14). A user with more than one tenant membership
 * is sent to tenant selection (carrying return_to); otherwise straight back to
 * the validated return_to (the app that bounced them here). The shared
 * parent-domain cookie is already set by the API, so this is just navigation.
 */
export function completeAuth(memberships: Membership[] | undefined, returnToRaw: string | null): void {
  if (memberships && memberships.length > 1) {
    const qs = returnToRaw ? `?return_to=${encodeURIComponent(returnToRaw)}` : "";
    window.location.assign(`/select-tenant${qs}`);
    return;
  }
  window.location.assign(validateReturnTo(returnToRaw));
}
