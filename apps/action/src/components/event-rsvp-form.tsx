"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { AddToCalendar, Button, Field, Input, ShareCard } from "@uprise/ui";
import { request } from "@uprise/api-client";

type Props = {
  eventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  full: boolean;
  secondaryColour: string | null;
  secondaryTextColour: string | null;
};

/** The public RSVP form — capacity-aware CTA, +guests, and a confirmation card with add-to-calendar,
 *  share, and a self-manage link. Posts to the tokenless public endpoint (no session). */
export function EventRsvpForm(props: Props) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", guests: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ status: string; manageToken: string | null } | null>(null);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const ctaStyle = props.secondaryColour
    ? { backgroundColor: props.secondaryColour, color: props.secondaryTextColour ?? undefined }
    : undefined;

  const submit = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    setError("");
    const res = await request<{ id: string; status: string; manageToken: string | null }>(
      `/public-events/${encodeURIComponent(props.eventId)}/rsvp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          guests: form.guests ? Number(form.guests) : undefined,
        }),
      },
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone({ status: res.data.status, manageToken: res.data.manageToken });
  };

  if (done) {
    const waitlisted = done.status === "WAITLIST";
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <p className="mt-2 text-lg font-bold text-ink">{waitlisted ? "You're on the waitlist" : "You're going!"}</p>
        <p className="mt-1 text-sm text-ink/60">
          {waitlisted
            ? "This event is full — we'll be in touch if a spot opens up."
            : "Thanks for registering. Add it to your calendar so you don't miss it."}
        </p>
        <div className="mt-4 flex flex-col items-center gap-3">
          <AddToCalendar
            event={{
              title: props.title,
              description: props.description,
              location: props.location,
              startsAt: props.startsAt,
              endsAt: props.endsAt,
              url: pageUrl,
            }}
          />
          <ShareCard url={pageUrl} title={props.title} text={`RSVP to ${props.title}`} className="w-full text-left" />
          {done.manageToken ? (
            <a
              href={`/events/rsvp/${encodeURIComponent(done.manageToken)}`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Manage your RSVP
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-ink">{props.full ? "Join the waitlist" : "RSVP"}</h2>
      <Field label="Your name" htmlFor="rsvp-name" required>
        <Input id="rsvp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </Field>
      <Field label="Email" htmlFor="rsvp-email">
        <Input id="rsvp-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      </Field>
      <Field label="Phone" htmlFor="rsvp-phone">
        <Input id="rsvp-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </Field>
      <Field label="Bringing guests? (optional)" htmlFor="rsvp-guests">
        <Input
          id="rsvp-guests"
          type="number"
          min={0}
          value={form.guests}
          onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
          placeholder="0"
        />
      </Field>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <Button
        className="h-14 w-full rounded-[0.9rem] text-base"
        variant={props.secondaryColour ? "secondary" : "default"}
        style={ctaStyle}
        disabled={busy || !form.name.trim()}
        onClick={submit}
      >
        {busy ? "Sending…" : props.full ? "Join the waitlist" : "Count me in"}
      </Button>
    </div>
  );
}
