"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import {
  Alert,
  Button,
  Field,
  PasswordInput,
  PasswordStrength,
  isPasswordStrong,
  Spinner,
  TurnstileWidget,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth } from "@uprise/api-client";

export default function ResetPasswordPage() {
  const token = useQueryParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const canSubmit = isPasswordStrong(password) && passwordsMatch;

  async function confirmReset(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.resetPassword(token as string, password, captchaToken);
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
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Reset Your Password</h1>
        <p className="text-sm text-muted-foreground">Enter your new password below.</p>
      </div>
      {!token ? (
        <Alert variant="error" title="Invalid or missing reset link">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Request a fresh link from{" "}
            <Link className="text-primary hover:underline" href="/account-recovery">account recovery</Link>.
          </p>
        </Alert>
      ) : done ? (
        <Alert variant="success" title="Password reset">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your password has been reset.{" "}
            <Link className="text-primary hover:underline" href="/sign-in">Sign in</Link>
          </p>
        </Alert>
      ) : (
        <form onSubmit={confirmReset} className="space-y-5">
          <Field label="New Password" htmlFor="password">
            <PasswordInput id="password" autoComplete="new-password" placeholder="Enter new password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <PasswordStrength value={password} />
          <Field
            label="Confirm Password"
            htmlFor="confirm"
            error={(confirm.length > 0 && !passwordsMatch ? "Passwords don't match." : undefined) ?? error ?? undefined}
          >
            <PasswordInput id="confirm" autoComplete="new-password" placeholder="Re-enter new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <TurnstileWidget ref={captchaRef} />
          <Button type="submit" className="w-full" disabled={busy || !canSubmit}>{busy ? (<><Spinner className="mr-2" />Resetting Password…</>) : "Reset Password"}</Button>
        </form>
      )}
    </div>
  );
}
