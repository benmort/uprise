"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, Input, TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";


export default function MagicLinkPage() {
  const params = useQueryParams();
  const token = params.get("token");
  const returnTo = params.get("return_to");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const consumed = useRef(false);
  const captchaRef = useRef<TurnstileHandle>(null);

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

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.requestMagicLink(email.trim(), captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(true);
    setResendCountdown(30);
  }

  if (token) {
    return (
      <div className="py-8 text-center text-sm">
        {error ? <span className="text-error">{error}</span> : "Signing you in…"}
      </div>
    );
  }

  const q = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href={`/sign-in${q}`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Sign in with Magic Link</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we&apos;ll send you a secure link to sign in</p>
      </div>
      <form onSubmit={request} className="space-y-5">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="Enter your email address" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error ? <Alert variant="error" title={error} /> : null}
        {sent ? <Alert variant="success" title="Magic link sent" message="If that email has an account, a sign-in link is on its way. Check your inbox." /> : null}
        <TurnstileWidget ref={captchaRef} />
        <Button type="submit" className="w-full" disabled={busy || resendCountdown > 0}>
          {busy ? "Sending…" : "Send Magic Link"}
        </Button>
      </form>
      <div className="mt-5 text-sm text-muted-foreground">
        {sent ? (
          <>
            Didn&apos;t get the link?{" "}
            <button
              type="button"
              onClick={request}
              disabled={busy || resendCountdown > 0}
              className="cursor-pointer font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend"}
            </button>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link className="text-primary hover:underline" href={`/sign-up${q}`}>Sign up here</Link>
          </>
        )}
      </div>
    </div>
  );
}
