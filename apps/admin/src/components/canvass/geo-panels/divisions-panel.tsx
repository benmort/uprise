"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Layers, Map as MapIcon, Plus, Scissors } from "lucide-react";
import {
  createTurfFromDivision,
  getDivision,
  listDivisions,
  type Division,
  type DivisionDetail,
  type DivisionType,
} from "@/lib/api/geo";
import { useApi } from "@/lib/use-api";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { useGeoExplorer } from "@/lib/canvass/geo-explorer-state";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { UniverseCards, UniverseSelect } from "@/components/canvass/universe-select";
import { useGeoExplorerUrlState, writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { stateAbbrevToAsgsDigit, stateNameToAbbrev } from "@/lib/canvass/states";
import { StateRegion } from "@/components/shell/state-region";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { SectionCard, type WalkMode } from "@uprise/field";

const TABS: Array<{ type: DivisionType; label: string }> = [
  { type: "ced", label: "Federal" },
  { type: "sed", label: "State" },
  { type: "lga", label: "Local (LGA)" },
];

// Map colour per division type — matches the legend dot on the pills (the map's
// boundary layers use the same palette; see geo-surface.tsx).
const TYPE_COLORS: Record<DivisionType, string> = {
  ced: "#dc2626", // Federal — red
  sed: "#7c3aed", // State — violet
  lga: "#d97706", // Local (LGA) — amber
};

/**
 * Divisions panel for the unified geo surface (Phase 2). The persistent map lives
 * in the surface; this renders only the non-map content (sub-level pills, list,
 * detail, universe, My turf). Durable selection + universe come from
 * `useGeoExplorer()` so they survive a kind switch; the map reads the same
 * selection to paint the picked boundary.
 */
export function DivisionsPanel({ view }: { view: WalkMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { q, tab, state, setTab } = useGeoExplorerUrlState({
    viewStorageKey: "uprise.divisionsView",
    legacyHashToTab: { federal: "ced", state: "sed", local: "lga" },
  });
  const type = (TABS.some((t) => t.type === tab) ? tab : "ced") as DivisionType;
  // Show one layer at a time by default; ?overlay=1 stacks all three (Federal +
  // State + Local) together on the map. The map itself reads the same param.
  const overlay = searchParams.get("overlay") === "1";
  const stateDigit = stateAbbrevToAsgsDigit(state);

  const { universe, setUniverse, divisionSelected, setDivisionSelected } = useGeoExplorer();
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const { cutTurf, busy } = useCutTurf(universe);
  const { addDivision, hasDivision, removeDivision, coveredBy } = useTurfBasket();
  const divDigit = (stateName: string | null) =>
    stateAbbrevToAsgsDigit(stateNameToAbbrev(stateName ?? undefined) ?? undefined);
  const addDiv = (d: { code: string; name: string; state: string | null }) =>
    addDivision({ type, code: d.code, name: d.name, stateDigit: divDigit(d.state) });

  const { data, loading, error, noPermission, refetch } = useApi(
    `/geo/divisions?type=${type}`,
    () => listDivisions(type),
    { ttlMs: 300_000 },
  );
  const rows: Division[] = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q.trim().toLowerCase()) &&
          (!stateDigit || r.code.startsWith(stateDigit)),
      ),
    [rows, q, stateDigit],
  );
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => {
    setPage(0);
  }, [type, q, stateDigit]);

  // Selection carries its type so a tab switch never pairs a new type with a
  // stale code; the map's onBoundaryClick writes the same provider slot.
  const selectedCode = divisionSelected?.type === type ? divisionSelected.code : "";
  const selectDivision = (code: string) =>
    setDivisionSelected(selectedCode === code ? null : { type, code });
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
    <div className="flex rounded-xl border border-border p-0.5">
      {TABS.map((t) => (
        <button
          key={t.type}
          type="button"
          aria-pressed={type === t.type}
          onClick={() => setTab(t.type)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            type === t.type ? "bg-primary text-white" : "text-foreground",
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[t.type] }} />
          {t.label}
        </button>
      ))}
    </div>
  );

  if (view === "map") {
    const mapList = filtered.slice(0, 100);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabPills}
          {/* Overlay: stack all three division layers together vs the single
              active one. Off by default so only the selected tab's boundaries show. */}
          <button
            type="button"
            aria-pressed={overlay}
            onClick={() => writeGeoParam("overlay", overlay ? null : "1")}
            title={overlay ? "Showing all three layers — click to show one at a time" : "Overlay Federal + State + Local together"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
              overlay
                ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                : "border-border text-foreground hover:bg-surface-variant",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Overlay all
          </button>
        </div>

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
                    onClick={() => selectDivision(d.code)}
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
                  onClick={() =>
                    hasDivision(type, detail.data!.code)
                      ? removeDivision(type, detail.data!.code)
                      : addDiv(detail.data!)
                  }
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
                                  if (hasDivision(type, d.code)) removeDivision(type, d.code);
                                  else addDiv(d);
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
