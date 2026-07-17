"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, CheckCircle2, MapPin, Users } from "lucide-react";
import { getPublicEvent, publicEventRsvp } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/**
 * Public event RSVP — chrome-less, unauthenticated. Reachable at /e/[eventId] only when
 * the event has publicRsvpEnabled + is PUBLISHED (enforced by the API). Supporters register
 * without a session; over-capacity RSVPs are accepted onto the waitlist.
 */
export default function PublicEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data, loading, error, refetch } = useApi(`/public-events/${eventId}`, () => getPublicEvent(eventId), {
    ttlMs: 30_000,
  });

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"GOING" | "WAITLIST" | null>(null);
  const [submitError, setSubmitError] = useState("");

  const submit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setSubmitError("");
    const res = await publicEventRsvp(eventId, {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setSubmitError(res.error);
      return;
    }
    setDone(res.data.status === "WAITLIST" ? "WAITLIST" : "GOING");
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <StateRegion
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        empty={!loading && !error && !data}
        emptyTitle="Event not found"
        emptyDescription="This event isn't open for public RSVPs, or the link is wrong."
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {data ? (
          <>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground">{data.title}</h1>
            {data.description ? <p className="mt-2 text-muted-foreground">{data.description}</p> : null}
            <div className="mt-4 space-y-1.5 text-sm text-foreground">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                {new Date(data.startsAt).toLocaleString("en-AU")}
              </p>
              {data.location ? (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {data.location}
                </p>
              ) : null}
              <p className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                {data.attendeeCount} going
                {data.spotsLeft != null ? ` · ${data.spotsLeft} spots left` : ""}
              </p>
            </div>

            {done ? (
              <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                <p className="mt-2 text-lg font-bold text-foreground">
                  {done === "WAITLIST" ? "You're on the waitlist" : "You're going!"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {done === "WAITLIST"
                    ? "This event is full — we'll be in touch if a spot opens up."
                    : "Thanks for registering. We'll see you there."}
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-3 rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-lg font-bold text-foreground">RSVP</h2>
                <Field label="Your name" htmlFor="rsvp-name" required>
                  <Input id="rsvp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label="Email" htmlFor="rsvp-email">
                  <Input id="rsvp-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </Field>
                <Field label="Phone" htmlFor="rsvp-phone">
                  <Input id="rsvp-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </Field>
                {submitError ? <p className="text-sm text-error">{submitError}</p> : null}
                <Button className="w-full" onClick={submit} disabled={busy || !form.name.trim()}>
                  {busy ? "Registering…" : "Count me in"}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </StateRegion>
    </div>
  );
}
