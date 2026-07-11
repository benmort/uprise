"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Scale } from "lucide-react";
import { listPolicies, type PolicySummary } from "@/lib/api/civic";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@uprise/field";
import { DataExplorerTabs } from "@/components/data/data-explorer-tabs";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "published" | "provisional";
const STATUSES: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "provisional", label: "Provisional" },
];

/** Policies (They Vote For You) — a civic reference layer under /data. A few hundred rows, so we
 *  fetch once and filter client-side. Each policy links to how every tracked member voted on it. */
export default function PoliciesPage() {
  const { data, loading, error, noPermission, refetch } = useApi(
    "/civic/policies",
    (signal) => listPolicies({}, { signal }),
    { ttlMs: 60_000 },
  );

  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (status === "published" && p.provisional) return false;
      if (status === "provisional" && !p.provisional) return false;
      if (!needle) return true;
      return [p.name, p.description].some((f) => f?.toLowerCase().includes(needle));
    });
  }, [data, status, q]);

  return (
    <PageShell
      icon={Scale}
      title="Policies"
      actions={<Breadcrumbs items={[{ label: "Data Sets", href: "/data/datasets" }, { label: "Policies" }]} />}
    >
      <p className="text-sm text-muted-foreground">
        They Vote For You policies — positions the community tracks across parliamentary votes. Open one to
        see how every member has voted on it, or jump from a member to the policies they align with.
        Federal parliament only at this stage — state parliaments have no published voting record.
      </p>

      <DataExplorerTabs active="policies" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              aria-pressed={status === s.key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                status === s.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search policies by name or description…"
          aria-label="Search policies"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {rows.length} {rows.length === 1 ? "policy" : "policies"}
        </span>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && rows.length === 0}
        emptyTitle="No policies"
        emptyDescription="Run `pnpm --filter api civic:sync` to backfill from They Vote For You."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(p: PolicySummary) => p.id}
          empty="No matches."
          columns={[
            {
              key: "name",
              header: "Policy",
              cell: (p: PolicySummary) => (
                <Link href={`/data/policies/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.name}
                </Link>
              ),
            },
            {
              key: "description",
              header: "Description",
              cell: (p: PolicySummary) => (
                <span className="line-clamp-2 max-w-xl text-muted-foreground">{p.description ?? "—"}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (p: PolicySummary) => (
                <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-medium text-foreground">
                  {p.provisional ? "Provisional" : "Published"}
                </span>
              ),
            },
            {
              key: "edited",
              header: "Last edited",
              cell: (p: PolicySummary) => (p.lastEditedAt ? new Date(p.lastEditedAt).toLocaleDateString() : "—"),
            },
          ]}
        />
      </StateRegion>
    </PageShell>
  );
}
