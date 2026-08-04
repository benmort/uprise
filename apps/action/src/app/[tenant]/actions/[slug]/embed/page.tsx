import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandStyle } from "@uprise/ui";
import { getPublicActionPage } from "@/lib/actions";
import { ClickToCallWidget } from "@/components/click-to-call/click-to-call-widget";
import { EmbedFrameBridge } from "@/components/click-to-call/embed-frame-bridge";

type Params = { tenant: string; slug: string };

export const metadata: Metadata = {
  // The middleware sets X-Robots-Tag too; the meta tag covers saved copies.
  robots: { index: false, follow: false },
};

/**
 * The embeddable widget frame — chrome-less: no tenant header, no page
 * padding beyond a hairline gutter, because the host page owns the layout.
 * Framing policy (per-page embedDomains allowlist) is enforced by the action
 * middleware's CSP; the bridge reports height + PII-free events to the host.
 */
export default async function ActionEmbedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: { previewToken?: string };
}) {
  const payload = await getPublicActionPage(params.slug, searchParams.previewToken);
  if (!payload || !payload.tenant || payload.tenant.slug !== params.tenant) notFound();

  return (
    <main className="p-2">
      <BrandStyle brand={payload.tenant} />
      <EmbedFrameBridge />
      <ClickToCallWidget slug={params.slug} page={payload} embedded />
    </main>
  );
}
