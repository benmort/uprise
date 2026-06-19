"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, Save } from "lucide-react";
import {
  createTurf,
  listTurfs,
  loadTurfUniverse,
  rebucketTurf,
  updateTurf,
  type TurfSummary,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormDialog } from "@/components/ui/form-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/canvass/section-card";
import { useToast } from "@/components/ui/toast";
import { Pencil } from "lucide-react";
import type { ExistingTurf } from "@/components/canvass/turf-draw-map";

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

  const [turfs, setTurfs] = useState<TurfSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [universe, setUniverse] = useState<Universe>("hybrid");
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTurf, setEditingTurf] = useState<TurfSummary | null>(null);
  const [turfName, setTurfName] = useState("");
  const [renaming, setRenaming] = useState(false);

  const reload = useCallback(async () => {
    const res = await listTurfs(campaignId);
    if (res.ok) setTurfs(res.data);
    setLoading(false);
  }, [campaignId]);

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
    await reload();
    showToast({ tone: "success", title: "Turf renamed" });
  }, [editingTurf, turfName, reload, showToast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const existing: ExistingTurf[] = turfs.map((t, i) => ({
    id: t.id,
    name: t.name,
    geometry: t.geometry as GeoJSON.Geometry | null,
    color: SWATCHES[i % SWATCHES.length],
  }));

  const handleSave = useCallback(async () => {
    if (!polygon) {
      showToast({ tone: "warning", title: "Draw a turf first", description: "Use the polygon tool on the map." });
      return;
    }
    const turfName = name.trim() || `Turf ${turfs.length + 1}`;
    setSaving(true);
    const created = await createTurf(turfName, polygon, campaignId);
    if (!created.ok) {
      setSaving(false);
      showToast({ tone: "error", title: "Couldn't save turf", description: created.error });
      return;
    }
    const turfId = (created.data as { id: string }).id;
    const bucketed = await rebucketTurf(turfId);
    // Cold doors: pull "addresses without contacts" inside the polygon when the
    // chosen universe wants them. Degrades to 0 when no geo data is loaded.
    const cold =
      universe === "existing" ? null : await loadTurfUniverse(turfId, universe);
    setSaving(false);
    setName("");
    setPolygon(null);
    await reload();
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
  }, [polygon, name, universe, turfs.length, campaignId, reload, showToast]);

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
          <TurfDrawMap existing={existing} onPolygonChange={setPolygon} />
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
              {polygon ? "Polygon drawn ✓" : "Draw a polygon on the map to define the boundary."}
            </p>
            <Button className="mt-3 w-full" onClick={handleSave} disabled={saving || !polygon}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? "Saving…" : "Save & re-bucket"}
            </Button>
          </SectionCard>

          <SectionCard title="Universe">
            <div className="space-y-2">
              {UNIVERSE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setUniverse(o.id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                    universe === o.id
                      ? "border-primary bg-[#eef2fd]"
                      : "border-border bg-white hover:bg-surface-variant"
                  }`}
                >
                  <span className="block font-semibold text-foreground">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.desc}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={`Turfs (${turfs.length})`}>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : turfs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No turf cut yet.</p>
            ) : (
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
                  </li>
                ))}
              </ul>
            )}
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
    </div>
  );
}
