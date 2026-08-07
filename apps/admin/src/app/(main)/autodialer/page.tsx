"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Megaphone, PhoneForwarded, PhoneOutgoing, Plus, Vote, Waypoints } from "lucide-react";
import {
  autodialer,
  type ListDialerCampaignsParams,
} from "@uprise/api-client";
import type { DialerCampaignRecord } from "@uprise/contracts";
import { useApi } from "@/lib/use-api";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import { createDialerCampaignAndOpen, DIALER_BEHAVIOUR_OPTIONS, type DialerBehaviourKey } from "@/lib/autodialer";
import { behaviourOf } from "@/components/autodialer/behaviour";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, KpiTile } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { FormDialog, RoleSelectCards } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

const DIALER_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

const BEHAVIOUR_ICONS = {
  broadcast: Megaphone,
  survey: Vote,
  transfer: PhoneForwarded,
  target: Waypoints,
} as const;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/**
 * Autodialer campaigns — voice broadcast, robo-polls, transfers and electoral
 * targeting (the source project's vocabulary, kept as-is). Draft-first create:
 * the picker chooses the behaviour (the one irreversible choice), everything
 * else lives on the campaign workbench.
 */
export default function AutodialerCampaignsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const pagination = usePaginationParams();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [behaviour, setBehaviour] = useState<DialerBehaviourKey | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

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

  const filter: ListDialerCampaignsParams = useMemo(
    () => ({
      status: statuses.length === 1 ? (statuses[0] as ListDialerCampaignsParams["status"]) : undefined,
      search: qDebounced || undefined,
    }),
    [statuses, qDebounced],
  );

  const list = useApi(
    `/autodialer/campaigns|${filterSig}|${pagination.page}|${pagination.pageSize}`,
    () =>
      autodialer.list({
        ...filter,
        limit: pagination.pageSize,
        offset: pagination.page * pagination.pageSize,
      }),
    { refetchInterval: 15_000 },
  );
  const stats = useApi("/autodialer/stats", () => autodialer.tenantStats(), { ttlMs: 10_000 });

  // The API filters a single status; multi-select narrows client-side on top.
  const rows = (list.data?.campaigns ?? []).filter(
    (c) => statuses.length <= 1 || statuses.includes(c.status),
  );
  const total = list.data?.total ?? 0;
  const s = stats.data;
  const kpi = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

  /**
   * `?new=1` opens the create dialog straight away — the "New automated calling campaign" card
   * in the start-a-conversation picker routes here, and landing on a list of existing campaigns
   * when you asked to make one is a dead end. Mirrors /channels/calls?new=1.
   *
   * Runs once per arrival: the param is stripped after opening so a later close-and-reopen of
   * the page (or a back navigation) doesn't force the dialog up again.
   */
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setCreateOpen(true);
    router.replace("/autodialer");
    // Intentionally keyed on the param alone — router/replace identities are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const startCreate = async () => {
    if (!behaviour || creating) return;
    setCreating(true);
    try {
      await createDialerCampaignAndOpen(router, showToast, behaviour);
    } finally {
      setCreating(false);
      setCreateOpen(false);
    }
  };

  return (
    <PageShell
      icon={PhoneOutgoing}
      title="Autodialer"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New campaign
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Voice broadcast, robo-polls and patch-through calling over your audiences. Calls respect
        opt-outs, attempt caps and the tenant calling window.
      </p>

      <FormDialog
        open={createOpen}
        title="New calling campaign"
        description="Pick how the campaign behaves — this is the one choice that can't change later."
        onClose={() => (creating ? null : setCreateOpen(false))}
        onSubmit={() => void startCreate()}
        submitLabel="Create draft"
        busy={creating}
        submitDisabled={!behaviour}
      >
        <RoleSelectCards
          options={DIALER_BEHAVIOUR_OPTIONS.map((option) => ({
            value: option.key,
            title: option.title,
            subtitle: option.description,
            icon: BEHAVIOUR_ICONS[option.key],
          }))}
          value={behaviour}
          onChange={(value) => setBehaviour(value as DialerBehaviourKey)}
        />
      </FormDialog>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Active campaigns" value={kpi(s?.active)} />
        <KpiTile label="Calls today" value={kpi(s?.callsToday)} />
        {/* Tenant-wide connect rate is computed over a 90-day window (DIALER_STATS_WINDOW_DAYS). */}
        <KpiTile label="Connect rate (90d)" value={s?.connectRate == null ? "—" : `${s.connectRate}%`} />
        <KpiTile label="Transfers" value={kpi(s?.transfers)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter label="Status" options={DIALER_STATUSES} selected={statuses} onChange={setStatuses} />
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search campaigns…"
          aria-label="Search campaigns"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {total} {total === 1 ? "campaign" : "campaigns"}
        </span>
      </div>

      <StateRegion
        loading={list.loading}
        error={list.error}
        noPermission={list.noPermission}
        onRetry={() => void list.refetch()}
        empty={!list.loading && rows.length === 0}
        emptyTitle="No calling campaigns"
        emptyDescription="Create one to broadcast a message, run a robo-poll or patch supporters through."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(c: DialerCampaignRecord) => c.id}
          empty="No matches."
          pageSize={0}
          onRowClick={(c: DialerCampaignRecord) => router.push(`/autodialer/${encodeURIComponent(c.id)}`)}
          columns={[
            {
              key: "name",
              header: "Campaign",
              cell: (c: DialerCampaignRecord) => (
                <span className="font-medium text-foreground">{c.name}</span>
              ),
            },
            {
              key: "behaviour",
              header: "Behaviour",
              cell: (c: DialerCampaignRecord) => (
                <span className="text-muted-foreground">{behaviourOf(c).label}</span>
              ),
            },
            { key: "status", header: "Status", cell: (c: DialerCampaignRecord) => <StatusBadge status={c.status} /> },
            {
              key: "window",
              header: "Window",
              cell: (c: DialerCampaignRecord) => (
                <span className="font-mono text-xs text-muted-foreground">
                  {c.dailyStart}–{c.dailyFinish}
                </span>
              ),
            },
            {
              key: "lastDialed",
              header: "Last dialled",
              cell: (c: DialerCampaignRecord) => (
                <span className="text-muted-foreground">{formatDate(c.lastDialedAt)}</span>
              ),
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
