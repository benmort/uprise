"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Logo } from "@yarns/ui";
import { auth } from "@yarns/api-client";
import { completeAuth } from "@/lib/session";


export default function TwoFactorPage() {
  const params = useQueryParams();
  const challengeId = params.get("challengeId");
  const returnTo = params.get("return_to");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setBusy(true);
    setError(null);
    const res = await auth.verify2fa(challengeId, code.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  async function resend() {
    if (!challengeId) return;
    setInfo(null);
    const res = await auth.send2fa(challengeId);
    setInfo(res.ok ? "A new code has been sent." : res.error);
  }

  if (!challengeId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-error">
          Missing 2FA challenge. <Link className="text-primary hover:underline" href="/login">Start again</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center"><Logo large /></div>
        <CardTitle>Two-factor verification</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={verify} className="space-y-4">
          <Field label="Code" htmlFor="code" hint={info ?? "We sent a code to your mobile."} error={error ?? undefined}>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Verifying…" : "Verify"}</Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button type="button" className="text-primary hover:underline" onClick={resend}>Resend code</button>
          <Link className="text-primary hover:underline" href="/login">Cancel</Link>
        </div>
      </CardContent>
    </Card>
  );
}
