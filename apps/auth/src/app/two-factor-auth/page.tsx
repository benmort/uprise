"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, OtpInput } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";


export default function TwoFactorPage() {
  const params = useQueryParams();
  const challengeId = params.get("challengeId");
  const returnTo = params.get("return_to");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(30);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

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
    setError(null);
    setResendCountdown(30);
    const res = await auth.send2fa(challengeId);
    if (res.ok) setInfo("A new verification code has been sent.");
    else setError(res.error);
  }

  if (!challengeId) {
    return (
      <div className="py-8 text-center text-sm text-error">
        Missing 2FA challenge. <Link className="text-primary hover:underline" href="/sign-in">Start again</Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href="/sign-in" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">Two Step Verification</h1>
        <p className="text-sm text-muted-foreground">A verification code has been sent to your mobile.</p>
      </div>
      <form onSubmit={verify} className="space-y-6">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type your 6 digit security code</label>
          <OtpInput value={code} onChange={setCode} length={6} />
        </div>
        {error ? <Alert variant="error" title={error} /> : null}
        {info ? <Alert variant="success" title={info} /> : null}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Verify My Account"}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get the code?{" "}
        <button
          type="button"
          onClick={resend}
          disabled={resendCountdown > 0}
          className="cursor-pointer font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend"}
        </button>
      </div>
    </div>
  );
}
