"use client";

import { useMemo, useState } from "react";
import type { Crosstab } from "@/lib/api/insights";
import { categoryColumn, isAggregateColumn, reduceCrosstab, totalColumn } from "@/lib/insights/evidence";
import { canDotplot, selectChart } from "@/lib/insights/select-chart";
import { diverging, netRow, topResponses } from "@/lib/insights/topline";
import {
  donutOptions,
  groupedStackedOptions,
  netDotplotOptions,
  rankedBarOptions,
  type ChartCtx,
} from "@/lib/insights/apex-options";
import { usePollPalette } from "@/components/insights/use-poll-palette";
import { ApexChart, ChartFigure } from "@/components/insights/apex-chart";
import { DivergingBar, DivergingLegend, DivergingNets } from "@/components/insights/diverging-bar";
import { useTheme } from "@/components/theme/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The picture of a crosstab, drawn above the crosstab.
 *
 * The chart follows the breakdown the reader has already chosen, so this component owns
 * no selector of its own — it reads `group` and `response` from the page. Which chart it
 * draws is decided by {@link selectChart} from the shape of the data alone, never from
 * the question's identity: a five-point battery gets a diverging bar whether it asks
 * about support or agreement, and six parties get ranked bars whether they are a primary
 * vote or a competence rating.
 *
 * The table underneath is the accessible fallback, so the charts here carry only an aria
 * summary rather than their own `<details>` copy of the numbers.
 */
export function QuestionCharts({
  crosstab,
  group,
  response,
  geoKind,
}: {
  crosstab: Crosstab;
  group: string;
  response: string;
  geoKind: string | null;
}) {
  const palette = usePollPalette();
  const { theme } = useTheme();
  const ctx: ChartCtx = { theme };

  const total = useMemo(() => totalColumn(crosstab), [crosstab]);
  const [asDotplot, setAsDotplot] = useState(false);

  // The geographic group has its own map on this page; the chart block stands aside.
  const isGeo = Boolean(geoKind) && group !== "Total";
  const choice = selectChart({ topline: total, group: isGeo ? group : "Total", geoKind: isGeo ? geoKind : null });

  if (!palette) return <Skeleton className="h-[260px] w-full rounded-lg" />;
  if (isGeo || choice.type === "none") return null;

  return (
    <div className="space-y-4">
      {group === "Total" ? (
        <ToplineChart crosstab={crosstab} total={total} palette={palette} ctx={ctx} />
      ) : (
        <BreakdownChart
          crosstab={crosstab}
          group={group}
          response={response}
          palette={palette}
          ctx={ctx}
          asDotplot={asDotplot}
          onToggleDotplot={setAsDotplot}
        />
      )}
    </div>
  );
}

type Palette = NonNullable<ReturnType<typeof usePollPalette>>;

/** The whole sample: a diverging bar, a donut, or ranked bars. */
function ToplineChart({
  crosstab,
  total,
  palette,
  ctx,
}: {
  crosstab: Crosstab;
  total: ReturnType<typeof totalColumn>;
  palette: Palette;
  ctx: ChartCtx;
}) {
  const choice = selectChart({ topline: total, group: "Total" });
  const baseN = crosstab.groups.find((g) => g.group === "Total")?.columns[0]?.baseN ?? null;
  const caption = baseN ? `Whole sample, n = ${baseN.toLocaleString()}.` : undefined;

  if (choice.type === "diverging") {
    const data = diverging(total)!;
    const summary = data.segments.map((s) => `${s.label} ${s.percent.toFixed(1)}%`).join(", ");
    return (
      <ChartFigure summary={summary} caption={caption}>
        <div className="space-y-1.5">
          <DivergingNets data={data} />
          <DivergingBar data={data} size="lg" />
          <div className="pt-1">
            <DivergingLegend data={data} />
          </div>
        </div>
      </ChartFigure>
    );
  }

  const rows = topResponses(total, Number.MAX_SAFE_INTEGER);
  const summary = rows.map((r) => `${r.label} ${r.percent.toFixed(1)}%`).join(", ");

  if (choice.type === "donut") {
    return (
      <ChartFigure summary={summary} caption={caption}>
        <ApexChart bundle={donutOptions(rows, palette, ctx)} type="donut" height={280} />
      </ChartFigure>
    );
  }

  return (
    <ChartFigure summary={summary} caption={caption}>
      <ApexChart bundle={rankedBarOptions(rows, palette, ctx)} type="bar" height={Math.max(200, rows.length * 34)} />
    </ChartFigure>
  );
}

/** One crossbreak: stacked batteries, a NET dot plot, or ranked bars per category. */
function BreakdownChart({
  crosstab,
  group,
  response,
  palette,
  ctx,
  asDotplot,
  onToggleDotplot,
}: {
  crosstab: Crosstab;
  group: string;
  response: string;
  palette: Palette;
  ctx: ChartCtx;
  asDotplot: boolean;
  onToggleDotplot: (v: boolean) => void;
}) {
  const total = useMemo(() => totalColumn(crosstab), [crosstab]);
  const columns = crosstab.groups.find((g) => g.group === group)?.columns ?? [];

  // Every category's own column. Suppressed ones are dropped rather than drawn as zero,
  // and NET columns are dropped because they aggregate the categories either side of them.
  const cats = useMemo(
    () =>
      columns
        .filter((c) => c.reportable && !isAggregateColumn(c.value))
        .map((c) => ({ category: c.value, topline: categoryColumn(crosstab, group, c.value) })),
    [crosstab, group, columns],
  );
  const aggregates = columns.filter((c) => isAggregateColumn(c.value)).length;
  const hiddenCats = columns.length - cats.length - aggregates;

  const battery = diverging(total) !== null;
  const dotplotAvailable = canDotplot(total, group);

  if (battery) {
    const labels = diverging(total)!.segments.map((s) => s.label);
    const stacked = cats
      .map((c) => ({ category: c.category, diverging: diverging(c.topline) }))
      .filter((c): c is { category: string; diverging: NonNullable<ReturnType<typeof diverging>> } => c.diverging !== null);

    if (stacked.length === 0) return <NoData group={group} hidden={hiddenCats} />;

    if (asDotplot && dotplotAvailable) {
      const netLabel = total.find((r) => r.isNet)?.label ?? "NET";
      const points = stacked
        .map((c) => ({ category: c.category, net: netRow(cats.find((x) => x.category === c.category)!.topline, netLabel.replace(/^NET\s+/i, "")) }))
        .filter((p): p is { category: string; net: number } => p.net !== null);

      return (
        <ChartFigure
          summary={points.map((p) => `${p.category} ${p.net.toFixed(1)}%`).join(", ")}
          caption={captionFor(group, hiddenCats, aggregates, `${netLabel} by ${group}.`)}
          className="space-y-2"
        >
          <ViewToggle asDotplot onChange={onToggleDotplot} />
          <ApexChart
            bundle={netDotplotOptions(points, netLabel, palette, ctx)}
            type="scatter"
            height={Math.max(220, points.length * 32)}
          />
        </ChartFigure>
      );
    }

    return (
      <ChartFigure
        summary={`${labels.join(", ")} across ${group}`}
        caption={captionFor(group, hiddenCats, aggregates, `Full distribution by ${group}, each bar to 100%.`)}
        className="space-y-2"
      >
        {dotplotAvailable ? <ViewToggle asDotplot={false} onChange={onToggleDotplot} /> : null}
        <ApexChart
          bundle={groupedStackedOptions(stacked, labels, palette, ctx)}
          type="bar"
          height={Math.max(240, stacked.length * 44)}
        />
      </ChartFigure>
    );
  }

  // Nominal: one response across the categories.
  const { rows, hidden, aggregates: aggs } = reduceCrosstab(crosstab, { group, response });
  if (rows.length === 0) return <NoData group={group} hidden={hidden} />;

  return (
    <ChartFigure
      summary={rows.map((r) => `${r.label} ${r.percent.toFixed(1)}%`).join(", ")}
      caption={captionFor(group, hidden, aggs, `“${response}” by ${group}.`)}
    >
      <ApexChart bundle={rankedBarOptions(rows, palette, ctx)} type="bar" height={Math.max(200, rows.length * 34)} />
    </ChartFigure>
  );
}

/** Omission is stated, never silent — a missing column is not a zero. */
function captionFor(group: string, hidden: number, aggregates: number, lead: string): string {
  const notes: string[] = [];
  if (hidden > 0) notes.push(`${hidden} ${hidden === 1 ? "group" : "groups"} hidden – base too small to report`);
  if (aggregates > 0) notes.push(`${aggregates} NET ${aggregates === 1 ? "column" : "columns"} omitted – they aggregate the groups shown`);
  return notes.length > 0 ? `${lead} ${notes.join("; ")}.` : lead;
}

function NoData({ group, hidden }: { group: string; hidden: number }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      No reportable data for {group}
      {hidden > 0 ? ` – all ${hidden} ${hidden === 1 ? "group has" : "groups have"} a base below the reporting threshold` : ""}.
    </p>
  );
}

function ViewToggle({ asDotplot, onChange }: { asDotplot: boolean; onChange: (v: boolean) => void }) {
  const btn = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1 text-xs font-semibold transition",
      active ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div className="inline-flex rounded-lg bg-surface-variant p-0.5">
      <button type="button" onClick={() => onChange(false)} aria-pressed={!asDotplot} className={btn(!asDotplot)}>
        Distribution
      </button>
      <button type="button" onClick={() => onChange(true)} aria-pressed={asDotplot} className={btn(asDotplot)}>
        Net only
      </button>
    </div>
  );
}
