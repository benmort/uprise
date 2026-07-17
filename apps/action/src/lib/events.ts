/**
 * Public event data, fetched server-side from the API's unauthenticated `/public-events/*`
 * surface (no cookie, no CORS — same pattern as the public poll). Returns null on any
 * non-200 (a private/missing/closed event 404s), so pages render a clean not-found.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return (json && typeof json === "object" && "data" in json ? (json as { data: T }).data : (json as T)) ?? null;
  } catch {
    return null;
  }
}

export type PublicEventTenant = {
  id: string;
  name: string;
  slug: string;
  logoLandscapeUrl: string | null;
  logoBlockUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  customCss: string | null;
};

export type DerivedEventStatus = "draft" | "upcoming" | "ongoing" | "completed" | "cancelled";

export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  imageUrl: string | null;
  attendeeCount: number;
  spotsLeft: number | null;
  derivedStatus: DerivedEventStatus;
  tenant: PublicEventTenant | null;
};

export type PublicEventBoard = { tenant: PublicEventTenant | null; events: PublicEvent[] };

export type RsvpStatus = "GOING" | "WAITLIST" | "CANCELLED" | "ATTENDED";
export type ManageRsvpView = {
  event: PublicEvent;
  rsvp: { id: string; name: string; email: string | null; phone: string | null; guests: number; status: RsvpStatus };
};

export const getPublicEvent = (id: string) => getJson<PublicEvent>(`/public-events/${encodeURIComponent(id)}`);

export const listPublicEvents = (tenantSlug: string) =>
  getJson<PublicEventBoard>(`/public-events?tenant=${encodeURIComponent(tenantSlug)}`);

export const getManageRsvp = (token: string) =>
  getJson<ManageRsvpView>(`/public-events/rsvp/${encodeURIComponent(token)}`);

/** "Sat 8 Aug, 10:00 am – 11:00 am" (or a date range across days). */
export function whenRange(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const date = s.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  const t = (d: Date) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${date}, ${t(s)} – ${t(e)}`
    : `${date}, ${t(s)} – ${e.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}, ${t(e)}`;
}
