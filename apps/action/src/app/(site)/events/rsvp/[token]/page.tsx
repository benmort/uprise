import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalendarClock, MapPin } from "lucide-react";
import { BrandStyle } from "@uprise/ui";
import { getManageRsvp, whenRange } from "@/lib/events";
import { ManageRsvpPanel } from "@/components/manage-rsvp-panel";

/** Keep the RSVP title, add the org's favicon (square block logo). */
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await getManageRsvp(params.token);
  const tenant = data?.event.tenant ?? null;
  return {
    title: "Manage your RSVP",
    icons: tenant?.logoBlockUrl ? { icon: tenant.logoBlockUrl } : undefined,
  };
}

/** Attendee self-manage — authorised by the unguessable manage token in the URL. Change party
 *  size or cancel; branded with the event's org colours. */
export default async function ManageRsvpPage({ params }: { params: { token: string } }) {
  const data = await getManageRsvp(params.token);
  if (!data) notFound();
  const { event, rsvp } = data;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <BrandStyle brand={event.tenant ?? undefined} />
      <p className="text-sm font-bold uppercase tracking-[0.08em] text-primary">Your RSVP</p>
      <h1 className="mt-1 text-2xl font-extrabold text-foreground">{event.title}</h1>
      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          {whenRange(event.startsAt, event.endsAt)}
        </p>
        {event.location ? (
          <p className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {event.location}
          </p>
        ) : null}
      </div>
      <div className="mt-6">
        <ManageRsvpPanel token={params.token} initialGuests={rsvp.guests} initialStatus={rsvp.status} name={rsvp.name} />
      </div>
    </main>
  );
}
