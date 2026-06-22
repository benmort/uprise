"use client";

import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@yarns/ui";
import { marketing } from "@yarns/api-client";

export default function RequestDemoPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", role: "", useCase: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await marketing.demoRequest({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || undefined,
      role: form.role.trim() || undefined,
      useCase: form.useCase.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Request a demo</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <p className="text-sm text-muted-foreground">Thanks — we&apos;ll reach out to schedule your demo.</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Name" htmlFor="name"><Input id="name" required value={form.name} onChange={set("name")} /></Field>
              <Field label="Email" htmlFor="email"><Input id="email" type="email" required value={form.email} onChange={set("email")} /></Field>
              <Field label="Organisation" htmlFor="company"><Input id="company" value={form.company} onChange={set("company")} /></Field>
              <Field label="Your role" htmlFor="role"><Input id="role" value={form.role} onChange={set("role")} /></Field>
              <Field label="What do you want to achieve?" htmlFor="useCase" error={error ?? undefined}>
                <Textarea id="useCase" rows={4} value={form.useCase} onChange={set("useCase")} />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Request demo"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
