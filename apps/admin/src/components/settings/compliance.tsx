"use client";

// Opt-out ledger. Extracted from the standalone /compliance page so it renders both
// there and as a tab on the General settings page.
import { useState } from "react";
import { ShieldOff } from "lucide-react";
import { getOptOuts, type OptOutLedger } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { KpiTile, SectionCard, DataTable } from "@uprise/field";

const PAGE_SIZE = 10;

export function ComplianceSettings() {
  const [page, setPage] = useState(0);
  const { data, loading, error, noPermission, refetch } = useApi<OptOutLedger>(
    `/compliance/opt-outs?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
    () => getOptOuts({ take: PAGE_SIZE, skip: page * PAGE_SIZE }),
    { ttlMs: 60_000 },
  );

  const sms = data?.byChannel.find((c) => c.channel === "SMS")?.count ?? 0;
  const wa = data?.byChannel.find((c) => c.channel === "WHATSAPP")?.count ?? 0;

  return (
    <StateRegion
      loading={loading}
      error={error}
      noPermission={noPermission}
      onRetry={() => void refetch()}
      errorTitle="Can't load compliance"
      skeleton={<Skeleton className="h-48 w-full" />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Total opt-outs" value={data?.total ?? 0} icon={<ShieldOff className="h-4 w-4" />} />
        <KpiTile label="SMS" value={sms} />
        <KpiTile label="WhatsApp" value={wa} />
      </div>

      <SectionCard title="Opt-out ledger" description="STOP keywords and manual suppressions, most recent first.">
        {(data?.entries.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No opt-outs recorded.</p>
        ) : (
          <>
            <DataTable
              rows={data?.entries ?? []}
              rowKey={(e) => e.id}
              pageSize={0} /* server-paginated below via <PaginationControls> — no client pager */
              columns={[
                { key: "phone", header: "Phone", cell: (e) => <span className="tabular-nums">{e.phoneE164}</span> },
                {
                  key: "channel",
                  header: "Channel",
                  cell: (e) => <StatusBadge status={e.channel === "WHATSAPP" ? "READ" : "DELIVERED"} />,
                },
                { key: "source", header: "Source", cell: (e) => e.source ?? "–" },
                { key: "at", header: "When", cell: (e) => new Date(e.updatedAt).toLocaleString() },
              ]}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {data?.entries.length ?? 0} of {(data?.total ?? 0).toLocaleString()} opt-outs
              </p>
              <PaginationControls
                page={page}
                pageSize={PAGE_SIZE}
                total={data?.total ?? 0}
                onPrev={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>
          </>
        )}
      </SectionCard>
    </StateRegion>
  );
}
