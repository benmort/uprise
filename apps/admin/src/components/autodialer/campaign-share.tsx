"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { actionPages, type AuthPrincipal } from "@uprise/api-client";
import type { ActionPageRecord } from "@uprise/contracts";
import { getSession } from "@/lib/session";
import { actionAppOrigin } from "@/lib/action-app-origin";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ShareCard } from "@uprise/ui";

function tenantSlugOf(principal: AuthPrincipal | null): string | null {
  if (!principal) return null;
  if (principal.activeTenant?.slug) return principal.activeTenant.slug;
  const membership = principal.memberships.find((m) => m.tenantId === principal.tenantId);
  return membership?.tenantSlug ?? null;
}

/**
 * Share tab: the campaign's public front end — every action page riding this
 * campaign, each with its link, copy/QR (ShareCard) and a live iframe of the
 * REAL public route, mirroring the action-page builder's preview.
 */
export function CampaignShare({ campaignId }: { campaignId: string }) {
  const pages = useApi("/actions/pages|campaign-share", () => actionPages.list({ limit: 100 }), {
    ttlMs: 15_000,
  });
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  useEffect(() => {
    void getSession().then(setPrincipal);
  }, []);
  const tenantSlug = tenantSlugOf(principal);

  const linked = (pages.data?.pages ?? []).filter((p) => p.campaignId === campaignId);

  const urlFor = (page: ActionPageRecord) =>
    tenantSlug ? `${actionAppOrigin()}/${tenantSlug}/actions/${page.publicSlug}` : null;

  return (
    <StateRegion
      loading={pages.loading || !principal}
      error={pages.error}
      noPermission={pages.noPermission}
      onRetry={() => void pages.refetch()}
      empty={!pages.loading && linked.length === 0}
      emptyTitle="No action page yet"
      emptyDescription="Create a click-to-call page in Actions → Pages and pick this campaign — its public link and QR land here."
      skeleton={<Skeleton className="h-64 w-full" />}
    >
      <div className="space-y-4">
        {linked.map((page) => {
          const url = urlFor(page);
          return (
            <div key={page.id} className="grid gap-4 xl:grid-cols-[1fr,420px]">
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{page.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {page.status === "PUBLISHED"
                        ? "Live — anyone with the link (or QR) can call."
                        : "Not published yet — the public link 404s until you publish it."}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={page.status} />
                    <Button asChild size="sm" variant="outline">
                      <a href={`/actions/pages/${encodeURIComponent(page.id)}`}>Open builder</a>
                    </Button>
                  </span>
                </div>
                {url ? (
                  <ShareCard url={url} title={page.headline ?? page.title} qr />
                ) : (
                  <p className="text-xs text-muted-foreground">Link appears once the workspace slug resolves.</p>
                )}
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                  >
                    Open the public page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : null}
              </Card>
              {url ? (
                <iframe
                  src={url}
                  title={`${page.title} preview`}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  className="h-[520px] w-full rounded-xl border border-border bg-surface"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </StateRegion>
  );
}
