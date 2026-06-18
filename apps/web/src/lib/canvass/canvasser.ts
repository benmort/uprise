"use client";

// The authenticated canvasser's AppUser id. The login flow should set this from
// the /auth/check response (which now returns the principal); until then it can
// be seeded manually for testing. Kept tiny + storage-backed so the field pages
// don't need a provider.

const KEY = "yarns.canvasserId";

export function getCanvasserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setCanvasserId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
}

/** Stable per-knock idempotency key (crypto.randomUUID where available). */
export function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
