"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryParams } from "@/lib/use-query";
import { useWizardStep } from "@/lib/wizard-step";
import { Alert, Spinner } from "@uprise/ui";
import { auth } from "@uprise/api-client";
import { VolunteerOnboardWizard } from "@/components/volunteer-onboard-wizard";
import { VolunteerFlowShell } from "@/components/volunteer-flow-shell";
import { VolunteerJoinHero } from "@/components/volunteer-join-hero";

/**
 * Volunteer onboarding entry (the invite link). Previews the invite, shows the
 * "you're invited" hero + canvasser principles, then hands off to the 5-step
 * wizard (phone → OTP → name → role/days → conduct → on the team).
 */
export default function VolunteerInvitePage() {
  const token = String(useParams().token ?? "");
  const returnTo = useQueryParams().get("return_to");
  const { step, goTo, canGoBack } = useWizardStep();
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [invitedPhone, setInvitedPhone] = useState<string | null>(null);
  const [invitedChannel, setInvitedChannel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await auth.previewInvite(token);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTenantName(res.data.tenantName);
      setLogoUrl(res.data.logoUrl);
      setInvitedPhone(res.data.phone ?? null);
      setInvitedChannel(res.data.invitedChannel ?? null);
    })();
  }, [token]);

  if (loading) {
    return (
      <VolunteerFlowShell>
        <div className="flex flex-1 items-center justify-center py-10">
          <Spinner />
        </div>
      </VolunteerFlowShell>
    );
  }
  if (error && tenantName === null) {
    return (
      <VolunteerFlowShell>
        <div className="px-5 py-8">
          <Alert variant="error" title={error} />
        </div>
      </VolunteerFlowShell>
    );
  }

  // `?step=` is the wizard; without it, the invite hero.
  if (step) {
    return (
      <VolunteerFlowShell>
        <div className="px-5 py-6">
          <VolunteerOnboardWizard
            token={token}
            tenantName={tenantName ?? ""}
            tenantLogoUrl={logoUrl}
            invitedPhone={invitedPhone}
            invitedChannel={invitedChannel}
            returnTo={returnTo}
            step={step}
            goTo={goTo}
            canGoBack={canGoBack}
          />
        </div>
      </VolunteerFlowShell>
    );
  }

  // The invite preview carries no brand colours (InvitePreview is identity-only), so the hero keeps
  // Uprise's default colours + shows the inviting org's logo/name.
  return (
    <VolunteerJoinHero
      tenantName={tenantName}
      logoUrl={logoUrl}
      onGetStarted={() => goTo("phone")}
      signInHref="/volunteer/sign-in"
    />
  );
}
