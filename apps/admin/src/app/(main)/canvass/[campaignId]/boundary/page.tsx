"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { Spinner } from "@uprise/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StateRegion } from "@/components/shell/state-region";
import { SectionCard } from "@uprise/field";
import { useToast } from "@/components/ui/toast";
import { listDivisions, type AreaLevel, type Division, type DivisionType, type TurfDivisionType } from "@/lib/api/geo";
import { getCampaignBoundary, setCampaignBoundary, type BoundarySource } from "@/lib/api/campaigns";
import type { ExistingTurf, SelectedArea } from "@/components/canvass/turf-draw-map";

// mapbox-gl + draw touch window: keep them out of SSR.
const TurfDrawMap = dynamic(
  () => import("@/components/canvass/turf-draw-map").then((m) => m.TurfDrawMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

/** A saved boundary part may reference a whole state ("ste") or a state-wide chamber, which
 *  the picker below cannot create but the list must still render and remove. */
type DivPick = { type: TurfDivisionType; code: string; name: string };

/**
 * Campaign boundary editor. The boundary is a union of divisions (SED/CED/LGA),
 * ASGS areas (mb/sa1-3) and free-drawn polygons — turf-cutting for the campaign is
 * clipped to it. Reuses the turf-draw map for areas/draw + a division picker.
 */
export default function CampaignBoundaryPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = params.campaignId;
  const { showToast } = useToast();

  const [selectedAreas, setSelectedAreas] = useState<SelectedArea[]>([]);
  // Loaded area sources (layer+code only — no geometry, so kept separate from the map's
  // SelectedArea; they persist through save unless removed).
  const [areaSources, setAreaSources] = useState<Array<{ layer: AreaLevel; code: string }>>([]);
  const [polygons, setPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [divisions, setDivisions] = useState<DivPick[]>([]);
  const [clearToken, setClearToken] = useState(0);
  const [boundary, setBoundary] = useState<GeoJSON.Geometry | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [noPermission, setNoPermission] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Division picker
  const [divType, setDivType] = useState<DivisionType>("sed_lower");
  const [divList, setDivList] = useState<Division[]>([]);
  const [divQuery, setDivQuery] = useState("");

  // Load the existing boundary + its sources.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError("");
    setNoPermission(false);
    void getCampaignBoundary(campaignId).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setBoundary((res.data.boundary ?? null) as GeoJSON.Geometry | null);
        const src = (res.data.sources ?? []) as BoundarySource[];
        setAreaSources(
          src.filter((s): s is Extract<BoundarySource, { kind: "area" }> => s.kind === "area").map((s) => ({ layer: s.layer, code: s.code })),
        );
        setPolygons(
          src.filter((s): s is Extract<BoundarySource, { kind: "polygon" }> => s.kind === "polygon").map((s) => s.geometry as GeoJSON.Polygon),
        );
        setDivisions(
          src.filter((s): s is Extract<BoundarySource, { kind: "division" }> => s.kind === "division").map((s) => ({ type: s.type, code: s.code, name: s.code })),
        );
      } else if (res.status === 403) {
        setNoPermission(true);
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [campaignId, reloadToken]);

  // Divisions of the chosen type for the picker (filtered client-side).
  useEffect(() => {
    let alive = true;
    void listDivisions(divType).then((res) => {
      if (alive && res.ok) setDivList(res.data);
    });
    return () => {
      alive = false;
    };
  }, [divType]);

  const filteredDivs = useMemo(() => {
    const q = divQuery.trim().toLowerCase();
    return (q ? divList.filter((d) => d.name.toLowerCase().includes(q) || d.code.includes(q)) : divList).slice(0, 40);
  }, [divList, divQuery]);

  const toggleArea = useCallback((area: SelectedArea) => {
    setSelectedAreas((cur) => {
      const key = `${area.level}:${area.code}`;
      return cur.some((a) => `${a.level}:${a.code}` === key)
        ? cur.filter((a) => `${a.level}:${a.code}` !== key)
        : [...cur, area];
    });
  }, []);

  const addDivision = (d: Division) =>
    setDivisions((cur) =>
      cur.some((x) => x.type === divType && x.code === d.code) ? cur : [...cur, { type: divType, code: d.code, name: d.name }],
    );
  const removeDivision = (d: DivPick) =>
    setDivisions((cur) => cur.filter((x) => !(x.type === d.type && x.code === d.code)));

  const sources: BoundarySource[] = useMemo(
    () => [
      ...divisions.map((d) => ({ kind: "division" as const, type: d.type, code: d.code })),
      ...areaSources.map((a) => ({ kind: "area" as const, layer: a.layer, code: a.code })),
      ...selectedAreas.map((a) => ({ kind: "area" as const, layer: a.level, code: a.code })),
      ...polygons.map((geometry) => ({ kind: "polygon" as const, geometry })),
    ],
    [divisions, areaSources, selectedAreas, polygons],
  );

  const save = useCallback(async () => {
    setSaving(true);
    const res = await setCampaignBoundary(campaignId, sources);
    setSaving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't save boundary", description: res.error });
      return;
    }
    setBoundary((res.data.boundary ?? null) as GeoJSON.Geometry | null);
    showToast({ tone: "success", title: sources.length ? "Boundary saved" : "Boundary cleared" });
  }, [campaignId, sources, showToast]);

  const existing: ExistingTurf[] = boundary
    ? [{ id: "boundary", name: "Campaign boundary", geometry: boundary, color: "#465fff" }]
    : [];

  if (noPermission || loadError) {
    return (
      <div className="page-stack">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/canvass">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Canvass
            </Link>
          </Button>
          <h1 className="text-2xl font-extrabold">Campaign boundary</h1>
        </div>
        <StateRegion
          error={loadError}
          noPermission={noPermission}
          onRetry={() => setReloadToken((t) => t + 1)}
          errorTitle="Can't load boundary"
        >
          {null}
        </StateRegion>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/canvass">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Canvass
          </Link>
        </Button>
        <h1 className="text-2xl font-extrabold">Campaign boundary</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
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
          <SectionCard title="Add electorate / LGA">
            <div className="flex gap-2">
              <Select value={divType} onValueChange={(v) => setDivType(v as DivisionType)}>
                <SelectItem value="ced">Federal – House of Reps</SelectItem>
                <SelectItem value="sed_lower">State – lower house</SelectItem>
                <SelectItem value="sed_upper">State – upper house</SelectItem>
                <SelectItem value="lga">LGA</SelectItem>
                <SelectItem value="ward">Ward</SelectItem>
              </Select>
              <Input placeholder="Search…" value={divQuery} onChange={(e) => setDivQuery(e.target.value)} />
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {filteredDivs.map((d) => (
                <li key={d.code}>
                  <button
                    type="button"
                    onClick={() => addDivision(d)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-variant"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium text-foreground">{d.name}</span>
                    {d.state ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{d.state}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>

          {(divisions.length > 0 || areaSources.length > 0 || selectedAreas.length > 0 || polygons.length > 0) ? (
            <SectionCard title="Boundary parts">
              <ul className="space-y-1.5">
                {divisions.map((d) => (
                  <li key={`${d.type}:${d.code}`} className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {d.type}
                    </span>
                    <span className="truncate font-medium text-foreground">{d.name}</span>
                    <button type="button" aria-label="Remove" onClick={() => removeDivision(d)} className="ml-auto text-muted-foreground hover:text-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {areaSources.map((a) => (
                  <li key={`src:${a.layer}:${a.code}`} className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {a.layer}
                    </span>
                    <span className="truncate font-medium text-foreground">{a.code}</span>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => setAreaSources((cur) => cur.filter((x) => !(x.layer === a.layer && x.code === a.code)))}
                      className="ml-auto text-muted-foreground hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {selectedAreas.map((a) => (
                  <li key={`${a.level}:${a.code}`} className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      {a.level}
                    </span>
                    <span className="truncate font-medium text-foreground">{a.name}</span>
                    <button type="button" aria-label="Remove" onClick={() => toggleArea(a)} className="ml-auto text-muted-foreground hover:text-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
                {polygons.length > 0 ? (
                  <li className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-surface-variant px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                      drawn
                    </span>
                    <span className="font-medium text-foreground">
                      {polygons.length} polygon{polygons.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      aria-label="Clear drawn"
                      onClick={() => {
                        setPolygons([]);
                        setClearToken((k) => k + 1);
                      }}
                      className="ml-auto text-muted-foreground hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ) : null}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard title="Save">
            <p className="mb-3 text-xs text-muted-foreground">
              Pick electorates/LGAs above, click ASGS areas or draw on the map, then save. Turf-cutting for
              this campaign will be clipped to the union.
            </p>
            <Button className="w-full" onClick={save} disabled={saving || loading}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving ? (
                <>
                  <Spinner className="mr-2" />
                  Saving…
                </>
              ) : sources.length ? (
                "Save boundary"
              ) : (
                "Clear boundary"
              )}
            </Button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
