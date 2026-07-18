"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MapPin, Plus, Save, Scissors, Trash2 } from "lucide-react";
import {
  browseAreas,
  createTurfFromAreas,
  getArea,
  type AreaHit,
  type AreaLevel,
  type AreaRow,
} from "@/lib/api/geo";
import type { SelectedArea } from "@/components/canvass/turf-draw-map";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { useGeoExplorer } from "@/lib/canvass/geo-explorer-state";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { SelectedAreasEstimate } from "@/components/canvass/selected-areas-estimate";
import { STATE_ABBREVS, stateAbbrevToAsgsDigit } from "@/lib/canvass/states";
import { UniverseCards, UniverseSelect } from "@/components/canvass/universe-select";
import { useGeoExplorerUrlState } from "@/components/canvass/use-geo-explorer-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { type WalkMode } from "@uprise/field";
import { AutoAccordionGroup, CollapsibleCard } from "./collapsible-card";

const DIGIT_TO_STATE: Record<string, string> = Object.fromEntries(
  STATE_ABBREVS.map((s) => [stateAbbrevToAsgsDigit(s) ?? "", s]),
);

// Per-level legend-dot colour for the sub-level pills (mirrors the divisions tabs).
// Coarse → fine: SA4 violet → meshblock amber.
const TABS: Array<{ level: AreaLevel; label: string; color: string }> = [
  { level: "sa4", label: "SA4", color: "#7c3aed" },
  { level: "sa3", label: "SA3", color: "#2563eb" },
  { level: "sa2", label: "SA2", color: "#0891b2" },
  { level: "sa1", label: "SA1", color: "#059669" },
  { level: "mb", label: "Meshblock", color: "#ca8a04" },
];
const TAB_LEVELS = new Set<string>(TABS.map((t) => t.level));

/**
 * Areas panel for the unified geo surface (Phase 2). The map (with its own on-map
 * level-pills + search combobox) lives in the surface; the on-map selection +
 * drawn polygons + the "in view" list all round-trip `useGeoExplorer()`, so they
 * survive a kind switch. This renders the "in view" list, the cut-selection card,
 * the selected-areas list, universe + My turf (map view), or the browse table
 * (list view).
 */
export function AreasPanel({ view }: { view: WalkMode }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { q, tab, state, setTab } = useGeoExplorerUrlState({
    viewStorageKey: "uprise.areasView",
    legacyTabParam: "layer",
    legacyHashToTab: { mb: "mb", sa1: "sa1", sa2: "sa2", sa3: "sa3", sa4: "sa4" },
  });
  const level = (TAB_LEVELS.has(tab ?? "") ? tab : "sa2") as AreaLevel;
  const stateCode = stateAbbrevToAsgsDigit(state) ?? "";

  const {
    universe,
    setUniverse,
    selectedAreas,
    setSelectedAreas,
    toggleSelectedArea,
    drawnPolygons,
    setDrawnPolygons,
    bumpClearToken,
    viewportAreas,
    viewTooZoomed,
  } = useGeoExplorer();

  const { cutTurf, busy } = useCutTurf(universe);
  const {
    basket,
    toggleArea: basketToggleArea,
    hasArea: basketHasArea,
    setPolygons: basketSetPolygons,
    coveredBy,
  } = useTurfBasket();

  // ── List mode: server-paged browse of the level's full national set ────────
  const [hits, setHits] = useState<AreaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);

  // ── Map mode: turf name for the current selection (areas + drawn polygons) ──
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = q.trim();
  const minChars = level === "mb" || level === "sa1" ? 3 : 2;
  const effectiveQ = trimmed.length >= minChars ? trimmed : "";

  useEffect(() => {
    setPage(0);
  }, [level, effectiveQ, stateCode]);

  useEffect(() => {
    if (view !== "list") return;
    let alive = true;
    setSearching(true);
    void (async () => {
      const res = await browseAreas({
        layer: level,
        q: effectiveQ || undefined,
        state: stateCode || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        setDenied(res.status === 403);
        setHits([]);
        setTotal(0);
      } else {
        setError("");
        setDenied(false);
        setHits(res.data.rows);
        setTotal(res.data.total);
      }
      setSearching(false);
    })();
    return () => {
      alive = false;
    };
  }, [effectiveQ, level, view, stateCode, page]);

  // ── Map mode: "in view" base ────────────────────────────────────────────────
  // The viewport list is what's rendered on the map right now. When a State
  // Filter is set but the viewport has nothing to show (too zoomed out for the
  // level, or between tile loads), fall back to the whole state's areas so the
  // state is always the *base* of the list — the live viewport still takes over
  // the moment areas are actually rendered.
  const [stateBase, setStateBase] = useState<AreaHit[]>([]);
  const needStateBase = view === "map" && !!stateCode && viewportAreas.length === 0;
  useEffect(() => {
    if (!needStateBase) {
      setStateBase([]);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await browseAreas({ layer: level, state: stateCode, limit: 300 });
      if (!alive) return;
      setStateBase(
        res.ok ? res.data.rows.map((r) => ({ level: r.level, code: r.code, name: r.name })) : [],
      );
    })();
    return () => {
      alive = false;
    };
  }, [needStateBase, level, stateCode]);

  // The "in view" card shows the live viewport areas when present, else the state
  // base (when a State Filter is set), else nothing.
  const inViewAreas = viewportAreas.length ? viewportAreas : stateBase;
  const usingStateBase = viewportAreas.length === 0 && stateBase.length > 0;

  const cutFromArea = (hit: AreaHit) =>
    cutTurf({
      id: hit.code,
      name: hit.name,
      create: () => createTurfFromAreas({ name: hit.name, areas: [{ layer: level, code: hit.code }] }),
    });

  // Clicking a "in view" row selects the area — fetch its boundary (the viewport
  // list carries code+name only) then toggle, same as picking it on the map.
  const selectAreaByCode = useCallback(
    async (hit: AreaHit) => {
      const res = await getArea(hit.level, hit.code);
      if (res.ok) {
        toggleSelectedArea({
          level: hit.level,
          code: res.data.properties.code,
          name: res.data.properties.name,
          geometry: res.data.geometry,
        });
      }
    },
    [toggleSelectedArea],
  );

  const removeSelectedArea = (area: SelectedArea) => toggleSelectedArea(area);

  const hasSelection = selectedAreas.length > 0 || drawnPolygons.length > 0;

  // Cut a turf from the whole map selection (areas + drawn polygons).
  const handleSave = useCallback(async () => {
    if (!hasSelection) {
      showToast({ tone: "warning", title: "Nothing selected", description: "Click areas or draw a polygon first." });
      return;
    }
    const turfName = name.trim() || "New turf";
    setSaving(true);
    const ok = await cutTurf({
      id: "__selection__",
      name: turfName,
      create: () =>
        createTurfFromAreas({
          name: turfName,
          areas: selectedAreas.map((a) => ({ layer: a.level, code: a.code })),
          polygons: drawnPolygons,
        }),
      then: null, // stay on the map after cutting
    });
    setSaving(false);
    if (ok) {
      setName("");
      setDrawnPolygons([]);
      setSelectedAreas([]);
      bumpClearToken();
    }
  }, [hasSelection, name, selectedAreas, drawnPolygons, cutTurf, showToast, setDrawnPolygons, setSelectedAreas, bumpClearToken]);

  // Push the current map selection (areas + drawn polygons) into the shared
  // basket, then clear the local selection so it reads as "banked".
  const addSelectionToBasket = useCallback(() => {
    selectedAreas.forEach((a) => {
      if (!basketHasArea(a.level, a.code)) basketToggleArea({ level: a.level, code: a.code, name: a.name });
    });
    if (drawnPolygons.length) basketSetPolygons([...basket.polygons, ...drawnPolygons]);
    setSelectedAreas([]);
    setDrawnPolygons([]);
    bumpClearToken();
  }, [selectedAreas, drawnPolygons, basket.polygons, basketHasArea, basketToggleArea, basketSetPolygons, setSelectedAreas, setDrawnPolygons, bumpClearToken]);

  const tabPills = (
    <div className="flex rounded-xl border border-border p-0.5">
      {TABS.map((t) => (
        <button
          key={t.level}
          type="button"
          aria-pressed={level === t.level}
          onClick={() => {
            setTab(t.level);
            setHits([]);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            level === t.level ? "bg-primary text-white" : "text-foreground",
          )}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
          {t.label}
        </button>
      ))}
    </div>
  );

  if (view === "map") {
    return (
      <div className="space-y-4">
        {/* One card of attention: picking areas (or drawing) opens Cut selection and folds the browse list. */}
        <AutoAccordionGroup defaultOpen="in-view" follow={hasSelection ? "cut" : ""}>
        <CollapsibleCard
          id="in-view"
          title={
            usingStateBase
              ? `${level.toUpperCase()} in ${state} (${inViewAreas.length})`
              : `${level.toUpperCase()} in view (${viewportAreas.length})`
          }
          description={usingStateBase ? `Whole of ${state} — zoom in on the map to narrow to what's in view.` : undefined}
        >
          {inViewAreas.length > 0 ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {inViewAreas.map((a) => {
                const sel = selectedAreas.some((s) => s.level === a.level && s.code === a.code);
                return (
                  <li key={`${a.level}:${a.code}`}>
                    <button
                      type="button"
                      aria-pressed={sel}
                      onClick={() => void selectAreaByCode(a)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant",
                        sel && "bg-primary-container/20",
                      )}
                    >
                      <span className="truncate font-medium text-foreground">{a.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{a.code}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : viewTooZoomed ? (
            <p className="text-sm text-muted-foreground">
              Zoom in to load {level.toUpperCase()} boundaries, or search on the map.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No {level.toUpperCase()} areas in view — pan or zoom the map, or search on it.
            </p>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          id="cut"
          title="Cut selection"
          description="Cut these areas now, or add them to My turf below to combine with other parts."
        >
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Name
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New turf" />
          <p className="mt-2 text-xs text-muted-foreground">
            {hasSelection
              ? `${selectedAreas.length} area${selectedAreas.length === 1 ? "" : "s"}${
                  drawnPolygons.length ? ` + ${drawnPolygons.length} polygon${drawnPolygons.length === 1 ? "" : "s"}` : ""
                } selected`
              : "Click areas or draw a polygon to define the boundary."}
          </p>
          <Button className="mt-3 w-full" onClick={handleSave} disabled={saving || !hasSelection}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf now"}
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={addSelectionToBasket}
            disabled={!hasSelection}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add selection to my turf
          </Button>
        </CollapsibleCard>

        {selectedAreas.length > 0 ? (
          <CollapsibleCard id="selected" title={`Selected areas (${selectedAreas.length})`}>
            <ul className="space-y-1.5">
              {selectedAreas.map((a) => (
                <li key={`${a.level}:${a.code}`} className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                    {a.level}
                  </span>
                  <span className="truncate font-medium text-foreground">{a.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeSelectedArea(a)}
                    className="ml-auto text-muted-foreground hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <SelectedAreasEstimate areas={selectedAreas.map((a) => ({ level: a.level, code: a.code }))} />
          </CollapsibleCard>
        ) : null}
        </AutoAccordionGroup>

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

      {denied ? (
        <EmptyState
          title="You don't have access to area search"
          description="Ask an organisation owner if you need the canvassing permission."
        />
      ) : error ? (
        <EmptyState
          title="Geo data not loaded"
          description={`${error}. Load the G-NAF + boundary datasets from Settings → Data.`}
        />
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="py-2 pr-4">Area</th>
                    <th className="py-2 pr-4">State</th>
                    <th className="py-2 pr-4">Addresses</th>
                    <th className="py-2 pr-4">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searching
                    ? Array.from({ length: pageSize }).map((_, index) => (
                        <tr key={`area-skeleton-${index}`} className="border-b border-border/60">
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-44" /></td>
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-12" /></td>
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-16" /></td>
                          <td className="py-3 pr-4"><Skeleton className="h-4 w-24" /></td>
                        </tr>
                      ))
                    : hits.map((h) => (
                        <tr
                          key={`${h.level}:${h.code}`}
                          className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                          onClick={() => router.push(`/data/areas/${level}/${encodeURIComponent(h.code)}`)}
                        >
                          <td className="py-3 pr-4">
                            <Link
                              href={`/data/areas/${level}/${encodeURIComponent(h.code)}`}
                              className="font-medium text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {h.name}
                            </Link>
                            <p className="text-xs text-muted-foreground tabular-nums">{h.code}</p>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{DIGIT_TO_STATE[h.code[0]] ?? "—"}</td>
                          <td className="py-3 pr-4 tabular-nums">{h.addressCount.toLocaleString()}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                              {(() => {
                                const cov = basketHasArea(level, h.code) ? null : coveredBy({ kind: "area", level, code: h.code });
                                return (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={!!cov}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      basketToggleArea({ level, code: h.code, name: h.name });
                                    }}
                                  >
                                    {cov ? (
                                      <><Check className="mr-1.5 h-3.5 w-3.5" />In {cov}</>
                                    ) : basketHasArea(level, h.code) ? (
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
                                disabled={busy === h.code}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void cutFromArea(h);
                                }}
                              >
                                <Scissors className="mr-1.5 h-3.5 w-3.5" />
                                {busy === h.code ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  {!searching && hits.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        No {level.toUpperCase()} areas{effectiveQ ? ` match “${effectiveQ}”` : ""}
                        {state ? ` in ${state}` : ""}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {hits.length ? page * pageSize + 1 : 0}–{page * pageSize + hits.length} of{" "}
                {total.toLocaleString()} {level.toUpperCase()} areas
                {trimmed && trimmed.length < minChars ? ` — type ${minChars}+ characters to filter` : ""}
              </p>
              <PaginationControls
                page={page}
                pageSize={pageSize}
                total={total}
                onPrev={() => setPage((prev) => Math.max(0, prev - 1))}
                onNext={() => setPage((prev) => prev + 1)}
              />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Click an area for its boundary + coverage, or switch to the map for multi-area turf.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
