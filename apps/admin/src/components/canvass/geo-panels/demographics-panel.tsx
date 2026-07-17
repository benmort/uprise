"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getChoropleth,
  getRegionProfile,
  listIndicators,
  type AbsIndicator,
  type AbsLevel,
  type AbsRegionValue,
} from "@/lib/api/demographics";
import { formatIndicator } from "@/lib/canvass/demographics-fill";
import { useApi } from "@/lib/use-api";
import { writeGeoParam } from "@/components/canvass/use-geo-explorer-url-state";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { type WalkMode } from "@uprise/field";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Largest area (SA4) on the left → smallest (meshblock) on the right.
const LEVELS: Array<{ key: AbsLevel; label: string }> = [
  { key: "sa4", label: "SA4" },
  { key: "sa3", label: "SA3" },
  { key: "sa2", label: "SA2" },
  { key: "sa1", label: "SA1" },
  { key: "mb", label: "Mesh" },
];

const CATEGORY_LABEL: Record<string, string> = {
  demographic: "Demographic",
  socioeconomic: "Socioeconomic",
  education: "Education",
  cultural: "Cultural",
  housing: "Housing",
  lifestyle: "Lifestyle (derived)",
};

function fmtValue(v: AbsRegionValue): string {
  return v.value === null ? "—" : formatIndicator(v.value, v.unit);
}

/** SectionCard's shell with a collapsible, toggling header — the Indicator picker
 *  and the clicked-region profile share the sidebar one-at-a-time. */
function CollapsibleCard({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-[0.04em] text-foreground">{title}</h2>
          {description ? <p className="mt-1 truncate text-[13.5px] text-muted-foreground">{description}</p> : null}
        </div>
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="border-t border-[hsl(var(--muted))] px-5 py-4">{children}</div> : null}
    </section>
  );
}

/**
 * Demographics panel for the unified geo surface. The map (owned by GeoSurface) shades the chosen
 * ASGS level by the chosen indicator; this is the picker + read-out beside it. The indicator rides
 * `?ind=`, the level `?tab=`, the clicked region `?code=` — the durable URL state the surface reads
 * to shade + frame the map. Map view is a compact indicator picker + clicked-region profile; list
 * view is the same picker over the full profile table.
 */
export function DemographicsPanel({ view }: { view: WalkMode }) {
  const searchParams = useSearchParams();
  const rawLevel = searchParams.get("type") ?? searchParams.get("tab");
  const level = (["mb", "sa1", "sa2", "sa3", "sa4"].includes(rawLevel ?? "") ? rawLevel : "sa2") as AbsLevel;
  const ind = searchParams.get("ind") ?? "";
  const code = searchParams.get("code") ?? "";

  // Accordion: the Indicator picker and the region profile toggle between each
  // other — clicking a region opens the profile; reopening Indicator collapses it.
  const [openSection, setOpenSection] = useState<"indicator" | "profile">(code ? "profile" : "indicator");
  useEffect(() => {
    setOpenSection(code ? "profile" : "indicator");
  }, [code]);

  const indicators = useApi("/demographics/indicators", () => listIndicators(), { ttlMs: 600_000 });
  const all = useMemo(() => indicators.data ?? [], [indicators.data]);
  // Only indicators published at the chosen level are selectable there.
  const available = useMemo(() => all.filter((i) => i.levels.includes(level)), [all, level]);

  // Seed a default indicator (first available) so the map paints something on first open.
  useEffect(() => {
    if (available.length === 0) return;
    if (!ind || !available.some((i) => i.key === ind)) {
      writeGeoParam("ind", available[0].key);
    }
  }, [available, ind]);

  // The scale read-out (region count) mirrors the map's fetch, deduped by key.
  const choropleth = useApi(
    ind ? `/demographics/choropleth?level=${level}&indicator=${ind}` : null,
    () => getChoropleth(level, ind),
    { ttlMs: 300_000 },
  );

  const byCategory = useMemo(() => {
    const groups = new Map<string, AbsIndicator[]>();
    for (const i of available) (groups.get(i.category) ?? groups.set(i.category, []).get(i.category)!).push(i);
    return [...groups.entries()];
  }, [available]);

  return (
    <div className="section-stack">
      {/* Level selector */}
      <div className="flex rounded-xl border border-border p-0.5">
        {LEVELS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => writeGeoParam("type", l.key === "sa2" ? null : l.key)}
            aria-pressed={level === l.key}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition",
              level === l.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <StateRegion
        loading={indicators.loading}
        error={indicators.error}
        noPermission={indicators.noPermission}
        onRetry={() => void indicators.refetch()}
        empty={!indicators.loading && available.length === 0}
        emptyTitle="No indicators at this level"
        emptyDescription="Run `pnpm --filter api abs:load` to load ABS Census + SEIFA data, or pick another level."
        skeleton={<Skeleton className="h-72 w-full" />}
      >
        {/* Indicator picker, grouped by category */}
        <CollapsibleCard
          title="Indicator"
          description={choropleth.data ? `${choropleth.data.regions.toLocaleString()} regions shaded` : undefined}
          open={openSection === "indicator"}
          onToggle={() => setOpenSection(openSection === "indicator" ? "profile" : "indicator")}
        >
          <div className="max-h-[40vh] space-y-3 overflow-y-auto">
            {byCategory.map(([category, items]) => (
              <div key={category}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[category] ?? category}
                </div>
                <div className="space-y-0.5">
                  {items.map((i) => (
                    <button
                      key={i.key}
                      type="button"
                      onClick={() => writeGeoParam("ind", i.key)}
                      aria-pressed={ind === i.key}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                        ind === i.key ? "bg-primary/10 text-foreground" : "hover:bg-surface-variant",
                      )}
                      title={i.description ?? undefined}
                    >
                      <span className="min-w-0 truncate font-medium text-foreground">{i.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleCard>

        {/* Clicked-region profile */}
        {code ? (
          <RegionProfile
            level={level}
            code={code}
            activeIndicator={ind}
            open={openSection === "profile"}
            onToggle={() => setOpenSection(openSection === "profile" ? "indicator" : "profile")}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Click a region on the map for its full ABS profile.
          </p>
        )}
      </StateRegion>
    </div>
  );
}

/** The full ABS profile for one region, grouped by category — the click read-out. */
function RegionProfile({
  level,
  code,
  activeIndicator,
  open,
  onToggle,
}: {
  level: AbsLevel;
  code: string;
  activeIndicator: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { data, loading, error } = useApi(
    `/demographics/regions/${level}/${code}`,
    () => getRegionProfile(level, code),
    { ttlMs: 300_000 },
  );

  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error || !data) return null;

  const groups = new Map<string, AbsRegionValue[]>();
  for (const v of data.values) (groups.get(v.category) ?? groups.set(v.category, []).get(v.category)!).push(v);

  return (
    <CollapsibleCard title={data.name} description={`${level.toUpperCase()} ${data.code}`} open={open} onToggle={onToggle}>
      {data.values.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ABS data for this region.</p>
      ) : (
        <div className="space-y-3">
          {[...groups.entries()].map(([category, items]) => (
            <div key={category}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABEL[category] ?? category}
              </div>
              <dl className="divide-y divide-border rounded-lg border border-border">
                {items.map((v) => (
                  <div
                    key={v.key}
                    className={cn(
                      "flex items-baseline justify-between gap-3 px-3 py-1.5 text-sm",
                      v.key === activeIndicator && "bg-primary/5",
                    )}
                  >
                    <dt className="min-w-0 truncate text-muted-foreground">{v.name}</dt>
                    <dd className="shrink-0 font-semibold tabular-nums text-foreground">{fmtValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
