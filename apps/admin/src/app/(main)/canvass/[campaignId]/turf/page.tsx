"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { AlertTriangle, Crosshair, MapPin, RefreshCw, Save } from "lucide-react";
import { CampaignPageHeader } from "@/components/canvass/campaign-page-header";
import {
  assignTurf,
  createTurf,
  deleteTurf,
  listTurfs,
  listVolunteers,
  loadTurfUniverse,
  rebucketTurf,
  rebuildWalkLists,
  updateTurf,
  type TurfSummary,
} from "@/lib/api";
import { Select, SelectItem } from "@/components/ui/select";
import { createTurfFromAreas, getAreaAddressCount, type AreaLevel } from "@/lib/api/geo";
import {
  getCampaignBoundary,
  getCampaignAreas,
  getCampaignBoundaryAddressCount,
  type DescribedSource,
} from "@/lib/api/campaigns";
import { Spinner } from "@uprise/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, KpiTile } from "@uprise/field";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { Pencil, Trash2 } from "lucide-react";
import type { AreaHoverInfo, ExistingTurf, SelectedArea } from "@/components/canvass/turf-draw-map";
import { SelectedAreasEstimate } from "@/components/canvass/selected-areas-estimate";
import { cn } from "@/lib/utils";
import {
  describeBuildings,
  describeEstimate,
  isStraightLine,
  turfWarning,
} from "@/lib/canvass/turf-estimate";

// mapbox-gl + draw touch window: keep them out of SSR.
const TurfDrawMap = dynamic(
  () => import("@/components/canvass/turf-draw-map").then((m) => m.TurfDrawMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

// Stable swatch palette for drawn turfs.
const SWATCHES = ["#2f5bd6", "#0e9488", "#b45309", "#7c3aed", "#dc2626", "#16a34a"];

type Universe = "existing" | "none" | "hybrid";

const UNIVERSE_OPTIONS: Array<{ id: Universe; label: string; desc: string }> = [
  { id: "existing", label: "Existing contacts only", desc: "Bucket only people already in your data." },
  { id: "none", label: "Addresses without contacts", desc: "Cold doors with no prior record." },
  { id: "hybrid", label: "Hybrid — recommended", desc: "Existing contacts plus cold addresses." },
];

// Human label for each boundary-source layer key — what a bounded campaign is cut from.
// Keyed on the API's DescribedSource.key (a division's `ste` arrives as `state`).
const SOURCE_LABEL: Record<string, string> = {
  ced: "Federal electorate",
  sed: "State electorate",
  sed_lower: "State lower house",
  sed_upper: "State upper house",
  lga: "Local government area",
  ward: "Ward",
  state: "State / territory",
  chamber_electorate: "Chamber electorate",
  mb: "Mesh block",
  sa1: "SA1",
  sa2: "SA2",
  sa3: "SA3",
  sa4: "SA4",
  polygon: "Drawn area",
};

/**
 * A turf name derived from what's selected, so organisers don't have to type one.
 * The picked areas already carry human names (the same ones shown in the panel), so
 * a deterministic join reads better and is faster/cheaper than an AI round-trip:
 * one area → its name; a few → "A + B"; many → "A + N more"; polygons-only → "Drawn
 * turf". Empty (nothing selected) never saves — the button is disabled.
 */
function autoTurfName(areas: SelectedArea[], polygons: GeoJSON.Polygon[]): string {
  const names = areas.map((a) => a.name).filter(Boolean);
  if (names.length === 0) return polygons.length > 1 ? `Drawn turf (${polygons.length} zones)` : "Drawn turf";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

export default function TurfCuttingPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const { showToast } = useToast();

  const { data, loading, error, noPermission, refetch } = useApi(
    `/canvass/turfs?campaignId=${campaignId}`,
    () => listTurfs(campaignId),
  );
  const turfs = data ?? [];

  // Headline coverage stats, folded from the loaded turf list: how much turf is claimed
  // (assigned to a canvasser) and how far the doors have been knocked.
  const stats = useMemo(() => {
    const total = turfs.length;
    const claimed = turfs.filter((t) => t.assignedTo).length;
    const totalStops = turfs.reduce((s, t) => s + (t.totalStops || 0), 0);
    const visitedStops = turfs.reduce((s, t) => s + (t.visitedStops || 0), 0);
    const doors = turfs.reduce((s, t) => s + (t.contactCount || 0), 0);
    return {
      total,
      claimed,
      unclaimed: total - claimed,
      claimedPct: total ? Math.round((claimed / total) * 100) : 0,
      doors,
      totalStops,
      visitedStops,
      knockedPct: totalStops ? Math.round((visitedStops / totalStops) * 100) : 0,
    };
  }, [turfs]);

  // The campaign's saved boundary (if any): the map fits to it and shades it grey,
  // so turf is cut against the campaign's extent. Cached — it changes only when
  // edited on the boundary page.
  const { data: boundaryData } = useApi(
    `/canvass/campaigns/${campaignId}/boundary`,
    () => getCampaignBoundary(campaignId),
    { ttlMs: 300_000 },
  );
  const campaignBoundary = (boundaryData?.boundary ?? null) as GeoJSON.Geometry | null;
  // What the boundary is built from (divisions/areas/drawn), resolved to human names —
  // listed in the boundary card so organisers see WHAT the campaign is bounded to.
  const describedSources: DescribedSource[] = boundaryData?.describedSources ?? [];

  // Bounded campaign: the area level to cut at (SA4→Meshblock), lifted here so we
  // fetch just the areas inside the boundary for the chosen level. Switching the
  // level pill re-fetches. No boundary → the map falls back to national tiles.
  const [level, setLevel] = useState<AreaLevel>("sa1");
  const { data: boundaryAreasData } = useApi(
    campaignBoundary ? `/canvass/campaigns/${campaignId}/areas/${level}` : null,
    () => getCampaignAreas(campaignId, level),
    { ttlMs: 300_000 },
  );
  const boundaryAreas = campaignBoundary ? (boundaryAreasData ?? null) : null;
  // Total addresses inside the boundary — a spatial count, so it's level-independent
  // (unlike summing the intersecting areas, which over-counts at coarse levels).
  const { data: boundaryAddr } = useApi(
    campaignBoundary ? `/canvass/campaigns/${campaignId}/boundary/address-count` : null,
    () => getCampaignBoundaryAddressCount(campaignId),
    { ttlMs: 300_000 },
  );
  const boundaryAddresses = boundaryAddr?.addresses ?? null;
  const [hovered, setHovered] = useState<AreaHoverInfo | null>(null);

  const [name, setName] = useState("");
  // Auto-name from the selection by default; uncheck to type one. `name` holds the
  // manual override (only used when autoName is off).
  const [autoName, setAutoName] = useState(true);
  const [universe, setUniverse] = useState<Universe>("hybrid");
  const [polygons, setPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  // Per-area address counts for the selected list. Shares the cache key with the
  // SelectedAreasEstimate below (same URL), so it's one request, not two.
  const selectedCodes = selectedAreas.map((a) => `${a.level}:${a.code}`).join(",");
  const { data: selectedAddr } = useApi(
    selectedAreas.length ? `/geo/area-address-count?codes=${selectedCodes}` : null,
    () => getAreaAddressCount(selectedAreas.map((a) => ({ level: a.level, code: a.code }))),
    { ttlMs: 60_000 },
  );
  const addressByArea = selectedAddr?.byArea ?? {};
  // Optional inline assignment: assign the new turf to a canvasser on save.
  const [assigneeId, setAssigneeId] = useState("");
  const { data: volunteersData } = useApi("/canvass/volunteers", listVolunteers, { ttlMs: 300_000 });
  const volunteers = volunteersData ?? [];
  const suggestedName = useMemo(() => autoTurfName(selectedAreas, polygons), [selectedAreas, polygons]);
  const [clearToken, setClearToken] = useState(0); // bump to wipe drawn polygons in place
  const [recenterToken, setRecenterToken] = useState(0); // bump to snap the map back to the boundary
  const [saving, setSaving] = useState(false);
  const [editingTurf, setEditingTurf] = useState<TurfSummary | null>(null);
  const [turfName, setTurfName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingTurf, setDeletingTurf] = useState<TurfSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  // Backfill: (re)build a walk list for every turf that has doors. Future lists are
  // already auto-built on turf-cut; this catches turfs cut before generation existed
  // or whose build silently failed. A turf with 0 doors gets no list — its doors must
  // be populated first (load the G-NAF universe / import geocoded contacts).
  const rebuildAll = useCallback(async () => {
    if (turfs.length === 0) return;
    setRebuilding(true);
    const res = await rebuildWalkLists(turfs.map((t) => t.id));
    setRebuilding(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't rebuild walk lists", description: res.error });
      return;
    }
    const results = res.data.results;
    const built = results.filter((r) => r.walkListId).length;
    const noDoors = results.filter((r) => !r.walkListId && !r.error).length;
    const stops = results.reduce((s, r) => s + (r.items ?? 0), 0);
    await refetch();
    showToast({
      tone: "success",
      title: `Rebuilt ${built} walk list${built === 1 ? "" : "s"}`,
      description:
        `${stops.toLocaleString()} stop${stops === 1 ? "" : "s"}` +
        (noDoors > 0
          ? ` · ${noDoors} turf${noDoors === 1 ? "" : "s"} have no doors yet — load contacts or the G-NAF universe first.`
          : "."),
    });
  }, [turfs, refetch, showToast]);

  const openRename = (t: TurfSummary) => {
    setEditingTurf(t);
    setTurfName(t.name);
  };

  const submitRename = useCallback(async () => {
    if (!editingTurf || !turfName.trim()) return;
    setRenaming(true);
    const res = await updateTurf(editingTurf.id, { name: turfName.trim() });
    setRenaming(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't rename turf", description: res.error });
      return;
    }
    setEditingTurf(null);
    await refetch();
    showToast({ tone: "success", title: "Turf renamed" });
  }, [editingTurf, turfName, refetch, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!deletingTurf) return;
    setDeleting(true);
    const res = await deleteTurf(deletingTurf.id);
    setDeleting(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete turf", description: res.error });
      return;
    }
    setDeletingTurf(null);
    await refetch();
    showToast({ tone: "success", title: "Turf deleted" });
  }, [deletingTurf, refetch, showToast]);

  const existing: ExistingTurf[] = turfs.map((t, i) => ({
    id: t.id,
    name: t.name,
    geometry: t.geometry as GeoJSON.Geometry | null,
    color: SWATCHES[i % SWATCHES.length],
  }));

  const toggleArea = useCallback((area: SelectedArea) => {
    setSelectedAreas((cur) => {
      const key = `${area.level}:${area.code}`;
      const exists = cur.some((a) => `${a.level}:${a.code}` === key);
      return exists ? cur.filter((a) => `${a.level}:${a.code}` !== key) : [...cur, area];
    });
  }, []);

  const hasSelection = selectedAreas.length > 0 || polygons.length > 0;

  const handleSave = useCallback(async () => {
    if (!hasSelection) {
      showToast({
        tone: "warning",
        title: "Nothing selected",
        description: "Draw a polygon or click areas to claim them.",
      });
      return;
    }
    const turfName = (autoName ? suggestedName : name.trim() || suggestedName) || `Turf ${turfs.length + 1}`;
    setSaving(true);
    // Single free-drawn polygon, no areas → the simple createTurf path (works
    // with no geo data loaded). Otherwise union the whole selection server-side.
    const created =
      selectedAreas.length === 0 && polygons.length === 1
        ? await createTurf(turfName, polygons[0], campaignId)
        : await createTurfFromAreas({
            name: turfName,
            campaignId,
            areas: selectedAreas.map((a) => ({ layer: a.level, code: a.code })),
            polygons,
          });
    if (!created.ok) {
      setSaving(false);
      showToast({ tone: "error", title: "Couldn't save turf", description: created.error });
      return;
    }
    const turfId = (created.data as { id: string }).id;
    const bucketed = await rebucketTurf(turfId);
    // Cold doors: pull "addresses without contacts" inside the boundary when the
    // chosen universe wants them. Degrades to 0 when no geo data is loaded.
    const cold =
      universe === "existing" ? null : await loadTurfUniverse(turfId, universe);
    // Optional inline assignment — assign the fresh turf to a canvasser now instead
    // of a second trip through the turf list. Best-effort: a save that succeeded
    // isn't rolled back if the assignment fails; we just warn.
    const assignee = assigneeId ? volunteers.find((v) => v.id === assigneeId) : null;
    const assigned = assigneeId ? await assignTurf(turfId, assigneeId) : null;
    setSaving(false);
    setName("");
    setPolygons([]);
    setSelectedAreas([]);
    setAssigneeId("");
    setClearToken((k) => k + 1);
    await refetch();
    if (assigned && !assigned.ok) {
      showToast({ tone: "warning", title: `Saved “${turfName}”, but couldn't assign it`, description: assigned.error });
      return;
    }
    const existingCount = bucketed.ok ? bucketed.data.total : 0;
    const coldCount = cold?.ok ? cold.data.materialised : 0;
    const doorsLine = bucketed.ok
      ? coldCount > 0
        ? `${existingCount} existing + ${coldCount} cold door${coldCount === 1 ? "" : "s"} loaded.`
        : `${existingCount} door${existingCount === 1 ? "" : "s"} in this turf.`
      : "Turf saved; re-bucket the doors from the list.";
    showToast({
      tone: "success",
      title: assignee ? `Saved “${turfName}” · assigned to ${assignee.displayName}` : `Saved “${turfName}”`,
      description: doorsLine,
    });
  }, [hasSelection, selectedAreas, polygons, name, autoName, suggestedName, assigneeId, volunteers, universe, turfs.length, campaignId, refetch, showToast]);

  return (
    <div className="page-stack">
      {/* Cutting turf targets one campaign — no cross-campaign aggregate makes sense here. */}
      <CampaignPageHeader title="Cut turf" icon={MapPin} allowAllCampaigns={false} />

      {/* Coverage at a glance — claimed vs unclaimed turf and knock progress. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Turf cut"
          value={loading ? "—" : stats.total}
          delta={loading ? undefined : { value: `${stats.doors.toLocaleString()} doors` }}
          icon={<MapPin className="h-4 w-4" />}
        />
        <KpiTile
          label="Claimed"
          value={loading ? "—" : `${stats.claimedPct}%`}
          delta={
            loading
              ? undefined
              : { value: `${stats.claimed} of ${stats.total} assigned`, direction: stats.claimedPct >= 100 ? "up" : "flat" }
          }
        />
        <KpiTile
          label="Unclaimed"
          value={loading ? "—" : stats.unclaimed}
          delta={
            loading
              ? undefined
              : stats.unclaimed > 0
                ? { value: "need a canvasser", direction: "flat" }
                : { value: "all assigned", direction: "up" }
          }
        />
        <KpiTile
          label="Doors knocked"
          value={loading ? "—" : `${stats.knockedPct}%`}
          delta={
            loading
              ? undefined
              : { value: `${stats.visitedStops.toLocaleString()} of ${stats.totalStops.toLocaleString()} stops` }
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[60vh] overflow-hidden rounded-2xl border border-border">
          <TurfDrawMap
            existing={existing}
            campaignBoundary={campaignBoundary}
            boundaryAreas={boundaryAreas}
            onAreaHover={setHovered}
            level={level}
            onLevelChange={setLevel}
            selectedAreas={selectedAreas}
            onToggleArea={toggleArea}
            onPolygonsChange={setPolygons}
            clearToken={clearToken}
            recenterToken={recenterToken}
          />
        </div>

        <div className="space-y-4">
          {/* Boundary context: only shown for a bounded campaign. Says what's inside
              at the active level and offers a snap-back-to-boundary recentre. */}
          {campaignBoundary ? (
            <SectionCard
              title="Campaign boundary"
              description="Turf here is cut against this campaign's saved extent (shaded on the map)."
            >
              {/* What the campaign is bounded to — its source divisions/areas by name. */}
              {describedSources.length > 0 ? (
                <ul className="mb-3 space-y-1.5">
                  {describedSources.map((s, i) => (
                    <li key={`${s.key}:${s.kind === "polygon" ? i : s.code}`} className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {SOURCE_LABEL[s.key] ?? s.key}
                      </span>
                      <span className="truncate font-medium text-foreground">{s.name ?? "Drawn area"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {boundaryAreas
                  ? `${boundaryAreas.features.length.toLocaleString()} ${level.toUpperCase()} area${
                      boundaryAreas.features.length === 1 ? "" : "s"
                    } inside — click to claim, or draw within the shaded zone.`
                  : `Loading ${level.toUpperCase()} areas inside the boundary…`}
              </p>
              {boundaryAddresses != null ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">
                    {boundaryAddresses.toLocaleString()}
                  </span>{" "}
                  address{boundaryAddresses === 1 ? "" : "es"} inside the boundary.
                </p>
              ) : null}
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => setRecenterToken((k) => k + 1)}
              >
                <Crosshair className="mr-1.5 h-4 w-4" />
                Recentre on boundary
              </Button>
            </SectionCard>
          ) : null}

          <SectionCard title="New turf">
            {/* Auto-name from the selection so organisers don't have to type one;
                uncheck to name it manually. */}
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoName}
                onChange={(e) => setAutoName(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className="text-muted-foreground">Auto-name from selection</span>
            </label>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Name
            </label>
            <Input
              value={autoName ? suggestedName : name}
              onChange={(e) => setName(e.target.value)}
              disabled={autoName}
              placeholder={suggestedName || `Turf ${turfs.length + 1}`}
            />

            {/* Assign the turf to a canvasser inline, so creation + hand-off is one
                step. Optional — defaults to unassigned. */}
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Assign to
            </label>
            <Select
              id="turf-assignee"
              value={assigneeId || "none"}
              onValueChange={(v) => setAssigneeId(v === "none" ? "" : v)}
            >
              <SelectItem value="none">Unassigned</SelectItem>
              {volunteers.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.displayName}
                  {v.email ? ` · ${v.email}` : ""}
                </SelectItem>
              ))}
            </Select>

            <p className="mt-2 text-xs text-muted-foreground">
              {hasSelection
                ? `${selectedAreas.length} area${selectedAreas.length === 1 ? "" : "s"}${
                    polygons.length ? ` + ${polygons.length} polygon${polygons.length === 1 ? "" : "s"}` : ""
                  } selected`
                : "Click areas or draw a polygon to define the boundary."}
            </p>
            <Button className="mt-3 w-full" onClick={handleSave} disabled={saving || !hasSelection}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? (<><Spinner className="mr-2" />Saving…</>) : "Save & re-bucket"}
            </Button>
          </SectionCard>

          {hovered ? (
            <SectionCard title="Area">
              <p className="text-sm font-semibold text-foreground">{hovered.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase">
                  {hovered.level}
                </span>
                <span className="tabular-nums">{hovered.code}</span>
              </p>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                {Math.round(hovered.coverage * 100)}% within campaign boundary
                {hovered.coverage < 0.5 ? " — edge area" : ""}
              </p>
            </SectionCard>
          ) : null}

          {selectedAreas.length > 0 ? (
            <SectionCard title={`Selected areas (${selectedAreas.length})`}>
              <ul className="space-y-1.5">
                {selectedAreas.map((a) => {
                  const addr = addressByArea[`${a.level}:${a.code}`];
                  return (
                    <li key={`${a.level}:${a.code}`} className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {a.level}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{a.name}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {addr != null ? `${addr.toLocaleString()} addr` : "…"}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => toggleArea(a)}
                        className="shrink-0 text-muted-foreground hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <SelectedAreasEstimate areas={selectedAreas.map((a) => ({ level: a.level, code: a.code }))} />
            </SectionCard>
          ) : null}

          <SectionCard title="Who to include">
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

      {/* Turfs — full-width below the map, styled like the geo areas list. */}
      <SectionCard
        title={`Turfs (${turfs.length})`}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={rebuilding || turfs.length === 0}
            onClick={rebuildAll}
            title="Backfill a walk list for every turf that has doors"
          >
            {rebuilding ? (
              <>
                <Spinner className="mr-2" />
                Rebuilding…
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Rebuild walk lists
              </>
            )}
          </Button>
        }
      >
            <StateRegion
              loading={loading}
              error={error}
              noPermission={noPermission}
              onRetry={() => void refetch()}
              empty={turfs.length === 0}
              emptyTitle="No turf cut yet"
              emptyDescription="Draw a polygon or claim areas above to cut your first turf."
              skeleton={<Skeleton className="h-20 w-full" />}
            >
              <ul className="space-y-2">
                {turfs.map((t, i) => {
                  const warning = turfWarning(t.estimate);
                  return (
                    <li key={t.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: SWATCHES[i % SWATCHES.length] }}
                        />
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.name}
                        </span>
                        <span className="ml-auto tabular-nums text-muted-foreground">
                          {t.contactCount} doors
                        </span>
                        <button
                          type="button"
                          aria-label="Rename turf"
                          onClick={() => openRename(t)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete turf"
                          onClick={() => setDeletingTurf(t)}
                          className="text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* The estimate, once the turf has been priced. A straight-line walk
                          is always optimistic, so it is labelled rather than rounded into
                          looking like a measurement. */}
                      {t.estimate && t.estimate.doors > 0 ? (
                        <div className="ml-5 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="tabular-nums">{describeEstimate(t.estimate)}</span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{describeBuildings(t.estimate)}</span>
                          {isStraightLine(t.estimate) ? (
                            <span
                              title="The walk was measured in straight lines, not along footpaths — the real turf is slower."
                              className="rounded border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide"
                            >
                              straight-line estimate
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {warning ? (
                        <p
                          className={cn(
                            "ml-5 mt-1 flex items-center gap-1 text-xs",
                            warning.level === "warn" ? "font-medium text-warning" : "text-muted-foreground",
                          )}
                        >
                          {warning.level === "warn" ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}
                          {warning.text}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </StateRegion>
          </SectionCard>

      <FormDialog
        open={!!editingTurf}
        title="Rename turf"
        onClose={() => setEditingTurf(null)}
        onSubmit={submitRename}
        busy={renaming}
        submitDisabled={!turfName.trim()}
      >
        <Field label="Turf name" htmlFor="turf-name" required>
          <Input id="turf-name" value={turfName} onChange={(e) => setTurfName(e.target.value)} autoFocus />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={!!deletingTurf}
        title="Delete turf?"
        description="Contacts are released, assignments removed."
        confirmLabel="Delete turf"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingTurf(null)}
        busy={deleting}
      />
    </div>
  );
}
