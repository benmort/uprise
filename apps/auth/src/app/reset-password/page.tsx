"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, PasswordInput, Input } from "@yarns/ui";
import { auth } from "@yarns/api-client";


export default function ResetPasswordPage() {
  const token = useQueryParams().get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.forgotPassword(email.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
    setResendCountdown(30);
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

  // Confirm a reset arriving via ?token=
  if (token) {
    return (
      <div className="flex w-full flex-col">
        <div className="mb-5">
          <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Reset Your Password</h1>
          <p className="text-sm text-muted-foreground">Enter your new password below.</p>
        </div>
        {done ? (
          <Alert variant="success" title="Password reset" message="Your password has been reset.">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your password has been reset.{" "}
              <Link className="text-primary hover:underline" href="/login">Sign in</Link>
            </p>
          </Alert>
        ) : (
          <form onSubmit={confirmReset} className="space-y-5">
            <Field label="New Password" htmlFor="password" hint="At least 8 characters" error={error ?? undefined}>
              <PasswordInput id="password" autoComplete="new-password" placeholder="Enter new password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Resetting Password…" : "Reset Password"}</Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Forgot Your Password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email address linked to your account, and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      <form onSubmit={requestReset} className="space-y-5">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" placeholder="Enter your email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error ? <Alert variant="error" title={error} /> : null}
        {done ? <Alert variant="success" title="Recovery link sent" message="If that email has an account, a reset link is on its way." /> : null}
        <Button type="submit" className="w-full" disabled={busy || resendCountdown > 0}>
          {busy ? "Sending Recovery Link…" : "Send Recovery Link"}
        </Button>
      </form>
      <div className="mt-5 text-sm text-muted-foreground">
        {done ? (
          <>
            Didn&apos;t get the email?{" "}
            <button
              type="button"
              onClick={requestReset}
              disabled={busy || resendCountdown > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend"}
            </button>
          </>
        ) : (
          <>
            Wait, I remember my password…{" "}
            <Link className="text-primary hover:underline" href="/login">Click here</Link>
          </>
        )}
      </div>
    </div>
  );
}
