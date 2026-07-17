"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, Field, Input } from "@uprise/ui";
import { request } from "@uprise/api-client";

type Props = { token: string; initialGuests: number; initialStatus: string; name: string };

const STATUS_LABEL: Record<string, string> = {
  GOING: "You're going",
  WAITLIST: "You're on the waitlist",
  ATTENDED: "You attended — thanks!",
  CANCELLED: "Your RSVP is cancelled",
};

/** Change party size or cancel — authorised by the manage token (no session). */
export function ManageRsvpPanel({ token, initialGuests, initialStatus, name }: Props) {
  const [guests, setGuests] = useState(String(initialGuests));
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState<"save" | "cancel" | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const base = `/public-events/rsvp/${encodeURIComponent(token)}`;

  const save = async () => {
    setBusy("save");
    setMsg("");
    setError("");
    const res = await request(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guests: guests ? Number(guests) : 0 }),
    });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setMsg("Saved");
  };

  const cancel = async () => {
    setBusy("cancel");
    setError("");
    const res = await request<{ status: string }>(`${base}/cancel`, { method: "POST" });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setStatus("CANCELLED");
  };

  if (status === "CANCELLED") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-lg font-bold text-foreground">Your RSVP is cancelled</p>
        <p className="mt-1 text-sm text-muted-foreground">Changed your mind? You can RSVP again from the event page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <CheckCircle2 className="h-5 w-5 text-success" />
        {STATUS_LABEL[status] ?? "You're registered"}, {name.split(" ")[0]}
      </p>
      <Field label="Guests you're bringing" htmlFor="mng-guests">
        <Input id="mng-guests" type="number" min={0} value={guests} onChange={(e) => setGuests(e.target.value)} />
      </Field>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      {msg ? <p className="text-sm text-success">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Update"}
        </Button>
        <Button variant="outline" onClick={cancel} disabled={busy !== null}>
          {busy === "cancel" ? "Cancelling…" : "Cancel my RSVP"}
        </Button>
      </div>
    </div>
  );
}
