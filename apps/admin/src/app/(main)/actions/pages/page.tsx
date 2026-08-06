"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, PhoneCall, Plus } from "lucide-react";
import { actionPages, type ListActionPagesParams } from "@uprise/api-client";
import type { ActionPageRecord } from "@uprise/contracts";
import { useApi } from "@/lib/use-api";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import { createActionPageAndOpen } from "@/lib/actions-pages";
import { PageShell } from "@/components/shell/page-shell";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@uprise/field";
import { Button } from "@/components/ui/button";
import { FormDialog, RoleSelectCards } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";

const PAGE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

/**
 * Action pages — public supporter-facing surfaces. One creation type in v1
 * (click-to-call), so the create dialog is a single confirmed card and the
 * builder owns everything else.
 */
export default function ActionPagesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const pagination = usePaginationParams();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
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

  const filter: ListActionPagesParams = useMemo(
    () => ({
      status: statuses.length === 1 ? (statuses[0] as ListActionPagesParams["status"]) : undefined,
      search: qDebounced || undefined,
    }),
    [statuses, qDebounced],
  );

  const list = useApi(
    `/actions/pages|${filterSig}|${pagination.page}|${pagination.pageSize}`,
    () =>
      actionPages.list({
        ...filter,
        limit: pagination.pageSize,
        offset: pagination.page * pagination.pageSize,
      }),
    { refetchInterval: 20_000 },
  );

  const rows = (list.data?.pages ?? []).filter(
    (p) => statuses.length <= 1 || statuses.includes(p.status),
  );
  const total = list.data?.total ?? 0;

  const startCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createActionPageAndOpen(router, showToast);
    } finally {
      setCreating(false);
      setCreateOpen(false);
    }
  };

  return (
    <PageShell
      icon={Megaphone}
      title="Action pages"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New page
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Public pages your supporters act on — hosted on your action site and embeddable on any
        website you allow.
      </p>

      <FormDialog
        open={createOpen}
        title="New action page"
        description="Click-to-call is the first page type — more are coming."
        onClose={() => (creating ? null : setCreateOpen(false))}
        onSubmit={() => void startCreate()}
        submitLabel="Create draft"
        busy={creating}
      >
        <RoleSelectCards
          options={[
            {
              value: "CLICK_TO_CALL",
              title: "Click-to-call",
              subtitle: "Supporters call a target — or their own MP — straight from the browser.",
              icon: PhoneCall,
            },
          ]}
          value="CLICK_TO_CALL"
          onChange={() => {}}
        />
      </FormDialog>

      {/* id: spotlighted by the full app walkthrough's supporter-actions step. */}
      <div id="tour-action-pages" className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter label="Status" options={PAGE_STATUSES} selected={statuses} onChange={setStatuses} />
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search pages…"
          aria-label="Search pages"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {total} {total === 1 ? "page" : "pages"}
        </span>
      </div>

      <StateRegion
        loading={list.loading}
        error={list.error}
        noPermission={list.noPermission}
        onRetry={() => void list.refetch()}
        empty={!list.loading && rows.length === 0}
        emptyTitle="No action pages"
        emptyDescription="Create a click-to-call page and publish it to your action site."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(p: ActionPageRecord) => p.id}
          empty="No matches."
          pageSize={0}
          onRowClick={(p: ActionPageRecord) => router.push(`/actions/pages/${encodeURIComponent(p.id)}`)}
          columns={[
            {
              key: "title",
              header: "Page",
              cell: (p: ActionPageRecord) => <span className="font-medium text-foreground">{p.title}</span>,
            },
            {
              key: "type",
              header: "Type",
              cell: () => <span className="text-muted-foreground">Click-to-call</span>,
            },
            { key: "status", header: "Status", cell: (p: ActionPageRecord) => <StatusBadge status={p.status} /> },
            {
              key: "embed",
              header: "Embedding",
              cell: (p: ActionPageRecord) => (
                <span className="text-muted-foreground">
                  {p.embedDomains.length === 0 ? "Anywhere" : `${p.embedDomains.length} allowed`}
                </span>
              ),
            },
            {
              key: "published",
              header: "Published",
              cell: (p: ActionPageRecord) => (
                <span className="text-muted-foreground">{formatDate(p.publishedAt)}</span>
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
