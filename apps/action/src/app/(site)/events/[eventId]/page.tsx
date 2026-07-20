import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarClock, MapPin, Navigation, Users } from "lucide-react";
import { BrandStyle, CapacityMeter, EventStatusBadge, LogoMark, readableOn } from "@uprise/ui";
import { tenantLogoUrl } from "@uprise/api-client";
import { getPublicEvent, whenRange } from "@/lib/events";
import { EventCountdown } from "@/components/event-countdown";
import { EventRsvpForm } from "@/components/event-rsvp-form";

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const event = await getPublicEvent(params.eventId);
  if (!event) return { title: "Event" };
  const desc = event.description ?? `${whenRange(event.startsAt, event.endsAt)}${event.location ? ` · ${event.location}` : ""}`;
  const images = event.imageUrl ? [event.imageUrl] : undefined;
  return {
    title: event.title,
    description: desc,
    icons: event.tenant?.logoBlockUrl ? { icon: event.tenant.logoBlockUrl } : undefined,
    openGraph: { title: event.title, description: desc, type: "website", images },
    twitter: { card: "summary_large_image", title: event.title, description: desc, images },
  };
}

/** A Mapbox static-image pin — dep-free (the action app carries no mapbox runtime). Null unless a
 *  token + coords are present, in which case the server renders a plain <img>. */
function staticMapUrl(lat: number | null, lng: number | null): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || lat == null || lng == null) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+465fff(${lng},${lat})/${lng},${lat},14,0/640x260@2x?access_token=${token}`;
}

function directionsUrl(lat: number | null, lng: number | null, location: string | null): string | null {
  const dest = lat != null && lng != null ? `${lat},${lng}` : location ? encodeURIComponent(location) : null;
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${dest}` : null;
}

/**
 * Public event page — the branded supporter view (the volunteer-join-hero look): a brand-primary
 * hero (cover, title, when/where, countdown, capacity) beside an off-white RSVP column. Wears the
 * owning tenant's colours via <BrandStyle>; unauthenticated (fetched server-side from the public
 * API, which gates on publicRsvpEnabled + PUBLISHED).
 */
export default async function PublicEventPage({ params }: { params: { eventId: string } }) {
  const event = await getPublicEvent(params.eventId);
  if (!event) notFound();

  const brand = event.tenant;
  const logoUrl = tenantLogoUrl(brand);
  const mapUrl = staticMapUrl(event.lat, event.lng);
  const directions = directionsUrl(event.lat, event.lng, event.location);
  const secondary = brand?.secondaryColour ?? null;

  return (
    <div className="lg:flex lg:min-h-screen">
      <BrandStyle brand={brand ?? undefined} />

      {/* Brand hero — left on desktop, top on mobile */}
      <section className="relative overflow-hidden rounded-b-[1.625rem] bg-primary px-7 pb-9 pt-9 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:rounded-none lg:px-14 lg:py-16">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle at 30% 30%, var(--brand-secondary, #ffffff), transparent 70%)", filter: "blur(32px)" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle at 30% 30%, var(--brand-secondary, #ffffff), transparent 70%)", filter: "blur(38px)" }}
        />

        <div className="relative z-10 lg:max-w-xl">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-sm">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={brand?.name ? `${brand.name} logo` : "Organisation"} className="h-full w-full object-contain" />
              ) : (
                <LogoMark className="h-8 w-8 text-primary" />
              )}
            </span>
            {brand?.name ? <span className="truncate text-xl font-extrabold text-white">{brand.name}</span> : null}
          </div>

          {event.imageUrl ? (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={event.imageUrl} alt="" className="h-40 w-full object-cover" />
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-2">
            <EventStatusBadge status={event.derivedStatus} className="!bg-white/15 !text-white" />
            <span className="text-sm font-semibold text-white/85">
              <EventCountdown startsAt={event.startsAt} endsAt={event.endsAt} status={event.derivedStatus} />
            </span>
          </div>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.1] lg:text-[3rem]">{event.title}</h1>

          <div className="mt-5 space-y-2 text-white/90">
            <p className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 shrink-0" />
              {whenRange(event.startsAt, event.endsAt)}
            </p>
            {event.location ? (
              <p className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5 shrink-0" />
                {event.location}
              </p>
            ) : null}
            <p className="flex items-center gap-2 text-sm text-white/70">
              <Users className="h-4 w-4 shrink-0" />
              {event.attendeeCount} going{event.spotsLeft != null ? ` · ${event.spotsLeft} spots left` : ""}
            </p>
          </div>

          <div className="mt-6 max-w-md rounded-xl bg-white/10 p-3">
            <CapacityMeter going={event.attendeeCount} capacity={event.capacity} className="[&_span]:text-white" />
          </div>

          {mapUrl ? (
            <a href={directions ?? undefined} target="_blank" rel="noreferrer" className="mt-6 block overflow-hidden rounded-2xl border border-white/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mapUrl} alt={`Map of ${event.location ?? "the venue"}`} className="h-40 w-full object-cover" />
            </a>
          ) : null}
        </div>
      </section>

      {/* RSVP column — right on desktop, below on mobile */}
      <section className="flex flex-1 flex-col bg-[#faf8f5] px-7 pb-10 pt-8 lg:w-1/2 lg:justify-center lg:px-14 lg:py-16">
        <div className="lg:max-w-md">
          {event.description ? <p className="mb-6 text-base leading-relaxed text-ink/70">{event.description}</p> : null}
          <EventRsvpForm
            eventId={event.id}
            title={event.title}
            description={event.description}
            location={event.location}
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            full={event.spotsLeft != null && event.spotsLeft <= 0}
            secondaryColour={secondary}
            secondaryTextColour={readableOn(secondary) ?? null}
          />
          {directions ? (
            <a
              href={directions}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <Navigation className="h-4 w-4" />
              Get directions
            </a>
          ) : null}
        </div>
      </section>
    </div>
  );
}
