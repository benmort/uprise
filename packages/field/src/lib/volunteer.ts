"use client";

import { readBrandCookie } from "@uprise/ui";

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

/** Time-of-day greeting ("Good morning/afternoon/evening") — shared by the field homepage
 *  header and the drawer title so they read the same. */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const TENANT_KEY = "uprise.volunteerTenant";

/** The current tenant the volunteer is canvassing for — brand badge + `slug` for the branded
 *  login bounce, PLUS the colours and precomputed `css` (brandVarsCss output) so the layout's
 *  pre-hydration script can paint the tenant brand before any network — no Uprise-blue flash. */
export type TenantBrand = {
  id: string;
  name: string;
  logoUrl?: string | null;
  slug?: string | null;
  logoBlockUrl?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  /** The `:root{--primary…}` rule, precomputed so pre-paint injection is a verbatim copy. */
  css?: string | null;
};

export function getTenantBrand(): TenantBrand | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TENANT_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as TenantBrand;
    } catch {
      return null;
    }
  }
  // First land from the auth app (different origin — it can't seed our localStorage, but it
  // wrote the parent-domain brand cookie during sign-in): adopt it so even the very first
  // paint of the loading screen is branded.
  const fromCookie = readBrandCookie();
  if (fromCookie && (fromCookie.name || fromCookie.logoUrl || fromCookie.css)) {
    return {
      id: "",
      name: fromCookie.name ?? "",
      logoUrl: fromCookie.logoUrl ?? null,
      slug: fromCookie.slug ?? null,
      logoBlockUrl: fromCookie.logoBlockUrl ?? null,
      css: fromCookie.css ?? null,
    };
  }
  return null;
}

export function setTenantBrand(tenant: TenantBrand): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
}

/** Stable per-knock idempotency key (crypto.randomUUID where available). */
export function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dk_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
