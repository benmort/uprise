"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Logo } from "@yarns/ui";
import { auth } from "@yarns/api-client";
import { completeAuth } from "@/lib/session";


export default function MagicLinkPage() {
  const params = useQueryParams();
  const token = params.get("token");
  const returnTo = params.get("return_to");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const consumed = useRef(false);

  // Consume a magic link arriving via ?token=
  useEffect(() => {
    if (!token || consumed.current) return;
    consumed.current = true;
    void (async () => {
      const res = await auth.consumeMagicLink(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      completeAuth(res.data.memberships, returnTo);
    })();
  }, [token, returnTo]);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.requestMagicLink(email.trim());
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setSent(true);
  }

  if (token) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          {error ? <span className="text-error">{error}</span> : "Signing you in…"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center"><Logo large /></div>
        <CardTitle>Email me a sign-in link</CardTitle>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">If that email has an account, a sign-in link is on its way. Check your inbox.</p>
        ) : (
          <form onSubmit={request} className="space-y-4">
            <Field label="Email" htmlFor="email" error={error ?? undefined}>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send link"}</Button>
          </form>
        )}
        <div className="mt-4 text-sm">
          <Link className="text-primary hover:underline" href="/login">Back to sign in</Link>
        </div>
      </CardContent>
    </Card>
  );
}
