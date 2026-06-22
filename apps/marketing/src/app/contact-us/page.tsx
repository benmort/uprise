"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@yarns/ui";
import { marketing } from "@yarns/api-client";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", subject: "", message: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await marketing.contact({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || undefined,
      subject: form.subject.trim() || undefined,
      message: form.message.trim(),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Contact us</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-muted-foreground">Thanks — we&apos;ll be in touch shortly.</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Name" htmlFor="name"><Input id="name" required value={form.name} onChange={set("name")} /></Field>
              <Field label="Email" htmlFor="email"><Input id="email" type="email" required value={form.email} onChange={set("email")} /></Field>
              <Field label="Organisation" htmlFor="company"><Input id="company" value={form.company} onChange={set("company")} /></Field>
              <Field label="Subject" htmlFor="subject"><Input id="subject" value={form.subject} onChange={set("subject")} /></Field>
              <Field label="Message" htmlFor="message" error={error ?? undefined}>
                <Textarea id="message" required rows={5} value={form.message} onChange={set("message")} />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send message"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
