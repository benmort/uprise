"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryParams } from "@/lib/use-query";
import { Alert, Button, LogoMark, PrinciplesList, Spinner } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { VolunteerOnboardWizard } from "@/components/volunteer-onboard-wizard";

/**
 * Volunteer onboarding entry (the invite link). Previews the invite, shows the
 * "you're invited" hero + canvasser principles, then hands off to the 5-step
 * wizard (phone → OTP → name → role/days → conduct → on the team).
 */
export default function VolunteerInvitePage() {
  const token = String(useParams().token ?? "");
  const returnTo = useQueryParams().get("return_to");
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [invitedPhone, setInvitedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await auth.previewInvite(token);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTenantName(res.data.tenantName);
      setInvitedPhone(res.data.phone ?? null);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (error && tenantName === null) {
    return (
      <div className="px-5 py-8">
        <Alert variant="error" title={error} />
      </div>
    );
  }

  if (started) {
    return (
      <div className="px-5 py-6">
        <VolunteerOnboardWizard
          token={token}
          tenantName={tenantName ?? ""}
          invitedPhone={invitedPhone}
          returnTo={returnTo}
          onExit={() => setStarted(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="rounded-b-[2.25rem] bg-primary px-6 pb-10 pt-14 text-white">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
          <LogoMark className="h-8 w-8 text-white" />
        </span>
        <p className="mt-7 text-sm font-bold uppercase tracking-[0.08em] text-white/80">
          You&apos;re invited
        </p>
        <h1 className="mt-2 text-[2.5rem] font-extrabold leading-[1.1]">
          Become a canvasser{tenantName ? ` for ${tenantName}` : ""}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-white/85">
          Join your neighbours knocking on doors and talking to voters. Takes two minutes to set up
          — no app store needed.
        </p>
      </section>

      {/* Principles */}
      <div className="px-6 pt-8">
        <PrinciplesList />
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-4 px-6 pb-8 pt-8">
        <Button className="h-14 w-full text-base" onClick={() => setStarted(true)}>
          Get started
        </Button>
        <p className="text-center text-base">
          <Link href="/v" className="font-bold text-primary hover:underline">
            Already a canvasser? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
