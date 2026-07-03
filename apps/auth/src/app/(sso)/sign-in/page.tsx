"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Mail } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, Input, PasswordInput, Spinner, TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { auth, isTwofaChallenge, type AuthPrincipal } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";

/** Role-aware nudge for the "already signed in" interstitial. */
function roleVerb(p: AuthPrincipal): string {
  if (p.role === "VOLUNTEER") return "canvassing";
  if (p.role === "ORGANISER") return "organising";
  return "managing"; // OWNER + super-admin
}

export default function LoginPage() {
  const returnTo = useQueryParams().get("return_to");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);
  // Detect an existing session so we can offer "Continue as …" / "Switch account"
  // (mirrors the marketing site; marketing's "Switch account" link lands here).
  const [checking, setChecking] = useState(true);
  const [existing, setExisting] = useState<AuthPrincipal | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let active = true;
    auth
      .checkSession()
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data.user) setExisting(res.data.user);
        setChecking(false);
      })
      .catch(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, []);

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

  // "Switch account" must clear the session — otherwise the valid cookie keeps
  // funnelling the user back to this "Welcome back" screen. Logging out drops the
  // cookie so checkSession returns null and the sign-in form takes over.
  async function switchAccount() {
    setSwitching(true);
    await auth.logout();
    setExisting(null);
  }

  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";
  const homepageUrl = process.env.NEXT_PUBLIC_MARKETING_URL || "http://localhost:3003";

  // Brief check before deciding form vs "already signed in", to avoid a flash.
  if (checking) {
    return (
      <div className="flex w-full justify-center py-16">
        <Spinner className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  // Already signed in — offer to continue with the current session or switch accounts.
  if (existing && !switching) {
    return (
      <div className="flex w-full flex-col">
        <div className="mb-6">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re already signed in. Let&apos;s get {roleVerb(existing)}.
          </p>
        </div>
        <div className="space-y-3">
          <Button className="w-full gap-2" onClick={() => completeAuth(existing.memberships, returnTo)}>
            Continue as {existing.email}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="w-full" disabled={switching} onClick={switchAccount}>
            Switch account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <a href={homepageUrl} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to homepage
        </a>
      </div>
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
