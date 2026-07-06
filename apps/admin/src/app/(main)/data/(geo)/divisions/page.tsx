"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Map as MapIcon, Plus, Scissors } from "lucide-react";
import {
  createTurfFromDivision,
  getDivision,
  listDivisions,
  type Division,
  type DivisionDetail,
  type DivisionType,
  type TurfUniverse,
} from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { UniverseCards, UniverseSelect } from "@/components/canvass/universe-select";
import { useGeoExplorerUrlState } from "@/components/canvass/use-geo-explorer-url-state";
import { STATE_ABBREVS, stateAbbrevToAsgsDigit, stateNameToAbbrev } from "@/lib/canvass/states";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { AU_BOUNDS, SectionCard } from "@uprise/field";

// mapbox-gl touches window – never statically imported into the shell.
const TurfMap = dynamic(() => import("@uprise/field").then((m) => m.TurfMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const TABS: Array<{ type: DivisionType; label: string }> = [
  { type: "ced", label: "Federal" },
  { type: "sed", label: "State" },
  { type: "lga", label: "Local (LGA)" },
];

/**
 * Divisions explorer panel. The chrome (kind switcher, search box, list/map
 * toggle) lives in the persistent (geo) layout; this page reads the shared URL
 * contract (?q / ?view / ?tab) and renders the panels. Search is a client-side
 * filter over the loaded set (≤548 rows) – the layout already debounced ?q=.
 */
export default function DivisionsPage() {
  const router = useRouter();
  const { q, view, tab, state, setTab, setState } = useGeoExplorerUrlState({
    viewStorageKey: "uprise.divisionsView",
    // Old Settings→Data bookmarks: /data/divisions#federal|#state|#local.
    legacyHashToTab: { federal: "ced", state: "sed", local: "lga" },
  });
  const type = (TABS.some((t) => t.type === tab) ? tab : "ced") as DivisionType;
  const stateFilter = state || "all"; // ?state= (abbreviation) → the state <select>

  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const { cutTurf, busy } = useCutTurf(universe);
  const { addDivision, hasDivision, coveredBy } = useTurfBasket();
  // The ASGS state digit for a division (from its state name) — the basket's
  // containment cover key, so a basketed whole state dedups its divisions.
  const divDigit = (stateName: string | null) =>
    stateAbbrevToAsgsDigit(stateNameToAbbrev(stateName ?? undefined) ?? undefined);
  const addDiv = (d: { code: string; name: string; state: string | null }) =>
    addDivision({ type, code: d.code, name: d.name, stateDigit: divDigit(d.state) });

  // Cached 5 min per tab: national division sets change only with a geo re-ingest.
  const { data, loading, error, noPermission, refetch } = useApi(
    `/geo/divisions?type=${type}`,
    () => listDivisions(type),
    { ttlMs: 300_000 },
  );
  const rows: Division[] = useMemo(() => data ?? [], [data]);

  // Options are abbreviations (shared ?state= vocabulary) present in the loaded set.
  const states = useMemo(
    () =>
      STATE_ABBREVS.filter((abbrev) => rows.some((r) => stateNameToAbbrev(r.state) === abbrev)),
    [rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q.trim().toLowerCase()) &&
          (stateFilter === "all" || stateNameToAbbrev(r.state) === stateFilter),
      ),
    [rows, q, stateFilter],
  );
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => {
    setPage(0);
  }, [type, q, stateFilter]);

  // Map mode: pick a division from the sidebar → fetch + render its boundary.
  // Selection carries its type so a tab switch can never pair the new type
  // with a stale code (an effect-based reset fires AFTER useApi's fetch).
  const [selected, setSelected] = useState<{ type: DivisionType; code: string } | null>(null);
  const selectedCode = selected?.type === type ? selected.code : "";
  const detailKey = selectedCode ? `/geo/divisions/${type}/${selectedCode}` : null;
  const detail = useApi<DivisionDetail>(detailKey, () => getDivision(type, selectedCode), {
    ttlMs: 300_000,
  });

  const cutFromDivision = (d: Pick<Division, "code" | "name">) =>
    cutTurf({
      id: d.code,
      name: d.name,
      create: () => createTurfFromDivision({ type, code: d.code, name: d.name }),
    });

  const tabPills = (
    <>
      <div className="flex rounded-xl border border-border p-0.5">
        {TABS.map((t) => (
          <button
            key={t.type}
            type="button"
            aria-pressed={type === t.type}
            onClick={() => setTab(t.type)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              type === t.type ? "bg-primary text-white" : "text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        State Filter:
        <select
          value={stateFilter}
          onChange={(e) => setState(e.target.value === "all" ? "" : e.target.value)}
          title="Filter divisions by state or territory"
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
        >
          <option value="all">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  if (view === "map") {
    const mapList = filtered.slice(0, 100);
    return (
      <div className="section-stack">
        <div className="flex flex-wrap items-center gap-2">{tabPills}</div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="relative h-[65vh] overflow-hidden rounded-2xl border border-border">
            <TurfMap
              mode="edit"
              turfGeometry={(detail.data?.geometry as GeoJSON.Geometry | undefined) ?? null}
              stops={[]}
              defaultBounds={AU_BOUNDS}
            />
            {!detail.data?.geometry && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                <span
                  className={cn(
                    "rounded-lg border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium shadow-card backdrop-blur",
                    detail.error ? "text-error" : "text-muted-foreground",
                  )}
                >
                  {detail.loading
                    ? "Loading boundary…"
                    : detail.noPermission
                      ? "You don't have permission to view boundaries."
                      : detail.error
                        ? `Couldn't load the boundary – ${detail.error}`
                        : "Pick a division from the list to see its boundary."}
                </span>
              </div>
            )}
            {detail.error && !detail.loading && !detail.noPermission ? (
              <div className="absolute inset-x-0 bottom-12 z-10 flex justify-center">
                <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
          <div className="space-y-4">
            <SectionCard
              title={`Divisions (${filtered.length.toLocaleString()})${q ? ` matching “${q.trim()}”` : ""}`}
            >
              <StateRegion
                loading={loading}
                error={error}
                noPermission={noPermission}
                onRetry={() => void refetch()}
                empty={filtered.length === 0}
                emptyTitle={q ? "No divisions match" : "No divisions loaded"}
              >
                <p className="mb-2 text-xs text-muted-foreground">
                  Showing {mapList.length.toLocaleString()} of {filtered.length.toLocaleString()}
                </p>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {mapList.map((d) => (
                    <li key={d.code}>
                      <button
                        type="button"
                        onClick={() => setSelected({ type, code: d.code })}
                        aria-pressed={selectedCode === d.code}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                          selectedCode === d.code && "bg-primary-container/20",
                        )}
                      >
                        <span className="truncate font-medium text-foreground">{d.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                          {d.addressCount.toLocaleString()}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </StateRegion>
            </SectionCard>

            {detail.data ? (
              <SectionCard title={detail.data.name}>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="tabular-nums">{detail.data.addressCount.toLocaleString()} addresses</li>
                  <li className="tabular-nums">{detail.data.contactCount.toLocaleString()} existing contacts</li>
                  <li className="tabular-nums">{detail.data.withoutContacts.toLocaleString()} cold doors</li>
                </ul>
                <Button
                  className="mt-3 w-full"
                  disabled={busy === detail.data.code}
                  onClick={() => void cutFromDivision(detail.data!)}
                >
                  <Scissors className="mr-1.5 h-4 w-4" />
                  {busy === detail.data.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf from boundary"}
                </Button>
                {(() => {
                  const cov = coveredBy({ kind: "division", type, code: detail.data.code, stateDigit: divDigit(detail.data.state) });
                  return (
                    <Button
                      variant="outline"
                      className="mt-2 w-full"
                      disabled={!!cov}
                      onClick={() => addDiv(detail.data!)}
                    >
                      {cov ? (
                        <><Check className="mr-1.5 h-4 w-4" />Covered by {cov}</>
                      ) : hasDivision(type, detail.data.code) ? (
                        <><Check className="mr-1.5 h-4 w-4" />In my turf</>
                      ) : (
                        <><Plus className="mr-1.5 h-4 w-4" />Add to my turf</>
                      )}
                    </Button>
                  );
                })()}
              </SectionCard>
            ) : null}

            <UniverseCards value={universe} onChange={setUniverse} />
            <MyTurfPanel universe={universe} onUniverseChange={setUniverse} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-center gap-2">
        {tabPills}
        <UniverseSelect value={universe} onChange={setUniverse} className="ml-auto" />
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        errorTitle="Geo data not loaded"
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Division</th>
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Addresses</th>
                    <th className="py-2 pr-4">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((d) => (
                    <tr
                      key={d.code}
                      className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                      onClick={() => router.push(`/data/divisions/${type}/${encodeURIComponent(d.code)}`)}
                    >
                      <td className="py-3 pr-4">
                        {/* Real link: the row onClick is mouse-only, this is the keyboard path. */}
                        <Link
                          href={`/data/divisions/${type}/${encodeURIComponent(d.code)}`}
                          className="font-medium text-primary hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {d.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{d.code}</p>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.state ?? "–"}</td>
                      <td className="py-3 pr-4 tabular-nums">{d.addressCount.toLocaleString()}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                          {(() => {
                            const cov = coveredBy({ kind: "division", type, code: d.code, stateDigit: divDigit(d.state) });
                            return (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!!cov}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  addDiv(d);
                                }}
                              >
                                {cov ? (
                                  <><Check className="mr-1.5 h-3.5 w-3.5" />In {cov}</>
                                ) : hasDivision(type, d.code) ? (
                                  <><Check className="mr-1.5 h-3.5 w-3.5" />Added</>
                                ) : (
                                  <><Plus className="mr-1.5 h-3.5 w-3.5" />My turf</>
                                )}
                              </Button>
                            );
                          })()}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === d.code}
                            onClick={(event) => {
                              event.stopPropagation();
                              void cutFromDivision(d);
                            }}
                          >
                            <Scissors className="mr-1.5 h-3.5 w-3.5" />
                            {busy === d.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No divisions{q ? ` match “${q.trim()}”` : ""}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {paged.length} of {filtered.length} divisions
              </p>
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPrev={() => setPage((prev) => Math.max(0, prev - 1))}
                onNext={() => setPage((prev) => prev + 1)}
              />
            </div>
          </CardContent>
        </Card>
      </StateRegion>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapIcon className="h-3.5 w-3.5" />
        Click a division for its boundary + coverage, or switch to the map to browse boundaries here.
      </p>
    </div>
  );
}
