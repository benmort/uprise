"use client";

import Link from "next/link";
import { MapPin, MessageSquare, WifiOff, type LucideIcon } from "lucide-react";
import { BrandStyle, Button, LogoMark } from "@uprise/ui";

/** What the field genuinely gives a canvasser — the right column's feature rows (desktop mockup). */
const CAPABILITIES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: MapPin,
    title: "Turf that's ready when you are",
    body: "A route-optimised walk list of nearby doors, sorted for the shortest path.",
  },
  {
    icon: MessageSquare,
    title: "Say the right thing at the door",
    body: "Talking points and past notes for each household appear as you knock.",
  },
  {
    icon: WifiOff,
    title: "Works with no signal",
    body: "Log every outcome offline – it syncs the moment you're back on Wi-Fi.",
  },
];

export type VolunteerJoinHeroProps = {
  /** The campaign being joined — drives the "Become a canvasser for <name>" headline. */
  campaignName?: string | null;
  /** The inviting/hosting org — the brand mark's label + logo. */
  tenantName?: string | null;
  logoUrl?: string | null;
  /** Tenant id, for the deterministic gradient fallback when there's no logo. */
  tenantId?: string | null;
  /** Tenant brand colours — mapped onto `--primary` etc. so the hero wears the org's brand.
   *  All null → the Uprise default brand (routes with no tenant context keep Uprise's colours). */
  primaryColour?: string | null;
  secondaryColour?: string | null;
  customCss?: string | null;
  /** Recruitment social-proof (real; each hidden when 0). */
  volunteerCount?: number;
  doorsThisWeek?: number;
  onGetStarted: () => void;
  signInHref: string;
};

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function tenantGradient(id: string): string {
  const h1 = hashHue(id);
  return `linear-gradient(135deg, hsl(${h1} 72% 56%), hsl(${(h1 + 48) % 360} 76% 46%))`;
}

/** Legible text (dark ink / white) for a hex background, by WCAG relative luminance. */
function readableOn(hex?: string | null): string | undefined {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const chan = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
  return luminance > 0.5 ? "#111827" : "#ffffff";
}

/** A stat block in the brand hero — big number + muted label. Renders nothing when the value is 0. */
function Stat({ value, label }: { value: number; label: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-3xl font-extrabold leading-none tabular-nums text-white sm:text-4xl">
        {value.toLocaleString()}
      </div>
      <div className="mt-1.5 text-sm text-white/70">{label}</div>
    </div>
  );
}

/**
 * The volunteer join/invite hero — a two-column desktop invite (brand-coloured hero left; white
 * feature column right) that collapses to a single column on mobile (rounded brand hero on top,
 * white features + actions below). Wears the tenant's brand via `<BrandStyle>` (so the brown/blue
 * accents come from the org's `settings/branding` primaryColour); with no brand set it keeps
 * Uprise's default colours + mark. Self-contained chrome — used by the campaign + invite hero
 * screens, NOT the onboarding wizard (that keeps `VolunteerFlowShell`).
 */
export function VolunteerJoinHero({
  campaignName,
  tenantName,
  logoUrl,
  tenantId,
  primaryColour,
  secondaryColour,
  customCss,
  volunteerCount = 0,
  doorsThisWeek = 0,
  onGetStarted,
  signInHref,
}: VolunteerJoinHeroProps) {
  const forName = campaignName || tenantName;
  const brandLabel = tenantName || "uprise";
  const hasStats = volunteerCount > 0 || doorsThisWeek > 0;

  // Brand split: the LEFT hero wears the tenant PRIMARY (bg-primary); the RIGHT feature column is
  // always OFF-WHITE with dark ink + brand-tinted accents (the "Change happens…" section reads as a
  // clean light panel, not another primary block). The CTA wears the tenant SECONDARY colour.
  const branded = Boolean(campaignName || tenantName || tenantId);
  const iconTile = "bg-primary/10 text-primary";
  // The CTA wears the tenant's SECONDARY colour (inline, so it beats the DS `bg-secondary`
  // neutral without remapping that token globally). No brand secondary → the DS secondary.
  const ctaStyle =
    branded && secondaryColour
      ? { backgroundColor: secondaryColour, color: readableOn(secondaryColour) }
      : undefined;

  return (
    <div className="lg:flex lg:min-h-screen">
      {/* Brand colours apply to the whole hero (both viewports). All-null brand → no override,
          so Uprise's default `--primary` stands (non-tenant routes keep Uprise's colours). */}
      <BrandStyle brand={{ primaryColour, secondaryColour, customCss }} />

      {/* Brand hero — left on desktop, top on mobile */}
      <section className="relative overflow-hidden rounded-b-[1.625rem] bg-primary px-7 pb-9 pt-9 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:rounded-none lg:px-14 lg:py-16">
        {/* Decorative brand glows — soft, diffuse radial blooms (a blurred radial gradient
            rather than a hard disc), matching the upriselabs.org background treatment. Tinted
            with the tenant's SECONDARY colour (`--brand-secondary`, set by <BrandStyle>) over the
            PRIMARY hero fill, so the hero wears both brand colours. Falls back to a white
            highlight when the org has set no brand. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full opacity-40"
          style={{
            background: "radial-gradient(circle at 30% 30%, var(--brand-secondary, #ffffff), transparent 70%)",
            filter: "blur(32px)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-10 h-80 w-80 rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle at 30% 30%, var(--brand-secondary, #ffffff), transparent 70%)",
            filter: "blur(38px)",
          }}
        />

        <div className="relative z-10 lg:max-w-xl">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={tenantName ? `${tenantName} logo` : "Organisation logo"} className="h-full w-full object-cover" />
              ) : tenantId ? (
                <span aria-hidden className="h-full w-full" style={{ backgroundImage: tenantGradient(tenantId) }} />
              ) : (
                <LogoMark className="h-6 w-6 text-white" />
              )}
            </span>
            <span className="truncate text-lg font-extrabold text-white">{brandLabel}</span>
          </div>

          <p className="mt-8 text-sm font-bold uppercase tracking-[0.1em] text-white/75 lg:mt-12">You&apos;re invited</p>
          <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.05] lg:text-[3.25rem]">
            Become a canvasser{forName ? ` for ${forName}` : ""}
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/85 lg:mt-5 lg:text-lg">
            Join your neighbours knocking on doors and talking to voters. Takes two minutes to set up –
            no app store needed.
          </p>

          {hasStats ? (
            <div className="mt-8 flex items-stretch gap-6 lg:mt-14">
              <Stat value={doorsThisWeek} label="doors knocked this week" />
              {doorsThisWeek > 0 && volunteerCount > 0 ? <div aria-hidden className="w-px self-stretch bg-white/20" /> : null}
              <Stat value={volunteerCount} label="volunteers signed up" />
            </div>
          ) : null}
        </div>
      </section>

      {/* Feature column — right on desktop, below on mobile. Always off-white with dark ink so the
          "Change happens…" section reads as a clean light panel; brand-tinted icon tiles + a
          secondary-coloured CTA carry the brand. */}
      <section className="flex flex-1 flex-col bg-[#faf8f5] px-7 pb-8 pt-8 lg:w-1/2 lg:justify-center lg:px-14 lg:py-16">
        <div className="lg:max-w-xl">
          <h2 className="text-[1.6rem] font-extrabold leading-tight text-ink lg:text-4xl">
            Change happens one conversation at a time
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink/60 lg:mt-4 lg:text-lg">
            You don&apos;t need experience or a script. uprise walks you through every door and does the
            admin for you.
          </p>

          <ul className="mt-7 space-y-5 lg:mt-9">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconTile}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-ink">{title}</p>
                  <p className="mt-0.5 text-sm leading-snug text-ink/60">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <hr className="mt-8 border-ink/10 lg:mt-10" />

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              variant={branded ? "secondary" : "default"}
              style={ctaStyle}
              className="h-14 rounded-[0.9rem] px-8 text-base"
              onClick={onGetStarted}
            >
              Get started
            </Button>
            <p className="text-center text-base text-ink/60 sm:text-left">
              Already a canvasser?{" "}
              <Link href={signInHref} className="font-bold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
