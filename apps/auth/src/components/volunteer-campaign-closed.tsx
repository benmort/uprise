"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "@uprise/api-client";
import type { OpenJoinPreview } from "@uprise/contracts";
import { VolunteerJoinHero } from "./volunteer-join-hero";
import { VolunteerOpportunityList } from "./volunteer-opportunity-list";

/**
 * The "sign-ups closed" landing for `/volunteer/[campaignId]` – a campaign link that has been
 * switched off, completed, or (in the `preview === null` case) couldn't be loaded at all.
 *
 * It is the SAME two-column join hero as the working path, wearing the org's brand, because the
 * person reading it is a would-be volunteer who followed a real link: the goal is to keep them,
 * not to report an error. The right column carries the recovery – that org's other open campaigns
 * first, then a request-to-join, then sign-in for someone who's already a volunteer.
 *
 * `brand` is null only when the campaign itself couldn't be resolved; the hero then falls back to
 * Uprise's own colours and generic copy rather than rendering half a page.
 */
export function VolunteerCampaignClosed({
  brand,
  reason,
  requestJoinHref,
  signInHref,
  browseHref,
  hrefFor,
}: {
  /** The closed campaign's preview (`open: false`), or null when it couldn't be loaded. */
  brand: OpenJoinPreview | null;
  /** The API's own words, shown as a quiet footnote when there's no branded context to explain. */
  reason: string | null;
  requestJoinHref: string;
  signInHref: string;
  /** The generic board – the fallback when this org has nothing else running. */
  browseHref: string;
  hrefFor: (o: OpenJoinPreview) => string;
}) {
  const [others, setOthers] = useState<OpenJoinPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Scoped to the org that ran the closed campaign – someone who followed their link wants
  // THEIR work, not a national list. No slug (unslugged org, or no campaign at all) → every
  // open campaign, which is still a way forward.
  const tenantSlug = brand?.tenantSlug ?? null;
  useEffect(() => {
    void (async () => {
      const list = await auth.openJoinList(tenantSlug ?? undefined);
      setLoading(false);
      if (!list.ok) {
        setError(list.error);
        return;
      }
      setOthers(list.data);
    })();
  }, [tenantSlug]);

  const orgName = brand?.tenantName || null;
  const campaignName = brand?.campaignName || null;
  const scoped = Boolean(tenantSlug);

  // Written once, shown twice: the hero carries it on desktop, the panel restates it on mobile.
  const eyebrow = brand ? "Sign-ups closed" : "This link has expired";
  const headline = campaignName ? `${campaignName} isn't taking sign-ups` : "This campaign isn't taking sign-ups";
  const intro = orgName
    ? `${orgName} has closed this one for now – but the work hasn't stopped. Here's what's open today.`
    : "That link is no longer live. There's still plenty to get stuck into – here's what's open today.";

  const panel = (
    <div className="w-full lg:max-w-xl">
      {/* `rightOverride` hides the brand hero below lg, so on a phone this panel IS the page –
          it has to say what happened before it offers the alternatives. Exactly one of the two
          headings is ever visible (the other is display:none, so screen readers skip it). */}
      <div className="lg:hidden">
        <p className="text-sm font-bold uppercase tracking-[0.1em] text-ink/50">{eyebrow}</p>
        <h1 className="mt-2 text-[1.7rem] font-extrabold leading-tight text-ink">{headline}</h1>
        <p className="mt-2.5 text-base leading-relaxed text-ink/60">{intro}</p>
        <hr className="mt-6 border-ink/10" />
      </div>

      <h2 className="mt-6 text-[1.6rem] font-extrabold leading-tight text-ink lg:mt-0 lg:text-4xl">
        {scoped && orgName ? `Other ways to help ${orgName}` : "Campaigns you can join today"}
      </h2>
      <p className="mt-3 text-base leading-relaxed text-ink/60">
        {scoped
          ? "These are open right now and take about two minutes to join."
          : "Pick a campaign near you – each one takes about two minutes to join."}
      </p>

      <div className="mt-6">
        <VolunteerOpportunityList
          opportunities={others}
          loading={loading}
          error={error}
          hrefFor={hrefFor}
          emptyBody={
            scoped && orgName
              ? `${orgName} has nothing else open at the moment. Ask them to add you and they'll be in touch when the next campaign starts.`
              : "There are no open campaigns right now. Ask to join and you'll hear from an organiser when the next one starts."
          }
          emptyAction={
            scoped ? (
              <Link href={browseHref} className="font-bold text-primary hover:underline">
                Browse every open campaign
              </Link>
            ) : null
          }
        />
      </div>

      <hr className="mt-8 border-ink/10" />

      <div className="mt-6 space-y-2 text-base text-ink/60">
        <p>
          {orgName ? `Set on helping ${orgName}? ` : "Set on a particular organisation? "}
          <Link href={requestJoinHref} className="font-bold text-primary hover:underline">
            Request to join
          </Link>
        </p>
        <p>
          Already a volunteer?{" "}
          <Link href={signInHref} className="font-bold text-primary hover:underline">
            Sign in
          </Link>
        </p>
        {/* Only when there's no branded context to explain the closure – otherwise the hero says it. */}
        {!brand && reason ? <p className="pt-2 text-sm text-ink/45">{reason}</p> : null}
      </div>
    </div>
  );

  return (
    <VolunteerJoinHero
      campaignName={campaignName}
      tenantName={orgName}
      logoUrl={brand?.logoUrl ?? null}
      tenantId={brand?.tenantId ?? null}
      primaryColour={brand?.primaryColour ?? null}
      secondaryColour={brand?.secondaryColour ?? null}
      customCss={brand?.customCss ?? null}
      volunteerCount={brand?.volunteerCount ?? 0}
      doorsThisWeek={brand?.doorsThisWeek ?? 0}
      eyebrow={eyebrow}
      headline={headline}
      intro={intro}
      // The hero's own CTA is redundant here: the right column IS the call to action.
      onGetStarted={() => {}}
      signInHref={signInHref}
      rightOverride={panel}
    />
  );
}
