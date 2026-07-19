"use client";

import { useMemo } from "react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/use-api";
import { getAreaAddressCount } from "@/lib/api/geo";
import type { HeatCell, HeatResponse } from "@/lib/api/campaigns";
import { HEAT_FACTORS, HEAT_FACTOR_LABELS, heatBandLabel } from "@/lib/canvass/heat-fill";
import { CollapsibleCard } from "@/components/canvass/geo-panels/collapsible-card";

/** Cell flags → plain-language chips (the anti-black-box read-out). */
const FLAG_LABELS: Record<string, string> = {
  splitAttribution: "Straddles electorates",
  low_confidence: "Few attributed votes",
  interpolated_booths: "Nearest-booth estimate",
  insufficient_data: "Insufficient data",
};

/** Suburban turf norm for the "≈ N turfs" hint. */
const TURF_DOORS = 60;

/**
 * The clicked-SA1 explainability panel: score + action band, each available
 * factor's weighted contribution to the blend (sub-score × weight, normalised),
 * caveat flags as chips, the door count with a turf-size hint, and a
 * boundary-clip notice — ending in "Cut turf here", which preselects this SA1
 * in the existing area-based turf-cut flow.
 */
export function HeatCellCard({
  id = "heat-cell",
  cell,
  meta,
  onCutTurf,
}: {
  /** Stable id within the surrounding AccordionGroup. */
  id?: string;
  cell: HeatCell;
  meta: HeatResponse["meta"];
  onCutTurf?: (sa1Code: string) => void;
}) {
  // Doors inside this SA1 — the existing spatial address-count endpoint, cached.
  const addr = useApi(
    `/geo/area-address-count?codes=sa1:${cell.sa1Code}`,
    () => getAreaAddressCount([{ level: "sa1", code: cell.sa1Code }]),
    { ttlMs: 300_000 },
  );
  const doors = addr.data?.byArea?.[`sa1:${cell.sa1Code}`] ?? addr.data?.addresses ?? null;
  const turfs = doors !== null && doors > 0 ? Math.max(1, Math.round(doors / TURF_DOORS)) : null;

  // Weighted contribution of each available factor, normalised to shares of the
  // blend — mirrors the server's renormalisation over available weights.
  const contributions = useMemo(() => {
    const rows = HEAT_FACTORS.filter((f) => cell.available.includes(f)).map((f) => {
      const sub = Math.max(0, Math.min(1, cell.subScores[f] ?? 0));
      const weight = meta.weights[f] ?? 0;
      return { factor: f, sub, weight, contribution: sub * weight };
    });
    const total = rows.reduce((s, r) => s + r.contribution, 0);
    return rows
      .map((r) => ({ ...r, share: total > 0 ? r.contribution / total : 0 }))
      .sort((a, b) => b.share - a.share);
  }, [cell, meta.weights]);

  const missing = HEAT_FACTORS.filter((f) => !cell.available.includes(f));

  return (
    <CollapsibleCard
      id={id}
      title={`SA1 ${cell.sa1Code}`}
      description={
        cell.score !== null
          ? `Score ${Math.round(cell.score)} · ${heatBandLabel(cell.band)}`
          : "No score – insufficient data"
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums text-foreground">
          {cell.score !== null ? Math.round(cell.score) : "–"}
        </span>
        <span className="text-sm font-semibold text-foreground">{heatBandLabel(cell.band)}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">of 100</span>
      </div>

      {/* What drove the score — per-factor weighted contribution. */}
      {contributions.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {contributions.map((r) => (
            <div key={r.factor} title={`Sub-score ${Math.round(r.sub * 100)}/100 at weight ${r.weight}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{HEAT_FACTOR_LABELS[r.factor]}</span>
                <span className="tabular-nums text-muted-foreground">
                  {Math.round(r.sub * 100)} · w{r.weight}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-variant">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(r.share * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No factor had data for this SA1.</p>
      )}
      {missing.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No data: {missing.map((f) => HEAT_FACTOR_LABELS[f]).join(", ")}.
        </p>
      ) : null}

      {/* Caveats. */}
      {cell.flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cell.flags.map((f) => (
            <span
              key={f}
              className="rounded-full border border-border bg-surface-variant px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {FLAG_LABELS[f] ?? f.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      ) : null}

      {/* How much turf this is. */}
      <p className="mt-3 text-sm text-muted-foreground">
        {addr.loading ? (
          "Counting doors…"
        ) : doors !== null ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">{doors.toLocaleString()}</span> door
            {doors === 1 ? "" : "s"}
            {turfs !== null ? ` – ≈ ${turfs} turf${turfs === 1 ? "" : "s"} at ${TURF_DOORS} doors` : ""}
          </>
        ) : (
          "Door count unavailable."
        )}
      </p>
      {cell.coverageFraction < 0.95 ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          Only {Math.round(cell.coverageFraction * 100)}% of this SA1 sits inside the campaign boundary –
          its score counts just the doors within it.
        </p>
      ) : null}
      {meta.election ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Election data: {meta.election.note}.</p>
      ) : null}
      {cell.available.includes("progressive") ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Progressive baseline: Voice referendum 2023, division level.
        </p>
      ) : null}
      {cell.available.includes("informality") ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Informal-vote risk: 2025 federal booths.</p>
      ) : null}

      {onCutTurf ? (
        <Button size="sm" className="mt-3 w-full" onClick={() => onCutTurf(cell.sa1Code)}>
          <Scissors className="mr-1.5 h-3.5 w-3.5" />
          Cut turf here
        </Button>
      ) : null}
    </CollapsibleCard>
  );
}
