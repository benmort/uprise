"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Logo } from "@yarns/ui";
import { auth } from "@yarns/api-client";


export default function VerifyEmailPage() {
  const prefill = useQueryParams().get("email") ?? "";
  const [email, setEmail] = useState(prefill);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const res = await auth.sendEmailVerification(email.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setInfo("If that email has an account, a verification code is on its way.");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.confirmEmailVerification(email.trim(), code.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center"><Logo large /></div>
        <CardTitle>Verify your email</CardTitle>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-muted-foreground">
            Your email is verified.{" "}
            <Link className="text-primary hover:underline" href="/login">Sign in</Link>
          </p>
        ) : (
          <form onSubmit={confirm} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Verification code" htmlFor="code" hint={info ?? undefined} error={error ?? undefined}>
              <Input id="code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={busy || !email} onClick={sendCode}>Send code</Button>
              <Button type="submit" className="flex-1" disabled={busy}>{busy ? "…" : "Verify"}</Button>
            </div>
          </form>
        )}
        <div className="mt-4 text-sm">
          <Link className="text-primary hover:underline" href="/login">Back to sign in</Link>
        </div>
      </CardContent>
    </Card>
  );
}
