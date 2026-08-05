import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandStyle } from "@uprise/ui";
import { tenantLogoUrl } from "@uprise/api-client";
import { getPublicActionPage } from "@/lib/actions";
import { ClickToCallWidget } from "@/components/click-to-call/click-to-call-widget";
import { EventRsvpWidget } from "@/components/event-rsvp/event-rsvp-widget";

type Params = { tenant: string; slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const payload = await getPublicActionPage(params.slug);
  return {
    title: payload?.page.headline ?? "Take action",
    description: payload?.page.body?.slice(0, 160) ?? undefined,
    icons: payload?.tenant?.logoBlockUrl ? { icon: payload.tenant.logoBlockUrl } : undefined,
  };
}

/** First letters of the first two words — "Common Threads" → "CT". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * The public action page — click-to-call or event RSVP, picked by the page's type: tenant identity on top (insights
 * precedent), the widget centred beneath. The tenant in the PATH must own the
 * page — a mismatched slug 404s rather than serving one tenant's action under
 * another's URL. Draft pages render only with a preview token (admin preview).
 */
export default async function PublicActionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: { previewToken?: string };
}) {
  const payload = await getPublicActionPage(params.slug, searchParams.previewToken);
  if (!payload || !payload.tenant || payload.tenant.slug !== params.tenant) notFound();

  const name = payload.tenant.name;
  const logoUrl = tenantLogoUrl(payload.tenant);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <BrandStyle brand={payload.tenant} />
      <header className="mb-6 flex items-center gap-3">
        {logoUrl ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">
            {initials(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-extrabold tracking-tight text-foreground">{name}</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {payload.page.preview ? "Preview" : "Take action"}
          </p>
        </div>
      </header>
      {payload.page.type === "EVENT_RSVP" ? (
        <EventRsvpWidget slug={params.slug} page={payload} />
      ) : (
        <ClickToCallWidget slug={params.slug} page={payload} />
      )}
    </main>
  );
}
