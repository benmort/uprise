"use client";

import { useApi } from "@/lib/use-api";
import { getAreaAddressCount } from "@/lib/api/geo";
import { MAX_SHIFTS_PER_TURF } from "@/lib/canvass/turf-estimate";

// The codebase's planning heuristic: "a shift is about 100 doors" (turf-estimate.service). This
// is a rough PRE-CUT prior — the real, footpath-timed estimate is computed once the turf is cut.
const DOORS_PER_SHIFT = 100;
const SHIFT_HOURS = 4;

/**
 * Address count + a rough time estimate for a set of selected ASGS areas, shown on the
 * turf-cutting "Selected areas" panels before the turf is cut. Areas only — drawn polygons
 * and individually-picked doors aren't counted here. Counts come from the same precomputed
 * source the areas explorer uses, so they appear wherever that source is populated.
 */
export function SelectedAreasEstimate({ areas }: { areas: Array<{ level: string; code: string }> }) {
  const codes = areas.map((a) => `${a.level}:${a.code}`).join(",");
  const { data, loading } = useApi(
    areas.length ? `/geo/area-address-count?codes=${codes}` : null,
    () => getAreaAddressCount(areas),
    { ttlMs: 60_000 },
  );
  if (areas.length === 0) return null;

  const addresses = data?.addresses ?? null;

  if (addresses == null) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {loading ? "Counting addresses…" : "Address count unavailable"}
      </p>
    );
  }

  const shifts = addresses / DOORS_PER_SHIFT;
  const hours = shifts * SHIFT_HOURS;
  const shiftLabel = shifts < 1 ? shifts.toFixed(1) : String(Math.round(shifts));

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold tabular-nums text-foreground">
          {addresses.toLocaleString()} address{addresses === 1 ? "" : "es"}
        </span>
        {addresses > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            ≈ {shiftLabel} shift{Math.round(shifts) === 1 ? "" : "s"} · ~{Math.max(1, Math.round(hours))} h
          </span>
        ) : null}
      </div>
      {addresses > 0 && shifts > MAX_SHIFTS_PER_TURF ? (
        <p className="mt-1 text-xs font-medium text-warning-foreground">
          Over {MAX_SHIFTS_PER_TURF} shifts of work — consider splitting before you assign it.
        </p>
      ) : null}
      {addresses > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Rough estimate (~{DOORS_PER_SHIFT} doors/shift); the exact walk time is priced after cutting.
        </p>
      ) : null}
    </div>
  );
}
