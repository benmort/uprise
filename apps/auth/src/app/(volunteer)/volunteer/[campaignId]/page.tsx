"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, BrandStyle, Spinner } from "@uprise/ui";
import { auth, getActionAppUrl } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { completeAuth } from "@/lib/session";
import { useQueryParams } from "@/lib/use-query";
import { withReturnTo } from "@/lib/return-to";
import { useWizardStep } from "@/lib/wizard-step";
import { VolunteerOnboardWizard } from "@/components/volunteer-onboard-wizard";
import { VolunteerFlowShell } from "@/components/volunteer-flow-shell";
import { VolunteerJoinHero } from "@/components/volunteer-join-hero";

/**
 * Tokenless open-join entry – a per-campaign public link (`/volunteer/[campaignId]`).
 * Previews the campaign (server-gated by its `openJoinEnabled` flag), shows the join
 * hero + the canvasser principles, then hands off to the SAME onboarding wizard used by
 * the invite flow, campaign-scoped instead of invite-scoped. A closed/inactive campaign
 * renders an error. Unlike the invite flow, a volunteer who finishes here lands on the
 * action app rather than the field app.
 */
export default function OpenJoinPage() {
  const campaignId = String(useParams().campaignId ?? "");
  // `return_to` is set when something bounced the volunteer here (the field app's
  // middleware does). It wins over the action-app landing below.
  const returnTo = useQueryParams().get("return_to");
  const { step, goTo, canGoBack } = useWizardStep();
  const [preview, setPreview] = useState<OpenJoinPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const campaignName = preview?.campaignName ?? null;
  const tenantName = preview?.tenantName ?? null;
  const logoUrl = preview?.logoUrl ?? null;

  useEffect(() => {
    void (async () => {
      const res = await auth.openJoinPreview(campaignId);
      if (!res.ok) {
        setLoading(false);
        setError(res.error);
        return;
      }
      setPreview(res.data);
      // A returning volunteer who's already signed in AND already a member of this campaign's
      // tenant shouldn't be asked to sign up again — send them straight where they were headed.
      const session = await auth.checkSession();
      if (session.ok && session.data.user) {
        const member = session.data.user.memberships.some((m) => m.tenantId === res.data.tenantId);
        if (member) {
          completeAuth(session.data.user.memberships, returnTo);
          return; // keep the spinner up through the redirect
        }
      }
      setLoading(false);
    })();
  }, [campaignId, returnTo]);

  /**
   * Land the new volunteer on the action app, carrying the campaign + tenant they just
   * joined. Routed through `completeAuth` so the open-redirect allowlist still applies
   * and a multi-tenant volunteer still stops at /select-tenant first — which means the
   * action origin must be in NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS or this falls back.
   */
  const onComplete = (memberships: Parameters<typeof completeAuth>[0]) => {
    const joined = memberships?.[0];
    const params = new URLSearchParams({ campaign: campaignId });
    const tenant = joined?.tenantSlug ?? joined?.tenantId;
    if (tenant) params.set("tenant", tenant);
    params.set("joined", "1");
    completeAuth(memberships, `${getActionAppUrl()}/?${params.toString()}`);
  };

  if (loading) {
    // Match the join hero's silhouette (brand-primary left + off-white right) so the page loads
    // AS the hero and fills in — rather than flashing the light two-column VolunteerFlowShell
    // (which reads like the admin app) and then swapping the whole layout when the preview lands.
    return (
      <div className="lg:flex lg:min-h-screen">
        <BrandStyle
          brand={{
            primaryColour: preview?.primaryColour ?? null,
            secondaryColour: preview?.secondaryColour ?? null,
            customCss: preview?.customCss ?? null,
          }}
        />
        <section className="flex min-h-[45vh] items-center justify-center rounded-b-[1.625rem] bg-primary text-white lg:min-h-screen lg:w-1/2 lg:rounded-none">
          <Spinner className="text-white" />
        </section>
        <section aria-hidden className="hidden flex-1 bg-[#faf8f5] lg:block lg:w-1/2" />
      </div>
    );
  }
  if (error && campaignName === null) {
    return (
      <VolunteerFlowShell>
        <div className="px-5 py-8">
          <Alert variant="error" title={error} />
        </div>
      </VolunteerFlowShell>
    );
  }

  // `?step=` is the wizard; without it, the join hero. The wizard owns the param, so the
  // Back gesture leaves the flow and lands here rather than off the site.
  if (step) {
    return (
      <VolunteerFlowShell>
        <div className="px-5 py-6">
          <VolunteerOnboardWizard
            campaignId={campaignId}
            tenantName={tenantName ?? undefined}
            tenantLogoUrl={logoUrl}
            invitedPhone={null}
            returnTo={returnTo}
            step={step}
            goTo={goTo}
            canGoBack={canGoBack}
            // Someone sent here by the field app goes back to the field app; everyone else
            // lands on the action app carrying the campaign they just joined.
            onComplete={returnTo ? undefined : onComplete}
            completeLabel={returnTo ? "Start canvassing" : "Start volunteering"}
          />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have access yet?{" "}
            <Link href={withReturnTo("/volunteer/join", returnTo)} className="font-medium text-primary hover:underline">
              Request to join
            </Link>
          </p>
        </div>
      </VolunteerFlowShell>
    );
  }

  return (
    <VolunteerJoinHero
      campaignName={campaignName}
      tenantName={tenantName}
      logoUrl={logoUrl}
      tenantId={preview?.tenantId}
      primaryColour={preview?.primaryColour}
      secondaryColour={preview?.secondaryColour}
      customCss={preview?.customCss}
      volunteerCount={preview?.volunteerCount ?? 0}
      doorsThisWeek={preview?.doorsThisWeek ?? 0}
      onGetStarted={() => goTo("phone")}
      signInHref={withReturnTo("/volunteer/sign-in", returnTo)}
    />
  );
}
