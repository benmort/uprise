"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Phone, Plus } from "lucide-react";
import {
  transactionalCalls,
  type ListTransactionalCallsParams,
  type TransactionalCall,
  type TransactionalCallStatus,
} from "@uprise/api-client";
import { useApi } from "@/lib/use-api";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, KpiTile } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { TelephonyStatusCard } from "@/components/telephony/telephony-status-card";
import { CallRecordingPlayer } from "@/components/channels/call-recording-player";
import { NewCallDialog } from "@/components/softphone/new-call-dialog";

const CALL_STATUSES: TransactionalCallStatus[] = [
  "INITIATED",
  "RINGING",
  "IN_PROGRESS",
  "COMPLETED",
  "BUSY",
  "NO_ANSWER",
  "FAILED",
];

/** Talk-time on a single row: m:ss (or h m for long calls); "—" for none. */
function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s === 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Aggregate talk-time for the KPI tile: h m (or m). */
function formatTalkTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Transactional calls (meld doc 09): one-to-one outbound voice, server-side
 * filtered + paginated. Distinct from a future predictive-dialling channel.
 */
export default function CallsPage() {
  const pagination = usePaginationParams();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [newCallOpen, setNewCallOpen] = useState(false);
  // Deep-link: /channels/calls?new=1 (the "New call" picker option) opens the
  // dialler on load, then strips the param so refresh/back don't reopen it.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setNewCallOpen(true);
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounce search so each keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // A filter change returns to the first page (skip the initial render).
  const filterSig = `${statuses.slice().sort().join(",")}|${qDebounced}`;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    pagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSig]);

  const filter: ListTransactionalCallsParams = useMemo(
    () => ({
      status: statuses.length ? (statuses as TransactionalCallStatus[]) : undefined,
      search: qDebounced || undefined,
    }),
    [statuses, qDebounced],
  );

  const list = useApi(
    `/calls|${filterSig}|${pagination.page}|${pagination.pageSize}`,
    () => transactionalCalls.list({ ...filter, limit: pagination.pageSize, offset: pagination.page * pagination.pageSize }),
    { refetchInterval: 10_000 },
  );
  const stats = useApi(`/calls/stats|${filterSig}`, () => transactionalCalls.stats(filter), { ttlMs: 5_000 });

  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const s = stats.data;
  const kpi = (n: number | undefined) => (n == null ? "—" : n.toLocaleString());
  const byStatus = (key: TransactionalCallStatus) => (s ? s.byStatus[key] ?? 0 : undefined);
  const unsuccessful = s ? (s.byStatus.BUSY ?? 0) + (s.byStatus.NO_ANSWER ?? 0) + (s.byStatus.FAILED ?? 0) : undefined;

  return (
    <PageShell
      icon={Phone}
      title="Transactional calls"
      actions={
        <Button size="sm" onClick={() => setNewCallOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New call
        </Button>
      }
    >
      <NewCallDialog open={newCallOpen} onClose={() => setNewCallOpen(false)} />
      <p className="text-sm text-muted-foreground">
        One-to-one outbound voice — verification, callbacks and direct outreach. Bulk phone-banking
        (predictive dialling) is a separate channel.
      </p>

      <TelephonyStatusCard />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Total calls" value={kpi(s?.total)} />
        <KpiTile label="Completed" value={kpi(byStatus("COMPLETED"))} />
        <KpiTile label="Unsuccessful" value={kpi(unsuccessful)} />
        <KpiTile label="Talk time" value={s ? formatTalkTime(s.totalDurationSeconds) : "—"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter label="Status" options={CALL_STATUSES} selected={statuses} onChange={setStatuses} />
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search by number…"
          aria-label="Search calls"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {total} {total === 1 ? "call" : "calls"}
        </span>
      </div>

      <StateRegion
        loading={list.loading}
        error={list.error}
        noPermission={list.noPermission}
        onRetry={() => void list.refetch()}
        empty={!list.loading && rows.length === 0}
        emptyTitle="No calls"
        emptyDescription="Outbound calls placed from this workspace will appear here."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(c: TransactionalCall) => c.id}
          empty="No matches."
          pageSize={0}
          columns={[
            { key: "toNumber", header: "To", cell: (c: TransactionalCall) => <span className="font-mono">{c.toNumber}</span> },
            {
              key: "fromNumber",
              header: "From",
              cell: (c: TransactionalCall) => <span className="font-mono text-muted-foreground">{c.fromNumber || "—"}</span>,
            },
            { key: "status", header: "Status", cell: (c: TransactionalCall) => <StatusBadge status={c.status} /> },
            {
              key: "duration",
              header: "Duration",
              numeric: true,
              cell: (c: TransactionalCall) => formatDuration(c.durationSeconds),
            },
            {
              key: "started",
              header: "Started",
              cell: (c: TransactionalCall) => (
                <span className="text-muted-foreground">{formatDate(c.startedAt ?? c.createdAt)}</span>
              ),
            },
            {
              key: "recording",
              header: "Recording",
              cell: (c: TransactionalCall) =>
                c.recordingUrl ? <CallRecordingPlayer callId={c.id} /> : <span className="text-muted-foreground">—</span>,
            },
          ]}
        />
        <div className="mt-3 flex items-center justify-end">
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={total}
            onPrev={() => pagination.setPage(Math.max(0, pagination.page - 1))}
            onNext={() => pagination.setPage(pagination.page + 1)}
            onPageSizeChange={pagination.setPageSize}
          />
        </div>
      </StateRegion>
    </PageShell>
  );
}
