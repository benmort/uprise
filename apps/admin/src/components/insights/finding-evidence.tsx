"use client";

import Link from "next/link";
import { ArrowUpRight, Info } from "lucide-react";
import type { Crosstab, EvidenceItem, PollQuestionRef } from "@/lib/api/insights";
import { useApi } from "@/lib/use-api";
import { useInsightsApi } from "@/components/insights/insights-api-context";
import {
  buildMatrix,
  claimValue,
  crosstabValue,
  describeDrift,
  driftFlag,
  reduceCrosstab,
} from "@/lib/insights/evidence";
import { selectChart } from "@/lib/insights/select-chart";
import { diverging, topResponses } from "@/lib/insights/topline";
import {
  donutOptions,
  heatmapOptions,
  radialGaugeOptions,
  rankedBarOptions,
  type ChartCtx,
} from "@/lib/insights/apex-options";
import { ApexChart, ChartFigure } from "@/components/insights/apex-chart";
import { usePollPalette } from "@/components/insights/use-poll-palette";
import { DivergingBar, DivergingLegend, DivergingNets } from "@/components/insights/diverging-bar";
import { StateRegion } from "@/components/shell/state-region";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme/theme-provider";

/**
 * The data behind a key finding.
 *
 * Every number here is computed from the estimates. Where the write-up states a figure,
 * it is checked against the computed one and any disagreement is shown — this poll's
 * prose says 63% where the crosstab says 64.6%, and 27% where it says 25.8%. Where a
 * claim cannot be checked at all, it says so rather than drawing a chart of something
 * adjacent: the finding cites the seat of Kew, and the poll has no lower-house geography.
 *
 * Exhibits that need only the whole-sample column are drawn from the `topline` the poll
 * payload already carries, so they cost no request. Only a crossbreak fetches.
 */
export function FindingEvidence({
  items,
  pollId,
  questions,
}: {
  items: EvidenceItem[];
  pollId: string;
  questions: PollQuestionRef[];
}) {
  return (
    <div className="mt-4 space-y-5 border-t border-border pt-4">
      {items.map((item, i) => (
        <Exhibit key={`${item.code ?? "prose"}-${item.group ?? ""}-${i}`} item={item} pollId={pollId} questions={questions} />
      ))}
    </div>
  );
}

function Exhibit({
  item,
  pollId,
  questions,
}: {
  item: EvidenceItem;
  pollId: string;
  questions: PollQuestionRef[];
}) {
  if (item.unverifiable) return <Unverifiable item={item} />;
  if (item.matrix) return <MatrixExhibit item={item} questions={questions} />;
  if (item.group && item.code) return <BreakdownExhibit item={item} pollId={pollId} />;
  if (item.code) return <ToplineExhibit item={item} pollId={pollId} questions={questions} />;
  return null;
}

/** A claim the poll cannot answer. Stated plainly, with no chart under it. */
function Unverifiable({ item }: { item: EvidenceItem }) {
  return (
    <section className="rounded-[4px] border border-dashed border-border bg-surface-variant/30 p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {item.label}
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.unverifiable}</p>
      <span className="mt-2 inline-block rounded-[3px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Not in this poll
      </span>
    </section>
  );
}

/** Derive a whole-sample topline from a fetched crosstab's Total column. */
function toplineFromCrosstab(c: Crosstab | undefined): PollQuestionRef["topline"] | null {
  if (!c) return null;
  const totalOrd = c.groups.find((g) => g.group === "Total")?.columns[0]?.ordinal;
  if (totalOrd === undefined) return null;
  return c.responses.map((r) => ({ label: r.label, percent: r.cells[totalOrd] ?? null, isNet: r.isNet }));
}

/** The whole-sample column — a diverging bar, a donut, ranked bars, or one big number. */
function ToplineExhibit({ item, pollId, questions }: { item: EvidenceItem; pollId: string; questions: PollQuestionRef[] }) {
  const palette = usePollPalette();
  const { theme } = useTheme();
  const ctx: ChartCtx = { theme };
  const { getPollQuestion } = useInsightsApi();

  // A base question carries its topline on the page. A VARIANT code (e.g. D6-2) is collapsed into
  // its base by groupQuestions, so it isn't in `questions` and its topline isn't on the page —
  // fetch the crosstab and read the Total column instead (otherwise the exhibit renders blank).
  const base = questions.find((q) => q.code === item.code);
  const fetchKey = !base && item.code ? `/insights/polls/${pollId}/questions/${item.code}` : null;
  const { data: crosstab } = useApi<Crosstab>(fetchKey, () => getPollQuestion(pollId, item.code!), {
    ttlMs: 300_000,
  });

  const topline = base?.topline ?? toplineFromCrosstab(crosstab);
  const title = base?.title ?? crosstab?.question.title ?? item.code ?? "";
  if (!topline) return fetchKey ? <Skeleton className="h-40 w-full rounded-lg" /> : null;
  if (!palette) return <Skeleton className="h-40 w-full rounded-lg" />;

  const computed = item.claim ? claimValue(topline, item.claim) : null;

  const header = <ExhibitHeader item={item} code={item.code!} pollId={pollId} computed={computed} />;

  // A headline exhibit shows the one number the claim is about, as a gauge.
  if (item.headline) {
    const value = computed ?? (item.response ? (topline.find((r) => r.label === item.response)?.percent ?? null) : null);
    if (value === null) return null;
    return (
      <section>
        {header}
        <ChartFigure summary={`${item.response ?? title}: ${value.toFixed(1)}%`}>
          <ApexChart
            bundle={radialGaugeOptions(value, item.response ?? title, palette, ctx)}
            type="radialBar"
            height={200}
          />
        </ChartFigure>
      </section>
    );
  }

  const choice = selectChart({ topline, group: "Total" });
  if (choice.type === "none") return null;

  if (choice.type === "diverging") {
    const data = diverging(topline)!;
    return (
      <section>
        {header}
        <ChartFigure
          summary={data.segments.map((s) => `${s.label} ${s.percent.toFixed(1)}%`).join(", ")}
          rows={data.segments.map((s) => ({ label: s.label, percent: s.percent }))}
        >
          <div className="space-y-1.5">
            <DivergingNets data={data} />
            <DivergingBar data={data} size="lg" />
            <div className="pt-1">
              <DivergingLegend data={data} />
            </div>
          </div>
        </ChartFigure>
      </section>
    );
  }

  const rows = topResponses(topline, choice.type === "donut" ? 3 : 12);
  const summary = rows.map((r) => `${r.label} ${r.percent.toFixed(1)}%`).join(", ");

  return (
    <section>
      {header}
      <ChartFigure summary={summary} rows={rows}>
        {choice.type === "donut" ? (
          <ApexChart bundle={donutOptions(rows, palette, ctx)} type="donut" height={240} />
        ) : (
          <ApexChart bundle={rankedBarOptions(rows, palette, ctx)} type="bar" height={Math.max(200, rows.length * 32)} />
        )}
      </ChartFigure>
    </section>
  );
}

/** One response across a crossbreak. The only exhibit that costs a request. */
function BreakdownExhibit({ item, pollId }: { item: EvidenceItem; pollId: string }) {
  const palette = usePollPalette();
  const { theme } = useTheme();
  const ctx: ChartCtx = { theme };
  const { getPollQuestion } = useInsightsApi();

  const { data, loading, error, noPermission, refetch } = useApi(
    `/insights/polls/${pollId}/questions/${item.code}`,
    () => getPollQuestion(pollId, item.code!),
    { ttlMs: 300_000 },
  );

  return (
    <section>
      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        skeleton={<Skeleton className="h-40 w-full rounded-lg" />}
      >
        {data && palette ? <BreakdownBody item={item} pollId={pollId} crosstab={data} palette={palette} ctx={ctx} /> : null}
      </StateRegion>
    </section>
  );
}

function BreakdownBody({
  item,
  pollId,
  crosstab,
  palette,
  ctx,
}: {
  item: EvidenceItem;
  pollId: string;
  crosstab: Crosstab;
  palette: NonNullable<ReturnType<typeof usePollPalette>>;
  ctx: ChartCtx;
}) {
  const { rows, hidden, aggregates } = reduceCrosstab(crosstab, { group: item.group!, response: item.response! });
  if (rows.length === 0) return null;

  const computed = item.claim
    ? crosstabValue(crosstab, { group: item.group!, value: item.claim.value, response: item.claim.response! })
    : null;

  const notes: string[] = [];
  if (hidden > 0) notes.push(`${hidden} ${hidden === 1 ? "group" : "groups"} hidden – base too small to report`);
  if (aggregates > 0) notes.push(`${aggregates} NET ${aggregates === 1 ? "column" : "columns"} omitted`);
  const caption = `“${item.response}” by ${item.group}.${notes.length ? ` ${notes.join("; ")}.` : ""}`;

  return (
    <>
      <ExhibitHeader item={item} code={item.code!} pollId={pollId} computed={computed} />
      <ChartFigure summary={rows.map((r) => `${r.label} ${r.percent.toFixed(1)}%`).join(", ")} caption={caption} rows={rows}>
        <ApexChart bundle={rankedBarOptions(rows, palette, ctx)} type="bar" height={Math.max(200, rows.length * 32)} />
      </ChartFigure>
    </>
  );
}

/** A question battery as a heatmap — built from toplines already on the page. */
function MatrixExhibit({ item, questions }: { item: EvidenceItem; questions: PollQuestionRef[] }) {
  const palette = usePollPalette();
  const { theme } = useTheme();
  const ctx: ChartCtx = { theme };

  if (!palette) return <Skeleton className="h-64 w-full rounded-lg" />;

  const matrix = buildMatrix(questions, item.matrix!);
  if (matrix.length === 0) return null;

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-foreground">{item.label}</h4>
      <ChartFigure
        summary={`${matrix.length} issues by ${matrix[0].cells.length} parties, shaded by the share naming each party best`}
        caption="Darker means a larger share of voters name that party as best on the issue."
      >
        <ApexChart bundle={heatmapOptions(matrix, palette, ctx)} type="heatmap" height={Math.max(260, matrix.length * 30)} />
      </ChartFigure>
    </section>
  );
}

/**
 * Caption, the drift chip, and a deep link to the crosstab the exhibit is drawn from —
 * so a reader who doubts the chart is one click from the table behind it.
 */
function ExhibitHeader({
  item,
  code,
  pollId,
  computed,
}: {
  item: EvidenceItem;
  code: string;
  pollId: string;
  computed: number | null;
}) {
  const drift = item.claim ? driftFlag(item.claim.percent, computed) : null;
  const note = drift ? describeDrift(drift) : null;

  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h4 className="text-xs font-semibold text-foreground">{item.label}</h4>

      {item.claim ? (
        <span className="text-xs text-muted-foreground tabular-nums">write-up says {item.claim.percent}%</span>
      ) : null}

      {note ? (
        <span className="rounded-[3px] border border-poll-accent px-1.5 py-0.5 text-[11px] font-semibold text-poll-accent tabular-nums">
          {note}
        </span>
      ) : null}

      <Link
        href={`/insights/${pollId}/questions/${encodeURIComponent(code)}`}
        className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-poll-accent"
      >
        {code}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
