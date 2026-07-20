"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { CalendarClock, CheckCircle2, Download, MapPin, Navigation, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import {
  cancelEvent,
  cancelEventRsvp,
  checkInRsvp,
  createShift,
  createVolunteer,
  eventRsvpsExportUrl,
  getEvent,
  rsvpEvent,
  updateEvent,
  type EventDetail,
  type EventRsvp,
} from "@/lib/api";
import { getActionAppUrl } from "@uprise/api-client";
import { AddToCalendar, CapacityMeter, EventStatusBadge, ShareCard, useCountdown } from "@uprise/ui";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SectionCard } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { EventFormDialog } from "@/components/events/event-form-dialog";

// mapbox touches window — keep the location pin out of SSR.
const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-xl" />,
});

const heads = (rsvps: EventRsvp[], statuses: EventRsvp["status"][]) =>
  rsvps.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + 1 + (r.guests ?? 0), 0);

/** A throwaway strong-ish password for an organiser-minted volunteer account (they sign in via
 *  reset/magic-link afterwards; createVolunteer requires one). */
function tempPassword(): string {
  return `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6).toUpperCase()}9!`;
}

const EMPTY_SHIFT = { name: "", startsAt: "", endsAt: "", capacity: "" };

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(`/events/${eventId}`, () => getEvent(eventId), {
    ttlMs: 15_000,
  });
  const event = data as EventDetail | null;

  const [editOpen, setEditOpen] = useState(false);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [rsvpForm, setRsvpForm] = useState({ name: "", email: "", phone: "", guests: "" });
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);
  const [busy, setBusy] = useState(false);

  const countdown = useCountdown(
    event?.startsAt ?? new Date().toISOString(),
    event?.endsAt ?? new Date().toISOString(),
    event?.derivedStatus,
  );
  const goingHeads = useMemo(() => (event ? heads(event.rsvps, ["GOING", "ATTENDED"]) : 0), [event]);
  const waitHeads = useMemo(() => (event ? heads(event.rsvps, ["WAITLIST"]) : 0), [event]);
  const publicUrl = event ? `${getActionAppUrl()}/events/${event.id}` : "";

  const publish = useCallback(async () => {
    const res = await updateEvent(eventId, { status: "PUBLISHED" });
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't publish", description: res.error });
    void refetch();
    showToast({ tone: "success", title: "Event published" });
  }, [eventId, refetch, showToast]);

  const cancel = useCallback(async () => {
    const res = await cancelEvent(eventId);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't cancel", description: res.error });
    void refetch();
    showToast({ tone: "success", title: "Event cancelled" });
  }, [eventId, refetch, showToast]);

  const addRsvp = useCallback(async () => {
    if (!rsvpForm.name.trim()) return;
    setBusy(true);
    const res = await rsvpEvent(eventId, {
      name: rsvpForm.name.trim(),
      email: rsvpForm.email.trim() || undefined,
      phone: rsvpForm.phone.trim() || undefined,
      guests: rsvpForm.guests ? Number(rsvpForm.guests) : undefined,
    });
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't add RSVP", description: res.error });
    setRsvpOpen(false);
    setRsvpForm({ name: "", email: "", phone: "", guests: "" });
    void refetch();
    showToast({ tone: "success", title: "RSVP added" });
  }, [eventId, rsvpForm, refetch, showToast]);

  const removeRsvp = useCallback(
    async (rsvpId: string) => {
      const res = await cancelEventRsvp(eventId, rsvpId);
      if (!res.ok) return showToast({ tone: "error", title: "Couldn't cancel RSVP", description: res.error });
      void refetch();
    },
    [eventId, refetch, showToast],
  );

  const checkIn = useCallback(
    async (rsvpId: string) => {
      const res = await checkInRsvp(eventId, rsvpId);
      if (!res.ok) return showToast({ tone: "error", title: "Couldn't check in", description: res.error });
      void refetch();
    },
    [eventId, refetch, showToast],
  );

  const inviteAsVolunteer = useCallback(
    async (r: EventRsvp) => {
      if (!r.email) return showToast({ tone: "warning", title: "Needs an email to invite" });
      const res = await createVolunteer({ displayName: r.name, email: r.email, password: tempPassword(), role: "VOLUNTEER" });
      if (!res.ok) return showToast({ tone: "error", title: "Couldn't invite", description: res.error });
      showToast({ tone: "success", title: `${r.name} added as a volunteer` });
    },
    [showToast],
  );

  const addShift = useCallback(async () => {
    if (!event || !shiftForm.name.trim() || !shiftForm.startsAt || !shiftForm.endsAt) return;
    setBusy(true);
    const res = await createShift({
      type: "EVENT",
      eventId: event.id,
      campaignId: event.campaignId ?? undefined,
      name: shiftForm.name.trim(),
      location: event.location ?? undefined,
      startsAt: new Date(shiftForm.startsAt).toISOString(),
      endsAt: new Date(shiftForm.endsAt).toISOString(),
      capacity: shiftForm.capacity ? Number(shiftForm.capacity) : undefined,
    });
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't add shift", description: res.error });
    setShiftOpen(false);
    setShiftForm(EMPTY_SHIFT);
    void refetch();
    showToast({ tone: "success", title: "Staffing shift added" });
  }, [event, shiftForm, refetch, showToast]);

  return (
    <PageShell
      icon={CalendarClock}
      title={event?.title ?? "Event"}
      backHref="/events"
      backLabel="Events"
      actions={
        event ? (
          <div className="flex flex-wrap gap-2">
            {event.status !== "PUBLISHED" ? <Button size="sm" onClick={publish}>Publish</Button> : null}
            <AddToCalendar
              event={{ title: event.title, description: event.description, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt, url: publicUrl }}
            />
            {event.status !== "CANCELLED" ? (
              <Button size="sm" variant="outline" onClick={cancel}>Cancel event</Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit
            </Button>
          </div>
        ) : null
      }
    >
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && !event}
        emptyTitle="Event not found"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {event ? (
          <>
            {event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <EventStatusBadge status={event.derivedStatus} />
              <span className="text-sm font-medium text-muted-foreground">{countdown}</span>
            </div>

            <SectionCard title="Capacity">
              <CapacityMeter going={goingHeads} waitlist={waitHeads} capacity={event.capacity} />
            </SectionCard>

            <SectionCard title="Details">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="text-foreground">
                    {new Date(event.startsAt).toLocaleString("en-AU")} – {new Date(event.endsAt).toLocaleString("en-AU")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Where</dt>
                  <dd className="flex items-center gap-1 text-foreground">
                    {event.location ? (
                      <>
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                {event.category ? (
                  <div>
                    <dt className="text-muted-foreground">Category</dt>
                    <dd className="text-foreground">{event.category}</dd>
                  </div>
                ) : null}
              </dl>
              {event.description ? <p className="mt-3 text-sm text-foreground">{event.description}</p> : null}
              {event.lat != null && event.lng != null ? (
                <div className="mt-3 space-y-2">
                  <div className="overflow-hidden rounded-xl border border-border">
                    <TurfMap mode="view" stops={[{ id: event.id, lat: event.lat, lng: event.lng, status: "PENDING" }]} focusPoint={{ lat: event.lat, lng: event.lng }} />
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <Navigation className="h-4 w-4" />
                    Get directions
                  </a>
                </div>
              ) : null}
            </SectionCard>

            {event.publicRsvpEnabled ? (
              <SectionCard title="Share &amp; promote" description="Reminders send automatically 24 hours before the event.">
                <ShareCard url={publicUrl} title={event.title} text={`RSVP to ${event.title}`} qr />
              </SectionCard>
            ) : null}

            <SectionCard
              title={`RSVPs (${event.rsvps.length})`}
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" asChild>
                    <a href={eventRsvpsExportUrl(event.id)} download>
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRsvpOpen(true)}>
                    <Users className="mr-1.5 h-4 w-4" />
                    Add RSVP
                  </Button>
                </div>
              }
            >
              {event.rsvps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {event.rsvps.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          {r.name}
                          {r.guests > 0 ? <span className="text-xs font-normal text-muted-foreground">+{r.guests}</span> : null}
                          {r.status === "ATTENDED" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.email, r.phone].filter(Boolean).join(" · ") || "—"} · {r.status.toLowerCase()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.status !== "CANCELLED" && r.status !== "ATTENDED" ? (
                          <button type="button" onClick={() => checkIn(r.id)} className="text-xs font-medium text-primary hover:underline">
                            Check in
                          </button>
                        ) : null}
                        {r.email ? (
                          <button type="button" aria-label="Invite as volunteer" title="Invite as volunteer" onClick={() => inviteAsVolunteer(r)} className="text-muted-foreground hover:text-foreground">
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {r.status !== "CANCELLED" ? (
                          <button type="button" aria-label="Cancel RSVP" onClick={() => removeRsvp(r.id)} className="text-muted-foreground hover:text-error">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title={`Staffing shifts (${event.shifts.length})`}
              action={
                <Button size="sm" variant="outline" onClick={() => setShiftOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add shift
                </Button>
              }
            >
              {event.shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No volunteer shifts staff this event yet.</p>
              ) : (
                <ul className="space-y-2">
                  {event.shifts.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.startsAt).toLocaleString("en-AU")} – {new Date(s.endsAt).toLocaleTimeString("en-AU")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </>
        ) : null}
      </StateRegion>

      <EventFormDialog open={editOpen} event={event} onClose={() => setEditOpen(false)} onSaved={() => void refetch()} />

      <FormDialog
        open={rsvpOpen}
        title="Add RSVP"
        onClose={() => setRsvpOpen(false)}
        onSubmit={addRsvp}
        busy={busy}
        submitDisabled={!rsvpForm.name.trim()}
      >
        <Field label="Name" htmlFor="rsvp-name" required>
          <Input id="rsvp-name" value={rsvpForm.name} onChange={(e) => setRsvpForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Email" htmlFor="rsvp-email" className="col-span-2">
            <Input id="rsvp-email" type="email" value={rsvpForm.email} onChange={(e) => setRsvpForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Guests" htmlFor="rsvp-guests">
            <Input id="rsvp-guests" type="number" min={0} value={rsvpForm.guests} onChange={(e) => setRsvpForm((f) => ({ ...f, guests: e.target.value }))} />
          </Field>
        </div>
        <Field label="Phone" htmlFor="rsvp-phone">
          <Input id="rsvp-phone" value={rsvpForm.phone} onChange={(e) => setRsvpForm((f) => ({ ...f, phone: e.target.value }))} />
        </Field>
      </FormDialog>

      <FormDialog
        open={shiftOpen}
        title="Add a staffing shift"
        onClose={() => setShiftOpen(false)}
        onSubmit={addShift}
        busy={busy}
        submitDisabled={!shiftForm.name.trim() || !shiftForm.startsAt || !shiftForm.endsAt}
      >
        <Field label="Shift name" htmlFor="shift-name" required>
          <Input id="shift-name" value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Setup crew" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="shift-start" required>
            <Input id="shift-start" type="datetime-local" value={shiftForm.startsAt} onChange={(e) => setShiftForm((f) => ({ ...f, startsAt: e.target.value }))} />
          </Field>
          <Field label="Ends" htmlFor="shift-end" required>
            <Input id="shift-end" type="datetime-local" value={shiftForm.endsAt} onChange={(e) => setShiftForm((f) => ({ ...f, endsAt: e.target.value }))} />
          </Field>
        </div>
        <Field label="Capacity" htmlFor="shift-cap">
          <Input id="shift-cap" type="number" min={1} value={shiftForm.capacity} onChange={(e) => setShiftForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="Unlimited" />
        </Field>
      </FormDialog>
    </PageShell>
  );
}
