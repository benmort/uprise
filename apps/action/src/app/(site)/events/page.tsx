import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { BrandStyle, EventStatusBadge, LogoMark } from "@uprise/ui";
import { tenantLogoUrl } from "@uprise/api-client";
import { listPublicEvents, whenRange } from "@/lib/events";

/** Per-tenant tab title + favicon (square block logo) for an org's public events board. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { org?: string; tenant?: string };
}): Promise<Metadata> {
  const slug = searchParams.org || searchParams.tenant || null;
  if (!slug) return { title: "Events" };
  const board = await listPublicEvents(slug);
  const tenant = board?.tenant ?? null;
  return {
    title: tenant?.name ? `Events · ${tenant.name}` : "Events",
    icons: tenant?.logoBlockUrl ? { icon: tenant.logoBlockUrl } : undefined,
  };
}

/** Public events board for one org — reached with `?org=<slug>`. Branded with the org's colours;
 *  lists its published, public, not-yet-ended events. Mirrors the volunteer board's shape. */
export default async function PublicEventsBoard({ searchParams }: { searchParams: { org?: string; tenant?: string } }) {
  const slug = searchParams.org || searchParams.tenant || null;
  const board = slug ? await listPublicEvents(slug) : null;
  const tenant = board?.tenant ?? null;
  const events = board?.events ?? [];
  const logoUrl = tenantLogoUrl(tenant);

  if (!slug) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-foreground">Events</h1>
        <p className="mt-2 text-muted-foreground">Open this from an organisation&apos;s link to see their events.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <BrandStyle brand={tenant ?? undefined} />
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 p-1">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={tenant?.name ? `${tenant.name} logo` : "Organisation"} className="h-full w-full object-contain" />
          ) : (
            <LogoMark className="h-7 w-7 text-primary" />
          )}
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{tenant?.name ?? "Events"}</h1>
          <p className="text-sm text-muted-foreground">Upcoming events</p>
        </div>
      </header>

      {events.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No upcoming events right now. Check back soon.
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="flex gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/40"
              >
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-variant">
                  {e.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CalendarClock className="h-6 w-6 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-bold text-foreground">{e.title}</h2>
                    <EventStatusBadge status={e.derivedStatus} />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {whenRange(e.startsAt, e.endsAt)}
                    </span>
                    {e.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {e.location}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {e.attendeeCount} going{e.spotsLeft != null ? ` · ${e.spotsLeft} left` : ""}
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
