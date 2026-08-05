"use client";

import { useState } from "react";
import { publicActions, type PublicActionPagePayload } from "@uprise/api-client";

/**
 * The EVENT_RSVP action page's widget — the RSVP counterpart to ClickToCallWidget.
 *
 * Posts to `/actions/public/pages/:slug/rsvp` rather than straight to the events surface, so the
 * page's own policy applies: rate limits, the embed-ancestor check, Turnstile, and the field
 * config the organiser chose. The event itself still owns capacity and waitlisting — a full
 * event comes back WAITLISTED here exactly as it would on the public events page.
 */
type Props = { slug: string; page: PublicActionPagePayload };

function whenText(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const date = start.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const from = start.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  if (!endsAt) return `${date}, ${from}`;
  const to = new Date(endsAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${from} – ${to}`;
}

export function EventRsvpWidget({ slug, page }: Props) {
  const event = page.event;
  const config = page.page;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [guests, setGuests] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ waitlisted: boolean } | null>(null);

  // A page whose event was deleted after publish: say so rather than rendering an empty shell.
  if (!event) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
        This event is no longer available.
      </div>
    );
  }

  const full = event.spotsLeft !== null && event.spotsLeft <= 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await publicActions.createRsvp(slug, {
      supporter: {
        name: name.trim(),
        ...(config.collectEmail ? { email: email.trim() } : {}),
        ...(config.collectPhone ? { phone: phone.trim() } : {}),
      },
      guests,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone({ waitlisted: res.data.status === "WAITLISTED" });
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" className="h-40 w-full object-cover" />
        ) : null}
        <div className="space-y-2 p-5">
          <h1 className="text-xl font-extrabold text-foreground">{config.headline ?? event.title}</h1>
          <p className="text-sm font-medium text-foreground">{whenText(event.startsAt, event.endsAt)}</p>
          {event.location ? <p className="text-sm text-muted-foreground">{event.location}</p> : null}
          {config.body ? (
            <p className="whitespace-pre-line pt-1 text-sm text-muted-foreground">{config.body}</p>
          ) : event.description ? (
            <p className="whitespace-pre-line pt-1 text-sm text-muted-foreground">{event.description}</p>
          ) : null}
          {/* Capacity is only mentioned when there IS one — "unlimited spots" is noise. */}
          {event.capacity !== null ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {full
                ? "This event is full — you can join the waitlist."
                : `${event.spotsLeft} of ${event.capacity} spots left`}
            </p>
          ) : null}
        </div>
      </section>

      {done ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-base font-bold text-foreground">
            {done.waitlisted ? "You're on the waitlist" : "You're going"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {config.successMessage ??
              (done.waitlisted
                ? "We'll be in touch if a spot opens up."
                : "We've saved your spot — see you there.")}
          </p>
        </section>
      ) : !config.rsvpEnabled ? (
        <section className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          {config.preview
            ? "This is a preview — RSVPs are not collected until the page is published."
            : "RSVPs are closed for this event."}
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
          <label className="block text-sm font-medium text-foreground">
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              autoComplete="name"
            />
          </label>
          {config.collectEmail ? (
            <label className="block text-sm font-medium text-foreground">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                autoComplete="email"
              />
            </label>
          ) : null}
          {config.collectPhone ? (
            <label className="block text-sm font-medium text-foreground">
              Mobile
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                autoComplete="tel"
              />
            </label>
          ) : null}
          <label className="block text-sm font-medium text-foreground">
            Bringing anyone?
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
            >
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Just me" : `+${n} guest${n > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <button
            type="button"
            disabled={submitting || !name.trim()}
            onClick={() => void submit()}
            className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Sending…" : (config.ctaLabel ?? (full ? "Join the waitlist" : "RSVP"))}
          </button>
        </section>
      )}
    </div>
  );
}
