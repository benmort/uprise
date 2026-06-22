"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Logo } from "@yarns/ui";
import { auth } from "@yarns/api-client";


export default function ResetPasswordPage() {
  const token = useQueryParams().get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.forgotPassword(email.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  async function confirmReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.resetPassword(token as string, password);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center"><Logo large /></div>
        <CardTitle>{token ? "Choose a new password" : "Reset your password"}</CardTitle>
      </CardHeader>
      <CardContent>
        {done ? (
          <p className="text-sm text-muted-foreground">
            {token ? "Your password has been reset." : "If that email has an account, a reset link is on its way."}{" "}
            <Link className="text-primary hover:underline" href="/login">Sign in</Link>
          </p>
        ) : token ? (
          <form onSubmit={confirmReset} className="space-y-4">
            <Field label="New password" htmlFor="password" hint="At least 8 characters" error={error ?? undefined}>
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Reset password"}</Button>
          </form>
        ) : (
          <form onSubmit={requestReset} className="space-y-4">
            <Field label="Email" htmlFor="email" error={error ?? undefined}>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
          </form>
        )}
        <div className="mt-4 text-sm">
          <Link className="text-primary hover:underline" href="/login">Back to sign in</Link>
        </div>
      </CardContent>
    </Card>
  );
}
