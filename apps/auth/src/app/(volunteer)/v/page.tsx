"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryParams } from "@/lib/use-query";
import {
  Alert,
  Button,
  Field,
  FieldOnboarding,
  Input,
  Spinner,
  TurnstileWidget,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth } from "@uprise/api-client";

/**
 * Volunteer phone-first sign-in (step 1): enter mobile → SMS code. The field
 * onboarding carousel shows once per device before the form. Reuses the existing
 * captcha + return_to plumbing; the OTP step lives at /v/code.
 */
export default function VolunteerSignInPage() {
  const router = useRouter();
  const params = useQueryParams();
  const returnTo = params.get("return_to");
  // Adaptive copy: a campaign/source can tailor the welcome (e.g. ?org=acme&source=doorknock).
  const org = params.get("org");
  const source = params.get("source");
  const heading = org ? `Canvass for ${org}` : "Sign in to canvass";
  const subhead =
    source === "doorknock"
      ? "Welcome back — let's get you to your next door."
      : "Enter your mobile number and we'll text you a code.";
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    const res = await auth.phoneStart(phone.trim(), captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const q = new URLSearchParams({ challengeId: res.data.challengeId });
    if (returnTo) q.set("return_to", returnTo);
    router.push(`/v/code?${q.toString()}`);
  }

  return (
    <div className="flex flex-1 flex-col justify-center px-5 py-8">
      <FieldOnboarding />
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-2xl font-extrabold text-foreground">{heading}</h1>
        <p className="text-sm text-muted-foreground">{subhead}</p>
      </div>
      <form onSubmit={start} className="space-y-5">
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
        {error ? <Alert variant="error" title={error} /> : null}
        <TurnstileWidget ref={captchaRef} />
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || phone.trim().length < 6}>
          {busy ? (
            <>
              <Spinner className="mr-2" />
              Sending…
            </>
          ) : (
            "Text me a code"
          )}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have access yet?{" "}
        <Link href="/v/join" className="font-medium text-primary hover:underline">
          Request to join
        </Link>
      </p>
    </div>
  );
}
