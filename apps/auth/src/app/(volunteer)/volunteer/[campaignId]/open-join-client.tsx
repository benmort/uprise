"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, BrandStyle, Spinner, brandVarsCss, writeBrandCookie } from "@uprise/ui";
import { auth, getActionAppUrl } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { completeAuth } from "@/lib/session";
import { withReturnTo } from "@/lib/return-to";
import { useWizardStep } from "@/lib/wizard-step";
import { VolunteerOnboardWizard } from "@/components/volunteer-onboard-wizard";
import { VolunteerFlowShell } from "@/components/volunteer-flow-shell";
import { VolunteerJoinHero } from "@/components/volunteer-join-hero";

/**
 * Client half of the tokenless open-join entry. The campaign preview (incl. brand colours) is
 * resolved on the SERVER (see page.tsx) and handed in as `initialPreview`, so the very first
 * paint — the branded loading panel — is already in the tenant's colours, with no flash of
 * Uprise's default blue snapping to the org's on load. Only the session/membership check runs
 * on the client (it needs the session cookie): a returning member is sent straight on; everyone
 * else gets the join hero + wizard.
 */
export function OpenJoinClient({
  campaignId,
  initialPreview,
  initialError,
  returnTo,
}: {
  campaignId: string;
  initialPreview: OpenJoinPreview | null;
  initialError: string | null;
  returnTo: string | null;
}) {
  const { step, goTo, canGoBack } = useWizardStep();
  // SSR-provided — used as the initial (and only) preview so the brand is present on first paint.
  const [preview] = useState<OpenJoinPreview | null>(initialPreview);
  // Seed the parent-domain brand cookie: the field app reads it pre-hydration, so a brand-new
  // volunteer's very first field paint (right after this sign-up) is already in org colours.
  useEffect(() => {
    if (!preview) return;
    writeBrandCookie({
      name: preview.tenantName,
      logoUrl: preview.logoUrl,
      logoBlockUrl: preview.logoUrl,
      css: brandVarsCss(preview) || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [error] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(true);
  const campaignName = preview?.campaignName ?? null;
  const tenantName = preview?.tenantName ?? null;
  const logoUrl = preview?.logoUrl ?? null;

  useEffect(() => {
    void (async () => {
      if (!preview) {
        setLoading(false);
        return;
      }
      // A returning volunteer who's already signed in AND already a member of this campaign's
      // tenant shouldn't be asked to sign up again — send them straight where they were headed.
      const session = await auth.checkSession();
      if (session.ok && session.data.user) {
        const member = session.data.user.memberships.some((m) => m.tenantId === preview.tenantId);
        if (member) {
          completeAuth(session.data.user.memberships, returnTo);
          return; // keep the spinner up through the redirect
        }
      }
      setLoading(false);
    })();
  }, [preview, returnTo]);

  /**
   * Land the new volunteer on the action app, carrying the campaign + tenant they just
   * joined. Routed through `completeAuth` so the open-redirect allowlist still applies
   * and a multi-tenant volunteer still stops at /select-tenant first.
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
    // The branded silhouette (tenant-primary left + off-white right). `preview` is already here
    // (server-resolved), so BrandStyle sets the tenant's --primary before first paint — no flash.
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
        <section aria-hidden className="hidden flex-1 bg-[#faf8f5] dark:bg-[#111318] lg:block lg:w-1/2" />
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
            invitedChannel={preview?.channel ?? null}
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
