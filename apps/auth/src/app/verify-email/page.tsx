"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, Input, Spinner, TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { auth } from "@uprise/api-client";


export default function VerifyEmailPage() {
  const prefill = useQueryParams().get("email") ?? "";
  const [email, setEmail] = useState(prefill);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.sendEmailVerification(email.trim(), captchaToken);
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
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href="/sign-in" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Verify your email</h1>
        <p className="text-sm text-muted-foreground">Enter the code we sent to confirm your email address.</p>
      </div>
      {done ? (
        <Alert variant="success" title="Email verified">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your email is verified.{" "}
            <Link className="text-primary hover:underline" href="/sign-in">Sign in</Link>
          </p>
        </Alert>
      ) : (
        <form onSubmit={confirm} className="space-y-5">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Verification code" htmlFor="code" hint={info ?? undefined} error={error ?? undefined}>
            <Input id="code" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <TurnstileWidget ref={captchaRef} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={busy || !email} onClick={sendCode}>Send code</Button>
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? (<><Spinner className="mr-2" />Verifying…</>) : "Verify My Account"}</Button>
          </div>
        </form>
      )}
    </div>
  );
}
