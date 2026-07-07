"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
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
  type TurfUniverse,
} from "@/lib/api/geo";
import type { ExistingTurf, SelectedArea } from "@/components/canvass/turf-draw-map";
import { useCutTurf } from "@/lib/canvass/use-cut-turf";
import { useTurfBasket } from "@/lib/canvass/turf-basket";
import { MyTurfPanel } from "@/components/canvass/my-turf-panel";
import { STATE_ABBREVS, stateAbbrevToAsgsDigit, stateBounds } from "@/lib/canvass/states";
import { UniverseCards, UniverseSelect } from "@/components/canvass/universe-select";
import { useGeoExplorerUrlState, useGeoTabRowSlot } from "@/components/canvass/use-geo-explorer-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { SectionCard } from "@uprise/field";

// mapbox-gl + draw touch window: keep them out of SSR.
const TurfDrawMap = dynamic(
  () => import("@/components/canvass/turf-draw-map").then((m) => m.TurfDrawMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

// ASGS state digit (first digit of every area code) → abbreviation, for the
// table's State column.
const DIGIT_TO_STATE: Record<string, string> = Object.fromEntries(
  STATE_ABBREVS.map((s) => [stateAbbrevToAsgsDigit(s) ?? "", s]),
);

// Full ASGS hierarchy, coarsest → finest.
const TABS: Array<{ level: AreaLevel; label: string }> = [
  { level: "sa4", label: "SA4" },
  { level: "sa3", label: "SA3" },
  { level: "sa2", label: "SA2" },
  { level: "sa1", label: "SA1" },
  { level: "mb", label: "Meshblock" },
];
const TAB_LEVELS = new Set<string>(TABS.map((t) => t.level));


/**
 * Areas explorer panel. Chrome (kind switcher, search box, view toggle) lives
 * in the persistent (geo) layout; this page reads ?q/?view/?tab. Search is
 * server-side (areas can't be enumerated) – the layout already debounced ?q=,
 * so the effect fires immediately on the param change.
 */
export default function AreasPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { q, view, tab, state, places, setTab, setPlaces, setQ } = useGeoExplorerUrlState({
    viewStorageKey: "uprise.areasView",
    // Old Settings→Data bookmarks used ?layer= and #sa2-style hashes.
    legacyTabParam: "layer",
    legacyHashToTab: { mb: "mb", sa1: "sa1", sa2: "sa2", sa3: "sa3", sa4: "sa4" },
  });
  const level = (TAB_LEVELS.has(tab ?? "") ? tab : "sa2") as AreaLevel;
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");
  // The shared ?state= (abbreviation): the ASGS digit filters the list/search, and
  // the bounds frame the map to that state.
  const stateCode = stateAbbrevToAsgsDigit(state) ?? "";
  const focusBounds = stateBounds(state);
  const searchMode: "place" | "area" = places ? "place" : "area";

  // ── List mode: server-paged browse of the level's full national set ────────
  const [hits, setHits] = useState<AreaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const { cutTurf, busy } = useCutTurf(universe);
  const {
    basket,
    toggleArea: basketToggleArea,
    hasArea: basketHasArea,
    setPolygons: basketSetPolygons,
    coveredBy,
  } = useTurfBasket();

  // ── Map mode: turf cutting from a mixed area/polygon selection ─────────────
  const [name, setName] = useState("");
  const [polygons, setPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [clearToken, setClearToken] = useState(0);
  const [saving, setSaving] = useState(false);
  // Map sidebar list: the areas currently loaded in the viewport (emitted by
  // TurfDrawMap) + whether we're zoomed too far out to load this level.
  const [viewportAreas, setViewportAreas] = useState<AreaHit[]>([]);
  const [viewTooZoomed, setViewTooZoomed] = useState(false);
  const onViewportAreasChange = useCallback((areas: AreaHit[], tooZoomed: boolean) => {
    setViewportAreas(areas);
    setViewTooZoomed(tooZoomed);
  }, []);

  const trimmed = q.trim();
  // pg_trgm can't extract a trigram from a 1–2 char pattern, so the big fine
  // levels (368k meshblocks, 61k SA1s) would seq-scan per keystroke below 3.
  const minChars = level === "mb" || level === "sa1" ? 3 : 2;

  // A too-short query browses unfiltered rather than seq-scanning (the layout
  // already debounced the ?q= write — one debounce point, not two stacked).
  const effectiveQ = trimmed.length >= minChars ? trimmed : "";

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(0);
  }, [level, effectiveQ, stateCode]);

  // Server-paged browse: like the divisions table, but the fine levels (61k
  // SA1s, 368k meshblocks) can't ship whole — the API pages + counts for us.
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

  const cutFromArea = (hit: AreaHit) =>
    cutTurf({
      id: hit.code,
      name: hit.name,
      create: () => createTurfFromAreas({ name: hit.name, areas: [{ layer: level, code: hit.code }] }),
    });

  const toggleArea = useCallback((area: SelectedArea) => {
    setSelectedAreas((cur) => {
      const key = `${area.level}:${area.code}`;
      const exists = cur.some((a) => `${a.level}:${a.code}` === key);
      return exists ? cur.filter((a) => `${a.level}:${a.code}` !== key) : [...cur, area];
    });
  }, []);

  // Clicking a sidebar row selects the area — fetch its boundary (the viewport
  // list carries code+name only) then toggle, same as picking it on the map.
  const selectAreaByCode = useCallback(
    async (hit: AreaHit) => {
      const res = await getArea(hit.level, hit.code);
      if (res.ok) {
        toggleArea({
          level: hit.level,
          code: res.data.properties.code,
          name: res.data.properties.name,
          geometry: res.data.geometry,
        });
      }
    },
    [toggleArea],
  );

  const hasSelection = selectedAreas.length > 0 || polygons.length > 0;

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
          polygons,
        }),
      then: null, // stay on the map after cutting
    });
    setSaving(false);
    if (ok) {
      setName("");
      setPolygons([]);
      setSelectedAreas([]);
      setClearToken((k) => k + 1);
    }
  }, [hasSelection, name, selectedAreas, polygons, cutTurf, showToast]);

  // Push the current map selection (areas + drawn polygons) into the shared
  // basket, then clear the local selection so it reads as "banked".
  const addSelectionToBasket = useCallback(() => {
    selectedAreas.forEach((a) => {
      if (!basketHasArea(a.level, a.code)) basketToggleArea({ level: a.level, code: a.code, name: a.name });
    });
    if (polygons.length) basketSetPolygons([...basket.polygons, ...polygons]);
    setSelectedAreas([]);
    setPolygons([]);
    setClearToken((k) => k + 1);
  }, [selectedAreas, polygons, basket.polygons, basketHasArea, basketToggleArea, basketSetPolygons]);

  const existing: ExistingTurf[] = [];

  // Map mode's level pills portal into this row so they sit under the page chrome
  // like the divisions tabs, not floating over the map.
  const [mapControlsEl, setMapControlsEl] = useState<HTMLDivElement | null>(null);
  // The Areas|Places + search combobox portals UP onto the (geo) tab row (the
  // layout exposes the slot via context) so it shares the row with the kind tabs
  // like the search box does on the other kinds — not on a separate row.
  const tabRowSlot = useGeoTabRowSlot();

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
            "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            level === t.level ? "bg-primary text-white" : "text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  if (view === "map") {
    return (
      <div className="section-stack">
        <div ref={setMapControlsEl} className="flex min-h-9 flex-wrap items-center gap-2" />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-[65vh] overflow-hidden rounded-2xl border border-border">
            <TurfDrawMap
              existing={existing}
              focusBounds={focusBounds}
              stateDigit={stateCode || undefined}
              selectedAreas={selectedAreas}
              onToggleArea={toggleArea}
              onPolygonsChange={setPolygons}
              clearToken={clearToken}
              controlsContainer={mapControlsEl}
              searchContainer={tabRowSlot}
              level={level}
              onLevelChange={(l) => setTab(l)}
              searchMode={searchMode}
              onSearchModeChange={(m) => setPlaces(m === "place")}
              query={q}
              onQueryChange={setQ}
              onViewportAreasChange={onViewportAreasChange}
            />
          </div>

          <div className="space-y-4">
            <SectionCard title={`${level.toUpperCase()} in view (${viewportAreas.length})`}>
              {viewTooZoomed ? (
                <p className="text-sm text-muted-foreground">
                  Zoom in to load {level.toUpperCase()} boundaries, or search above.
                </p>
              ) : viewportAreas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {level.toUpperCase()} areas in view — pan or zoom the map, or search above.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {viewportAreas.map((a) => {
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
              )}
            </SectionCard>

            <SectionCard
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
                      polygons.length ? ` + ${polygons.length} polygon${polygons.length === 1 ? "" : "s"}` : ""
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
            </SectionCard>

            {selectedAreas.length > 0 ? (
              <SectionCard title={`Selected areas (${selectedAreas.length})`}>
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
                        onClick={() => toggleArea(a)}
                        className="ml-auto text-muted-foreground hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
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
                            {/* Real link: the row onClick is mouse-only, this is the keyboard path. */}
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
