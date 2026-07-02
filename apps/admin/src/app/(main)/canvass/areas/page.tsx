"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin, Save, Scissors, Search, Trash2 } from "lucide-react";
import {
  createTurfFromAreas,
  searchAreas,
  type AreaHit,
  type AreaLevel,
  type TurfUniverse,
} from "@/lib/api/geo";
import { loadTurfUniverse } from "@/lib/api";
import type { ExistingTurf, SelectedArea } from "@/components/canvass/turf-draw-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Spinner } from "@uprise/ui";
import { SectionCard, WalkModeToggle, useLocalStorage, type WalkMode } from "@uprise/field";

// mapbox-gl + draw touch window: keep them out of SSR.
const TurfDrawMap = dynamic(
  () => import("@/components/canvass/turf-draw-map").then((m) => m.TurfDrawMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

const TABS: Array<{ level: AreaLevel; label: string }> = [
  { level: "sa3", label: "SA3" },
  { level: "sa2", label: "SA2" },
  { level: "sa1", label: "SA1" },
  { level: "mb", label: "Meshblock" },
];

const UNIVERSE_OPTIONS: Array<{ id: TurfUniverse; label: string; desc: string }> = [
  { id: "existing", label: "Existing contacts only", desc: "Bucket only people already in your data." },
  { id: "none", label: "Addresses without contacts", desc: "Cold doors with no prior record." },
  { id: "hybrid", label: "Hybrid — recommended", desc: "Existing contacts plus cold addresses." },
];

export default function AreasPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useLocalStorage<WalkMode>("uprise.areasView", "list");
  const [level, setLevel] = useState<AreaLevel>("sa2");
  const [universe, setUniverse] = useState<TurfUniverse>("hybrid");

  // ── List mode: search-driven (areas can't be enumerated) ──────────────────
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AreaHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // ── Map mode: turf cutting from a mixed area/polygon selection ─────────────
  const [name, setName] = useState("");
  const [polygons, setPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [clearToken, setClearToken] = useState(0);
  const [saving, setSaving] = useState(false);

  const trimmed = query.trim();

  // Type-ahead over the level's national set (same 250ms debounce as TurfDrawMap).
  useEffect(() => {
    if (mode !== "list") return;
    if (trimmed.length < 2) {
      setHits([]);
      setError("");
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchAreas(level, trimmed, 50);
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        setHits([]);
      } else {
        setError("");
        setHits(res.data);
      }
      setSearching(false);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [trimmed, level, mode]);

  // Cut a turf from a single area (list row) — same flow as the divisions page.
  const cutTurf = useCallback(
    async (hit: AreaHit) => {
      setBusy(hit.code);
      const res = await createTurfFromAreas({ name: hit.name, areas: [{ layer: level, code: hit.code }] });
      if (!res.ok) {
        setBusy("");
        showToast({ tone: "error", title: "Couldn't cut turf", description: res.error });
        return;
      }
      const cold = universe === "existing" ? null : await loadTurfUniverse(res.data.id, universe);
      setBusy("");
      const coldCount = cold?.ok ? cold.data.materialised : 0;
      showToast({
        tone: "success",
        title: `Turf cut from ${hit.name}`,
        description: coldCount > 0 ? `${coldCount.toLocaleString()} cold doors loaded.` : undefined,
      });
      router.push("/canvass");
    },
    [level, universe, router, showToast],
  );

  const toggleArea = useCallback((area: SelectedArea) => {
    setSelectedAreas((cur) => {
      const key = `${area.level}:${area.code}`;
      const exists = cur.some((a) => `${a.level}:${a.code}` === key);
      return exists ? cur.filter((a) => `${a.level}:${a.code}` !== key) : [...cur, area];
    });
  }, []);

  const hasSelection = selectedAreas.length > 0 || polygons.length > 0;

  // Cut a turf from the whole map selection (areas + drawn polygons), campaign-less.
  const handleSave = useCallback(async () => {
    if (!hasSelection) {
      showToast({ tone: "warning", title: "Nothing selected", description: "Click areas or draw a polygon first." });
      return;
    }
    const turfName = name.trim() || "New turf";
    setSaving(true);
    const created = await createTurfFromAreas({
      name: turfName,
      areas: selectedAreas.map((a) => ({ layer: a.level, code: a.code })),
      polygons,
    });
    if (!created.ok) {
      setSaving(false);
      showToast({ tone: "error", title: "Couldn't save turf", description: created.error });
      return;
    }
    const cold = universe === "existing" ? null : await loadTurfUniverse(created.data.id, universe);
    setSaving(false);
    setName("");
    setPolygons([]);
    setSelectedAreas([]);
    setClearToken((k) => k + 1);
    const coldCount = cold?.ok ? cold.data.materialised : 0;
    showToast({
      tone: "success",
      title: `Saved “${turfName}”`,
      description: coldCount > 0 ? `${coldCount.toLocaleString()} cold doors loaded.` : "Turf cut from your selection.",
    });
  }, [hasSelection, name, selectedAreas, polygons, universe, showToast]);

  const existing: ExistingTurf[] = [];

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Areas</h1>
        <div className="ml-auto">
          <WalkModeToggle value={mode} onChange={setMode} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        ASGS statistical areas (meshblock → SA3). Search a level to cut turf from a single area, or
        switch to the map to click and draw a boundary across many.
      </p>

      {mode === "list" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-border p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.level}
                  type="button"
                  onClick={() => {
                    setLevel(t.level);
                    setQuery("");
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
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${level.toUpperCase()} by name or code…`}
                className="h-9 pl-8"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cut with</span>
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value as TurfUniverse)}
                className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
                title="Which addresses land in the turf when you cut it"
              >
                <option value="hybrid">Existing + cold doors</option>
                <option value="none">Cold doors only</option>
                <option value="existing">Existing contacts only</option>
              </select>
            </div>
          </div>

          {error ? (
            <EmptyState
              title="Geo data not loaded"
              description={`${error}. Load the G-NAF + boundary datasets from Settings → Data.`}
            />
          ) : trimmed.length < 2 ? (
            <EmptyState
              title={`Search ${level.toUpperCase()} areas`}
              description="Type at least 2 characters to find an area by name or code, or switch to the map to browse spatially."
            />
          ) : (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="py-2 pr-4">Area</th>
                        <th className="py-2 pr-4">Code</th>
                        <th className="py-2 pr-4">Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searching
                        ? Array.from({ length: 6 }).map((_, index) => (
                            <tr key={`area-skeleton-${index}`} className="border-b border-border/60">
                              <td className="py-3 pr-4"><Skeleton className="h-4 w-44" /></td>
                              <td className="py-3 pr-4"><Skeleton className="h-4 w-24" /></td>
                              <td className="py-3 pr-4"><Skeleton className="h-4 w-16" /></td>
                            </tr>
                          ))
                        : hits.map((h) => (
                            <tr
                              key={`${h.level}:${h.code}`}
                              className="group cursor-pointer border-b border-border/60 hover:bg-primary-container/10"
                              onClick={() => router.push(`/canvass/areas/${level}/${encodeURIComponent(h.code)}`)}
                            >
                              <td className="py-3 pr-4 font-medium text-primary">{h.name}</td>
                              <td className="py-3 pr-4 tabular-nums text-muted-foreground">{h.code}</td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2 opacity-60 transition group-hover:opacity-100">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy === h.code}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void cutTurf(h);
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
                          <td colSpan={3} className="py-6 text-center text-muted-foreground">
                            No {level.toUpperCase()} areas match “{trimmed}”.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!searching && hits.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Showing up to 50 matches. Click an area for its boundary + coverage, or switch to the map for
                    multi-area turf.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-[65vh] overflow-hidden rounded-2xl border border-border">
            <TurfDrawMap
              existing={existing}
              selectedAreas={selectedAreas}
              onToggleArea={toggleArea}
              onPolygonsChange={setPolygons}
              clearToken={clearToken}
            />
          </div>

          <div className="space-y-4">
            <SectionCard title="Cut turf">
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
                {saving ? (<><Spinner className="mr-2" />Cutting…</>) : "Cut turf"}
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

            <SectionCard title="Universe">
              <div className="space-y-2">
                {UNIVERSE_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setUniverse(o.id)}
                    className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                      universe === o.id
                        ? "border-primary bg-primary/10 dark:bg-primary/20"
                        : "border-border bg-surface hover:bg-surface-variant"
                    }`}
                  >
                    <span className="block font-semibold text-foreground">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.desc}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
