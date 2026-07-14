"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getFirstNations,
  listFirstNations,
  type FirstNationsDetail,
  type FirstNationsLevel,
  type FirstNationsRow,
} from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { RegionHierarchy } from "@/components/canvass/region-hierarchy";
import { useGeoExplorerUrlState, writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { stateAbbrevToAsgsDigit } from "@/lib/canvass/states";
import { FN_TABS, firstNationsTab, resolveFirstNationsLevel } from "@/lib/canvass/first-nations";
import { StateRegion } from "@/components/shell/state-region";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DataTable } from "@uprise/field";
import { cn } from "@/lib/utils";
import { SectionCard, type WalkMode } from "@uprise/field";

const PAGE_SIZE = 10;

/**
 * First Nations panel for the unified geo surface — the ABS ASGS Indigenous Structure.
 *
 * REFERENCE-ONLY by design: there is no "Cut turf from boundary" and no "Add to my turf".
 * These are statistical geographies, and an organiser must not select doors by the
 * Indigenous composition of an area. The API refuses it too; the guarantee is not just
 * a missing button.
 *
 * The URL speaks names, not codes: `?tab=regions&code=sydney-wollongong` rather than
 * `?tab=ireg&code=107`. Both older forms still resolve. Selection lives in `?code=` and level
 * in `?tab=` (both deep-linkable), mirroring the States panel — so the surface's map reads
 * them back with no panel→surface coupling.
 *
 * With no `?code=`, the map shows every boundary of the active level across Australia; that
 * is simply the absence of a selection, not a special case.
 */
export function FirstNationsPanel({ view }: { view: WalkMode }) {
  const { q, tab, state } = useGeoExplorerUrlState({ viewStorageKey: "uprise.firstNationsView" });
  const level: FirstNationsLevel = resolveFirstNationsLevel(tab);
  const stateDigit = stateAbbrevToAsgsDigit(state);
  const [page, setPage] = useState(0);

  const searchParams = useSearchParams();
  const selectedCode = searchParams.get("code") ?? "";

  const listKey = `/geo/first-nations?${level}&${q}&${stateDigit ?? ""}&${page}`;
  const list = useApi(
    listKey,
    () =>
      listFirstNations(level, {
        q: q.trim() || undefined,
        state: stateDigit ?? undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    { ttlMs: 300_000 },
  );
  const rows: FirstNationsRow[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;

  // Shares its cache key with the surface's resolve, so this is one request, not two.
  const detailKey = selectedCode ? `/geo/first-nations/${level}/${selectedCode}` : null;
  const detail = useApi<FirstNationsDetail>(detailKey, () => getFirstNations(level, selectedCode), {
    ttlMs: 300_000,
  });

  const select = (slug: string) => writeGeoParam("code", slug || null);
  const setLevel = (next: FirstNationsLevel) => {
    setPage(0);
    writeGeoParam("code", null); // a selection from one level is meaningless at another
    writeGeoParam("type", firstNationsTab(next));
  };

  const pills = (
    <div className="flex rounded-xl border border-border p-0.5">
      {FN_TABS.map((l) => (
        <button
          key={l.level}
          type="button"
          onClick={() => setLevel(l.level)}
          aria-pressed={level === l.level}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            level === l.level ? "bg-primary text-white" : "text-foreground",
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
          {l.label}
        </button>
      ))}
    </div>
  );

  const listBody = (
    <StateRegion
      loading={list.loading}
      error={list.error}
      noPermission={list.noPermission}
      onRetry={() => void list.refetch()}
      empty={rows.length === 0}
      emptyTitle={q ? "Nothing matches" : "No Indigenous boundaries loaded"}
      emptyDescription={
        q ? undefined : "Run the geo ETL (npm --prefix apps/api run geo:load-first-nations) to load them."
      }
    >
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              onClick={() => select(selectedCode === r.slug ? "" : r.slug)}
              aria-pressed={selectedCode === r.slug}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                selectedCode === r.slug && "bg-primary-container/20",
              )}
            >
              <span className="truncate font-medium text-foreground">{r.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                {r.addressCount.toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <PaginationControls
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </StateRegion>
  );

  if (view === "map") {
    return (
      <div className="space-y-4">
        <SectionCard title={`First Nations (${total.toLocaleString()})`}>
          {pills}
          <div className="mt-3">{listBody}</div>
        </SectionCard>

        {detail.data ? (
          <SectionCard title={detail.data.name}>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li className="tabular-nums">{detail.data.addressCount.toLocaleString()} addresses</li>
              <li className="tabular-nums">{detail.data.contactCount.toLocaleString()} existing contacts</li>
              <li className="tabular-nums">{detail.data.withoutContacts.toLocaleString()} without a contact</li>
            </ul>
            <Link
              href={`/data/first-nations/${level}/${encodeURIComponent(detail.data.slug)}`}
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
            >
              Open detail
            </Link>
          </SectionCard>
        ) : null}

        {/* The hierarchy endpoint keys on the ABS code, not the slug — pass the resolved one. */}
        {detail.data ? <RegionHierarchy kind={level} code={detail.data.code} /> : null}
      </div>
    );
  }

  return (
    <div className="section-stack">
      <SectionCard title={`First Nations (${total.toLocaleString()})`}>
        {pills}
        <div className="mt-3">
          <StateRegion
            loading={list.loading}
            error={list.error}
            noPermission={list.noPermission}
            onRetry={() => void list.refetch()}
            empty={rows.length === 0}
            emptyTitle={q ? "Nothing matches" : "No Indigenous boundaries loaded"}
          >
            <DataTable
              rows={rows}
              rowKey={(r) => r.code}
              empty="Nothing to show."
              pageSize={0} /* server-paginated below via <PaginationControls> — no client pager */
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (r) => (
                    <Link
                      href={`/data/first-nations/${level}/${encodeURIComponent(r.slug)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                  ),
                },
                { key: "code", header: "Code", cell: (r) => <span className="tabular-nums">{r.code}</span> },
                { key: "state", header: "State", cell: (r) => r.state ?? "—" },
                {
                  key: "addresses",
                  header: "Addresses",
                  numeric: true,
                  cell: (r) => r.addressCount.toLocaleString(),
                },
              ]}
            />
            <PaginationControls
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => p + 1)}
            />
          </StateRegion>
        </div>
      </SectionCard>
    </div>
  );
}
