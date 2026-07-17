"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, MapPin, Pencil, Trash2, Users } from "lucide-react";
import {
  cancelEvent,
  cancelEventRsvp,
  getEvent,
  rsvpEvent,
  updateEvent,
  type EventDetail,
} from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SectionCard, KpiTile } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { EventFormDialog } from "@/components/events/event-form-dialog";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { showToast } = useToast();
  const { data, loading, error, noPermission, refetch } = useApi(
    `/events/${eventId}`,
    () => getEvent(eventId),
    { ttlMs: 15_000 },
  );
  const event = data as EventDetail | null;

  const [editOpen, setEditOpen] = useState(false);
  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [rsvpForm, setRsvpForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);

  const going = event ? event.rsvps.filter((r) => r.status === "GOING" || r.status === "ATTENDED").length : 0;

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
    });
    setBusy(false);
    if (!res.ok) return showToast({ tone: "error", title: "Couldn't add RSVP", description: res.error });
    setRsvpOpen(false);
    setRsvpForm({ name: "", email: "", phone: "" });
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

  return (
    <PageShell
      icon={CalendarClock}
      title={event?.title ?? "Event"}
      backHref="/canvass/events"
      backLabel="Events"
      actions={
        event ? (
          <div className="flex gap-2">
            {event.status !== "PUBLISHED" ? (
              <Button size="sm" onClick={publish}>Publish</Button>
            ) : null}
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Going" value={going.toLocaleString()} />
              <KpiTile label="Capacity" value={event.capacity != null ? event.capacity.toLocaleString() : "∞"} />
              <KpiTile
                label="Spots left"
                value={event.capacity != null ? Math.max(0, event.capacity - going).toLocaleString() : "∞"}
              />
              <KpiTile label="Status" value={event.derivedStatus} />
            </div>

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
                {event.publicRsvpEnabled ? (
                  <div>
                    <dt className="text-muted-foreground">Public RSVP link</dt>
                    <dd className="break-all font-mono text-xs text-primary">/e/{event.id}</dd>
                  </div>
                ) : null}
              </dl>
              {event.description ? <p className="mt-3 text-sm text-foreground">{event.description}</p> : null}
            </SectionCard>

            <SectionCard
              title={`RSVPs (${event.rsvps.length})`}
              action={
                <Button size="sm" variant="outline" onClick={() => setRsvpOpen(true)}>
                  <Users className="mr-1.5 h-4 w-4" />
                  Add RSVP
                </Button>
              }
            >
              {event.rsvps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {event.rsvps.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[r.email, r.phone].filter(Boolean).join(" · ") || "—"} · {r.status.toLowerCase()}
                        </p>
                      </div>
                      {r.status !== "CANCELLED" ? (
                        <button
                          type="button"
                          aria-label="Cancel RSVP"
                          onClick={() => removeRsvp(r.id)}
                          className="text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={`Staffing shifts (${event.shifts.length})`}>
              {event.shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No volunteer shifts staff this event yet. Create an EVENT-type shift linked to it from the Shifts page.
                </p>
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" htmlFor="rsvp-email">
            <Input id="rsvp-email" type="email" value={rsvpForm.email} onChange={(e) => setRsvpForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Phone" htmlFor="rsvp-phone">
            <Input id="rsvp-phone" value={rsvpForm.phone} onChange={(e) => setRsvpForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
        </div>
      </FormDialog>
    </PageShell>
  );
}
