"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Shield } from "lucide-react";
import { useQueryParams } from "@/lib/use-query";
import {
  Alert,
  Button,
  FieldOnboarding,
  Keypad,
  PhoneNumberField,
  Spinner,
  TenantBrand,
  TurnstileWidget,
  toE164,
  type TurnstileHandle,
} from "@uprise/ui";
import { auth } from "@uprise/api-client";

/**
 * Volunteer phone-first sign-in (step 1): enter mobile → SMS code. Mirrors the
 * onboarding wizard's "What's your mobile?" step (PhoneNumberField + Keypad) so a
 * returning volunteer sees the same design as a new one. The field onboarding
 * carousel shows once per device before the form; the OTP step lives at
 * /volunteer/code. Canonical URL is /volunteer/sign-in — the old /v path redirects here.
 */
export default function VolunteerSignInPage() {
  const router = useRouter();
  const params = useQueryParams();
  const returnTo = params.get("return_to");
  // A campaign/source can name the org so the brand read-out matches the wizard.
  const org = params.get("org");
  // Raw national digits (e.g. "0400000000"), driven by the Keypad + typing.
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const captchaToken = (await captchaRef.current?.execute()) ?? undefined;
    // PhoneNumberField emits national digits — normalise to E.164 for the API.
    const res = await auth.phoneStart(toE164(phone), captchaToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const q = new URLSearchParams({ challengeId: res.data.challengeId });
    if (returnTo) q.set("return_to", returnTo);
    router.push(`/volunteer/code?${q.toString()}`);
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-8">
      <FieldOnboarding />
      {org ? <TenantBrand name={org} className="mb-5" /> : null}
      <h1 className="text-3xl font-extrabold text-foreground">What&apos;s your mobile?</h1>
      <p className="mt-2 text-muted-foreground">
        Your number is your sign-in. We&apos;ll text you a code to verify it — no passwords.
      </p>
      <PhoneNumberField
        value={phone}
        className="mt-8"
        autoFocus
        onValueChange={(digits) => setPhone(digits)}
      />
      <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        Standard message rates may apply. We never share your number.
      </p>
      {error ? <Alert variant="error" title={error} className="mt-4" /> : null}
      <div className="flex-1" />
      <Keypad
        className="mt-6"
        onKey={(d) => setPhone((p) => (p + d).slice(0, 10))}
        onBackspace={() => setPhone((p) => p.slice(0, -1))}
      />
      <TurnstileWidget ref={captchaRef} />
      <Button
        className="mt-3 h-14 w-full gap-2 text-base"
        disabled={busy || phone.replace(/\D/g, "").length < 9}
        onClick={() => void start()}
      >
        {busy ? <Spinner /> : <MessageSquare className="h-5 w-5" />}
        Send code
      </Button>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have access yet?{" "}
        <Link href="/volunteer/join" className="font-medium text-primary hover:underline">
          Request to join
        </Link>
      </p>
    </div>
  );
}
