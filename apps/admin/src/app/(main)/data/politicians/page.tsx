"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { listPoliticians, attendancePct, type PoliticianSummary } from "@/lib/api/civic";
import { useApi } from "@/lib/use-api";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@uprise/field";
import { cn } from "@/lib/utils";

type HouseFilter = "all" | "REPS" | "SENATE";
const HOUSES: Array<{ key: HouseFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "REPS", label: "House of Reps" },
  { key: "SENATE", label: "Senate" },
];
const HOUSE_LABEL: Record<string, string> = { REPS: "Reps", SENATE: "Senate" };

/** Politicians (They Vote For You) — a civic reference layer under /data. The whole set is
 *  ~226 rows, so we fetch once and filter client-side (no per-keystroke refetch). */
export default function PoliticiansPage() {
  const { data, loading, error, noPermission, refetch } = useApi(
    "/civic/politicians",
    (signal) => listPoliticians({}, { signal }),
    { ttlMs: 60_000 },
  );

  const [house, setHouse] = useState<HouseFilter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (house !== "all" && p.house !== house) return false;
      if (!needle) return true;
      return [p.name, p.party, p.electorate].some((f) => f?.toLowerCase().includes(needle));
    });
  }, [data, house, q]);

  return (
    <PageShell
      icon={Landmark}
      title="Politicians"
      actions={
        <Breadcrumbs
          items={[
            { label: "Data Sets", href: "/data/datasets" },
            { label: "Politicians" },
          ]}
        />
      }
    >
      <p className="text-sm text-muted-foreground">
        Federal members of parliament and how they vote, from They Vote For You. Each member is
        linked to their electorate, so you can jump straight to the boundary and cut turf.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border p-0.5">
          {HOUSES.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => setHouse(h.key)}
              aria-pressed={house === h.key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                house === h.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search by name, party or electorate…"
          aria-label="Search politicians"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {rows.length} {rows.length === 1 ? "member" : "members"}
        </span>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && rows.length === 0}
        emptyTitle="No politicians"
        emptyDescription="Run `pnpm --filter api civic:sync` to backfill from They Vote For You."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(p: PoliticianSummary) => p.id}
          empty="No matches."
          columns={[
            {
              key: "name",
              header: "Member",
              cell: (p: PoliticianSummary) => (
                <Link href={`/data/politicians/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.name}
                </Link>
              ),
            },
            { key: "party", header: "Party", cell: (p: PoliticianSummary) => p.party ?? "—" },
            {
              key: "house",
              header: "House",
              cell: (p: PoliticianSummary) => (
                <span className="rounded-full bg-surface-variant px-2 py-0.5 text-xs font-medium text-foreground">
                  {HOUSE_LABEL[p.house] ?? p.house}
                </span>
              ),
            },
            { key: "electorate", header: "Electorate", cell: (p: PoliticianSummary) => p.electorate ?? "—" },
            {
              key: "attendance",
              header: "Attendance",
              numeric: true,
              cell: (p: PoliticianSummary) => {
                const pct = attendancePct(p);
                return pct == null ? "—" : `${pct}%`;
              },
            },
            {
              key: "rebellions",
              header: "Rebellions",
              numeric: true,
              cell: (p: PoliticianSummary) => (p.rebellions ?? "—"),
            },
          ]}
        />
      </StateRegion>
    </PageShell>
  );
}
