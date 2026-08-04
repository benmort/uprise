"use client";

import { useState } from "react";
import { autodialer } from "@uprise/api-client";
import type { DialerAttemptRow } from "@uprise/contracts";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, KpiTile } from "@uprise/field";

const PAGE_SIZE = 25;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/** Live view of a campaign's dialling — aggregates + the recent-dials table. */
export function CampaignMonitor({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(0);
  const stats = useApi(
    `/autodialer/campaigns/${campaignId}/stats`,
    () => autodialer.stats(campaignId),
    { refetchInterval: 7_500 },
  );
  const attempts = useApi(
    `/autodialer/campaigns/${campaignId}/attempts|${page}`,
    () => autodialer.attempts(campaignId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    { refetchInterval: 7_500 },
  );

  const s = stats.data;
  const kpi = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
  const rows = attempts.data?.attempts ?? [];
  const total = attempts.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Calls today" value={kpi(s?.callsToday)} />
        <KpiTile
          label="Dialled / pending"
          value={s ? `${(s.attempts.total - s.attempts.pending).toLocaleString()} / ${s.attempts.pending.toLocaleString()}` : "—"}
        />
        <KpiTile label="Connect rate" value={s?.connectRate == null ? "—" : `${s.connectRate}%`} />
        <KpiTile label="Transfers" value={kpi(s?.transfers)} />
      </div>

      {s ? (
        <p className="text-xs text-muted-foreground">
          Outcomes:{" "}
          {Object.entries(s.attempts.byOutcome)
            .map(([outcome, count]) => `${outcome.toLowerCase()} ${count}`)
            .join(" · ") || "none yet"}
          {s.sessions.started > 0
            ? ` · click-to-call sessions ${s.sessions.started} (${s.sessions.bridged} bridged)`
            : ""}
          {s.lastDialedAt ? ` · last dialled ${formatDate(s.lastDialedAt)}` : ""}
        </p>
      ) : null}

      <StateRegion
        loading={attempts.loading}
        error={attempts.error}
        noPermission={attempts.noPermission}
        onRetry={() => void attempts.refetch()}
        empty={!attempts.loading && rows.length === 0}
        emptyTitle="No dials yet"
        emptyDescription="Attempts appear here as the engine works through the audience."
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(a: DialerAttemptRow) => a.id}
          empty="No attempts."
          pageSize={0}
          columns={[
            {
              key: "phone",
              header: "Number",
              cell: (a: DialerAttemptRow) => <span className="font-mono">{a.phoneE164}</span>,
            },
            { key: "attemptNo", header: "Try", numeric: true, cell: (a: DialerAttemptRow) => `#${a.attemptNo}` },
            { key: "outcome", header: "Outcome", cell: (a: DialerAttemptRow) => <StatusBadge status={a.outcome} /> },
            {
              key: "kind",
              header: "Kind",
              cell: (a: DialerAttemptRow) => <span className="text-muted-foreground">{a.kind.toLowerCase()}</span>,
            },
            {
              key: "created",
              header: "Dialled",
              cell: (a: DialerAttemptRow) => <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>,
            },
          ]}
        />
        <div className="mt-3 flex items-center justify-end">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      </StateRegion>
    </div>
  );
}
