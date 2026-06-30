"use client";

// The authenticated volunteer's AppUser id. The login flow should set this from
// the /auth/check response (which now returns the principal); until then it can
// be seeded manually for testing. Kept tiny + storage-backed so the field pages
// don't need a provider.

const KEY = "uprise.volunteerId";

export function getVolunteerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setVolunteerId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, id);
}

const NAME_KEY = "uprise.volunteerName";

/** The volunteer's first name for the greeting (best-effort; "" until set). */
export function getVolunteerName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function setVolunteerName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}

const TENANT_KEY = "uprise.volunteerTenant";

/** The current tenant the volunteer is canvassing for ({id,name}) — for the brand badge. */
export function getTenantBrand(): { id: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TENANT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id: string; name: string };
  } catch {
    return null;
  }
}

export function setTenantBrand(tenant: { id: string; name: string }): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

/** Stable per-knock idempotency key (crypto.randomUUID where available). */
export function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
