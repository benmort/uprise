"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryParams } from "@/lib/use-query";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Logo } from "@yarns/ui";
import { auth, isTwofaChallenge } from "@yarns/api-client";
import { completeAuth } from "@/lib/session";


export default function LoginPage() {
  const returnTo = useQueryParams().get("return_to");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.login(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (isTwofaChallenge(res.data)) {
      const rt = returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : "";
      window.location.assign(`/2fa?challengeId=${encodeURIComponent(res.data.challengeId)}${rt}`);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex justify-center">
          <Logo large />
        </div>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password" error={error ?? undefined}>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <Link className="text-primary hover:underline" href={`/magic-link${q}`}>Email me a link</Link>
          <Link className="text-primary hover:underline" href={`/reset-password${q}`}>Forgot password?</Link>
        </div>
        <div className="mt-2 text-sm">
          New here?{" "}
          <Link className="text-primary hover:underline" href={`/sign-up${q}`}>Create a workspace</Link>
        </div>
      </CardContent>
    </Card>
  );
}
