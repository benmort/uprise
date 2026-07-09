"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, PrinciplesList, Spinner } from "@uprise/ui";
import { auth, getActionAppUrl } from "@uprise/api-client";
import { completeAuth } from "@/lib/session";
import { VolunteerOnboardWizard } from "@/components/volunteer-onboard-wizard";

/** The tenant selector's deterministic fallback: a colourful gradient disc keyed on the
 *  tenant id (mirrors admin's TenantAvatar) when the org hasn't uploaded a logo. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function tenantGradient(id: string): string {
  const h1 = hashHue(id);
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${h2} 76% 46%))`;
}

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
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await auth.openJoinPreview(campaignId);
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCampaignName(res.data.campaignName);
      setTenantName(res.data.tenantName);
      setLogoUrl(res.data.logoUrl);
      setTenantId(res.data.tenantId);
    })();
  }, [campaignId]);

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
    return (
      <div className="flex flex-1 items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (error && campaignName === null) {
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
          campaignId={campaignId}
          tenantName={tenantName ?? undefined}
          invitedPhone={null}
          returnTo={null}
          onExit={() => setStarted(false)}
          onComplete={onComplete}
          completeLabel="Start volunteering"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="rounded-b-[1.625rem] bg-primary px-[1.625rem] pb-7 pt-8 text-white">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // The tenant's own logo — the same one the tenant selector renders.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={tenantName ? `${tenantName} logo` : "Organisation logo"}
              className="h-14 w-14 shrink-0 rounded-2xl bg-white/15 object-cover"
            />
          ) : (
            // No logo → the tenant selector's coloured disc, keyed on the tenant id.
            <span
              aria-hidden
              className="h-14 w-14 shrink-0 rounded-full"
              style={{ backgroundImage: tenantGradient(tenantId) }}
            />
          )}
          {tenantName ? (
            <span
              className="flex-1 text-justify text-lg font-extrabold leading-tight text-white"
              style={{ textAlignLast: "justify" }}
            >
              {tenantName}
            </span>
          ) : null}
        </div>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.08em] text-white/80">Join the team</p>
        <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.1]">
          Become a volunteer{campaignName ? ` for ${campaignName}` : ""}
        </h1>
        <p className="mt-3 text-base leading-snug text-white/85">
          Join your neighbours knocking on doors and talking to voters. Takes two minutes to set up
          – no app store needed.
        </p>
      </section>

      {/* Principles */}
      <div className="px-[1.625rem] pt-5">
        <PrinciplesList className="space-y-2" />
      </div>

      {/* Actions */}
      <div className="mt-auto space-y-3 px-[1.625rem] pb-5 pt-5">
        <Button className="h-14 w-full rounded-[0.75rem] text-base" onClick={() => setStarted(true)}>
          Get started
        </Button>
        <p className="text-center text-base">
          <Link href="/v" className="font-bold text-primary hover:underline">
            Already a volunteer? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
