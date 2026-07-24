"use client";

import { formatDensity, type DensityBand } from "@/lib/canvass/density";
import { NODATA_HATCH_CSS } from "@/lib/canvass/nodata-hatch";
import { cn } from "@/lib/utils";

/**
 * The key to a sequential choropleth: a row of swatches, low to high, with the band
 * boundaries beneath. Shared by the density layer and the poll choropleth so one ramp
 * never ends up explained two different ways.
 *
 * The no-data swatch is drawn separately and last, because "we never measured this
 * region" is not a value on the scale — it sits outside it.
 */
export function SequentialLegend({
  bands,
  unit,
  nodata,
  className,
  format = formatDensity,
}: {
  bands: DensityBand[];
  /** e.g. "addresses/km²" — the axis label a bare number cannot carry. */
  unit?: string;
  /** The no-data colour; when given, an "unmeasured" swatch is appended. */
  nodata?: string;
  className?: string;
  /** Band-boundary formatter (default = density). Demographics passes a unit-aware one. */
  format?: (n: number) => string;
}) {
  if (bands.length === 0) return null;
  const top = bands[bands.length - 1];

  return (
    <div className={cn("rounded-lg bg-surface/95 px-2 py-1.5 shadow-card", className)}>
      <div className="flex items-center gap-0.5">
        {bands.map((b) => (
          <span
            key={b.lo}
            className="h-3 w-6 first:rounded-l-sm last:rounded-r-sm"
            style={{ backgroundColor: b.colour }}
            title={b.hi === null ? `${format(b.lo)}+` : `${format(b.lo)}–${format(b.hi)}`}
          />
        ))}
        {nodata ? (
          <span
            className="ml-2 h-3 w-6 rounded-sm border border-border"
            style={{ backgroundColor: nodata, backgroundImage: NODATA_HATCH_CSS }}
            title="Not enough data"
          />
        ) : null}
      </div>

      <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>{format(bands[0].lo)}</span>
        <span>{format(top.lo)}+</span>
      </div>

      {unit ? <p className="text-[10px] leading-tight text-muted-foreground">{unit}</p> : null}
    </div>
  );
}
