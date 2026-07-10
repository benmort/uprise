/**
 * A tiny client-side signal that the signed-in user's profile (display name or avatar)
 * changed. The topbar UserDropdown reads the avatar + name once on mount, so after an edit
 * on /profile it would otherwise stay stale until a full page reload. The profile page emits
 * this on save; the dropdown re-fetches when it hears it.
 *
 * Backed by a module-level EventTarget rather than `window` so it works in both the browser
 * and unit tests, and carries no per-request server state — both the emitter and the listener
 * are client components, so the shared bus is only ever exercised in the browser.
 */
const bus = new EventTarget();

export const PROFILE_UPDATED_EVENT = "uprise:profile-updated";

/** Announce that the signed-in user's profile (name or avatar) changed. */
export function emitProfileUpdated(): void {
  bus.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

/** Subscribe to profile-updated; returns an unsubscribe function. */
export function onProfileUpdated(handler: () => void): () => void {
  bus.addEventListener(PROFILE_UPDATED_EVENT, handler);
  return () => bus.removeEventListener(PROFILE_UPDATED_EVENT, handler);
}
