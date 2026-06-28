"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Mail } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, Input, PasswordInput, Spinner, TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { auth, isTwofaChallenge } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";


export default function LoginPage() {
  const returnTo = useQueryParams().get("return_to");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.login(email.trim(), password, captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (isTwofaChallenge(res.data)) {
      const rt = returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : "";
      window.location.assign(`/two-factor-auth?challengeId=${encodeURIComponent(res.data.challengeId)}${rt}`);
      return;
    }
    completeAuth(res.data.memberships, returnTo);
  }

  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="flex w-full flex-col">
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Sign In</h1>
        <p className="text-sm text-muted-foreground">Enter your email and password to sign in!</p>
      </div>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="info@gmail.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-start">
          <Link className="text-sm text-primary hover:underline" href={`/account-recovery${q}`}>Forgot your password?</Link>
        </div>
        {error ? <Alert variant="error" title={error} /> : null}
        <TurnstileWidget ref={captchaRef} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (<><Spinner className="mr-2" />Signing in…</>) : "Sign in"}
        </Button>
        <div className="relative py-3">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-input" /></div>
          <div className="relative flex justify-center text-sm"><span className="bg-background px-4 text-muted-foreground">Or continue with</span></div>
        </div>
        <Link href={`/sign-in/magic-link${q}`} className="block">
          <Button type="button" variant="outline" className="w-full">
            <Mail className="mr-2 h-4 w-4" />
            Send Magic Link
          </Button>
        </Link>
      </form>
      <div className="mt-5 text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link className="text-primary hover:underline" href={`/sign-up${q}`}>Sign Up</Link>
      </div>
    </div>
  );
}
