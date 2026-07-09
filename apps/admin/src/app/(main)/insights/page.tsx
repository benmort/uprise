"use client";

import Link from "next/link";
import { BarChart3, Globe2, MapPin } from "lucide-react";
import { listPolls, provenanceLine, type PollSummary } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionCard } from "@uprise/field";

export default function InsightsPage() {
  const { data, loading, error, noPermission, refetch } = useApi(
    "/insights/polls",
    () => listPolls(),
    { ttlMs: 60_000 },
  );
  const polls: PollSummary[] = data ?? [];

  return (
    <PageShell icon={BarChart3} title="Polling">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        Public-opinion polls attached to Australian electorates — crosstabs, regional choropleths and
        canvassing targets.
      </p>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={polls.length === 0}
        emptyTitle="No polls yet"
        emptyDescription="Ingested polls appear here — run the insights loader to import a dataset."
        skeleton={<Skeleton className="h-40 w-full" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {polls.map((p) => (
            <Link key={p.id} href={`/insights/${p.id}`} className="group block">
              <SectionCard>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold text-foreground group-hover:text-primary">
                    {p.title}
                  </h3>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{provenanceLine(p)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.geoScope ?? "—"}
                  </span>
                  <span>{p.questionCount.toLocaleString()} questions</span>
                  {p.shared ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-2 py-0.5 font-medium">
                      <Globe2 className="h-3 w-3" />
                      Shared
                    </span>
                  ) : null}
                </div>
              </SectionCard>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Polling data is provided under licence by the named source and commissioner. Attribution is
          required wherever figures are shown or exported.
        </p>
      </StateRegion>
    </PageShell>
  );
}
