"use client";

import { useState } from "react";
import { Button, Input } from "@yarns/ui";
import { marketing } from "@yarns/api-client";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await marketing.newsletter(email.trim());
    setBusy(false);
    setDone(true);
  }

  if (done) return <p className="text-sm text-muted-foreground">Thanks — you&apos;re on the list.</p>;

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        type="email"
        required
        placeholder="you@org.au"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="max-w-xs"
      />
      <Button type="submit" variant="outline" disabled={busy}>
        {busy ? "…" : "Subscribe"}
      </Button>
    </form>
  );
}
