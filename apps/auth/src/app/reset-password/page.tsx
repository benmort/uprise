"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, Field, PasswordInput } from "@yarns/ui";
import { auth } from "@yarns/api-client";

export default function ResetPasswordPage() {
  const token = useQueryParams().get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

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
          <Field label="New Password" htmlFor="password" hint="At least 8 characters" error={error ?? undefined}>
            <PasswordInput id="password" autoComplete="new-password" placeholder="Enter new password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Resetting Password…" : "Reset Password"}</Button>
        </form>
      )}
    </div>
  );
}
