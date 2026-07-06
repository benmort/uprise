"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Save } from "lucide-react";
import {
  createTurf,
  deleteTurf,
  listTurfs,
  loadTurfUniverse,
  rebucketTurf,
  updateTurf,
  type TurfSummary,
} from "@/lib/api";
import { createTurfFromAreas } from "@/lib/api/geo";
import { Spinner } from "@uprise/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@uprise/field";
import { useApi } from "@/lib/use-api";
import { StateRegion } from "@/components/shell/state-region";
import { useToast } from "@/components/ui/toast";
import { Pencil, Trash2 } from "lucide-react";
import type { ExistingTurf, SelectedArea } from "@/components/canvass/turf-draw-map";

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

export default function TurfCuttingPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const { showToast } = useToast();

  const { data, loading, error, noPermission, refetch } = useApi(
    `/canvass/turfs?campaignId=${campaignId}`,
    () => listTurfs(campaignId),
  );
  const turfs = data ?? [];
  const [name, setName] = useState("");
  const [universe, setUniverse] = useState<Universe>("hybrid");
  const [polygons, setPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  const [clearToken, setClearToken] = useState(0); // bump to wipe drawn polygons in place
  const [saving, setSaving] = useState(false);
  const [editingTurf, setEditingTurf] = useState<TurfSummary | null>(null);
  const [turfName, setTurfName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deletingTurf, setDeletingTurf] = useState<TurfSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const turfName = name.trim() || `Turf ${turfs.length + 1}`;
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
    setSaving(false);
    setName("");
    setPolygons([]);
    setSelectedAreas([]);
    setClearToken((k) => k + 1);
    await refetch();
    const existingCount = bucketed.ok ? bucketed.data.total : 0;
    const coldCount = cold?.ok ? cold.data.materialised : 0;
    showToast({
      tone: "success",
      title: `Saved “${turfName}”`,
      description: bucketed.ok
        ? coldCount > 0
          ? `${existingCount} existing + ${coldCount} cold door${coldCount === 1 ? "" : "s"} loaded.`
          : `${existingCount} door${existingCount === 1 ? "" : "s"} in this turf.`
        : "Turf saved; re-bucket the doors from the list.",
    });
  }, [hasSelection, selectedAreas, polygons, name, universe, turfs.length, campaignId, refetch, showToast]);

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Cut turf</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[60vh] overflow-hidden rounded-2xl border border-border">
          <TurfDrawMap
            existing={existing}
            selectedAreas={selectedAreas}
            onToggleArea={toggleArea}
            onPolygonsChange={setPolygons}
            clearToken={clearToken}
          />
        </div>

        <div className="space-y-4">
          <SectionCard title="New turf">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Turf ${turfs.length + 1}`}
            />
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

          <SectionCard title={`Turfs (${turfs.length})`}>
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
                {turfs.map((t, i) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
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
                  </li>
                ))}
              </ul>
            </StateRegion>
          </SectionCard>
        </div>
      </div>

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
