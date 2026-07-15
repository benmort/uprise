"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import { captureAttribution } from "@/lib/attribution";
import {
  Alert,
  Button,
  Field,
  Input,
  OtpInput,
  Spinner,
  TurnstileWidget,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth } from "@uprise/api-client";

/**
 * Volunteer self-signup → organiser approval, phone-first. Step 1 collects name +
 * mobile + workspace and texts a code; step 2 verifies it; the request then sits in
 * the organiser's approval queue (no session is issued until approved).
 */
export default function VolunteerJoinPage() {
  const org = useQueryParams().get("org") ?? "";
  const [step, setStep] = useState<"details" | "code" | "done">("details");
  const [tenantSlug, setTenantSlug] = useState(org);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.requestAccessByPhone(
      {
        phone: phone.trim(),
        displayName: name.trim(),
        requestedRole: "volunteer",
        tenantSlug: tenantSlug.trim(),
        ...captureAttribution(),
      },
      captchaToken,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep("code");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await auth.confirmAccessByPhone({ phone: phone.trim(), code: code.trim(), tenantSlug: tenantSlug.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-extrabold text-foreground">Request sent</h1>
        <p className="text-sm text-muted-foreground">
          An organiser will review it. We&apos;ll text you when you&apos;re approved.
        </p>
        <Link href="/volunteer/sign-in" className="mt-6 inline-block font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center px-5 py-8">
      <div className="mb-5">
        <Link href="/volunteer/sign-in" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-2xl font-extrabold text-foreground">Request to join</h1>
        <p className="text-sm text-muted-foreground">
          {step === "details" ? "Ask an organiser to let you canvass." : "Enter the code we texted you."}
        </p>
      </div>
      {step === "details" ? (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Your name" htmlFor="name">
            <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Mobile number" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+61 400 000 000"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Workspace" htmlFor="org">
            <Input id="org" placeholder="your-campaign" required value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
          </Field>
          {error ? <Alert variant="error" title={error} /> : null}
          <TurnstileWidget ref={captchaRef} />
          <Button
            type="submit"
            className="h-12 w-full text-base"
            disabled={busy || !name.trim() || phone.trim().length < 6 || !tenantSlug.trim()}
          >
            {busy ? (
              <>
                <Spinner className="mr-2" />
                Sending…
              </>
            ) : (
              "Request access"
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-6">
          <OtpInput value={code} onChange={setCode} length={6} />
          {error ? <Alert variant="error" title={error} /> : null}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy || code.length !== 6}>
            {busy ? (
              <>
                <Spinner className="mr-2" />
                Verifying…
              </>
            ) : (
              "Verify"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
