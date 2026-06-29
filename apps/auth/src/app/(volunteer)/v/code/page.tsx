"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, OtpInput, Spinner, TurnstileWidget, type TurnstileHandle } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";

/**
 * Volunteer phone-first sign-in (step 2): enter the SMS code → session. Mirrors the
 * 2FA screen; on success runs the shared completeAuth (→ select-tenant or return_to).
 */
export default function VolunteerCodePage() {
  const params = useQueryParams();
  const challengeId = params.get("challengeId");
  const returnTo = params.get("return_to");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(30);
  const captchaRef = useRef<TurnstileHandle>(null);

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
    const res = await auth.phoneVerify(challengeId, code.trim());
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
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.phoneResend(challengeId, captchaToken);
    if (res.ok) setInfo("A new code is on its way.");
    else setError(res.error);
  }

  const back = `/v${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ""}`;
  if (!challengeId) {
    return (
      <div className="py-8 text-center text-sm text-error">
        Missing code challenge.{" "}
        <Link className="text-primary hover:underline" href={back}>
          Start again
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-5">
        <Link href={back} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-2xl font-extrabold text-foreground">Enter your code</h1>
        <p className="text-sm text-muted-foreground">We sent a 6-digit code to your phone.</p>
      </div>
      <form onSubmit={verify} className="space-y-6">
        <OtpInput value={code} onChange={setCode} length={6} />
        {error ? <Alert variant="error" title={error} /> : null}
        {info ? <Alert variant="success" title={info} /> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || code.length !== 6}>
          {busy ? (
            <>
              <Spinner className="mr-2" />
              Verifying…
            </>
          ) : (
            "Verify & continue"
          )}
        </Button>
      </form>
      <TurnstileWidget ref={captchaRef} />
      <div className="mt-6 text-center text-sm text-muted-foreground">
        Didn&apos;t get it?{" "}
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
