"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ApexBundle } from "@/lib/insights/apex-options";

/**
 * The one and only place `react-apexcharts` is imported.
 *
 * Two reasons it must stay singular. ApexCharts touches `window` at module scope, so it
 * can never be evaluated during a server render — hence `ssr: false`. And webpack keys
 * its async chunks on the import site, so a `dynamic()` call in each chart file would
 * emit a copy of the ~130 KB library per chart. Every chart on the page goes through
 * this component instead, and shares one chunk.
 *
 * `ApexOptions` is a type-only import, so it is erased at compile time and the pure
 * option builders in `lib/insights/apex-options.ts` stay runnable under vitest in node.
 */
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full rounded-lg" />,
});

export type ApexChartType = "bar" | "donut" | "radialBar" | "heatmap" | "scatter";

export function ApexChart({
  bundle,
  type,
  height = 260,
}: {
  bundle: ApexBundle;
  type: ApexChartType;
  height?: number | string;
}) {
  return (
    <ReactApexChart
      options={bundle.options as ApexOptions}
      series={bundle.series as ApexOptions["series"]}
      type={type}
      height={height}
      width="100%"
    />
  );
}

/**
 * The accessible frame around any chart on this page — Apex renders an SVG that a screen
 * reader cannot narrate, so identity must not live in the picture alone.
 *
 * `summary` becomes the image's accessible name. `rows` adds a collapsed table of the
 * same numbers. Pass `rows` wherever there is no data table already adjacent: on the
 * question page the crosstab sits directly beneath the chart and *is* the table view, so
 * `rows` is omitted there; on a key-finding card there is nothing else, so it is required
 * in practice. This is also the mandated relief for the diverging ramp's neutral step,
 * which is deliberately too low-contrast to read on its own.
 */
export function ChartFigure({
  title,
  summary,
  caption,
  rows,
  className,
  children,
}: {
  title?: string;
  summary: string;
  caption?: string;
  rows?: Array<{ label: string; percent: number }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      {title ? (
        <figcaption className="mb-1 text-xs font-semibold text-foreground">{title}</figcaption>
      ) : null}

      <div role="img" aria-label={summary}>
        {children}
      </div>

      {caption ? <p className="mt-1.5 text-xs text-muted-foreground">{caption}</p> : null}

      {rows && rows.length > 0 ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-poll-accent">
            <span className="underline decoration-dotted underline-offset-2">View as table</span>
          </summary>
          <table className="mt-2 w-full border-collapse text-xs">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border">
                  <td className="py-1 pr-3 text-left text-muted-foreground">{r.label}</td>
                  <td className="py-1 text-right font-semibold text-foreground tabular-nums">
                    {r.percent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </figure>
  );
}
