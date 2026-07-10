import type { Crosstab, EvidenceClaim, ToplineRow } from "@/lib/api/insights";
import { topResponses } from "./topline";

/**
 * Reading a crosstab down to the numbers a chart or a claim-check needs.
 *
 * Every figure a key finding displays is computed here from the estimates, never lifted
 * from the finding's prose. The two disagree in this poll — the write-up says 63% where
 * the data says 64.6%, and 27% where the data says 25.8% — so trusting the prose would
 * put a number on screen that the crosstab underneath contradicts.
 */

/** The whole-sample column of a crosstab, in the shape the topline helpers expect. */
export function totalColumn(x: Crosstab): ToplineRow[] {
  const total = x.groups.find((g) => g.group === "Total")?.columns[0];
  if (!total) return [];
  return x.responses.map((r) => ({
    label: r.label,
    percent: total.reportable ? (r.cells[total.ordinal] ?? null) : null,
    isNet: r.isNet,
  }));
}

/** One crossbreak category's column, as a topline. */
export function categoryColumn(x: Crosstab, group: string, value: string): ToplineRow[] {
  const col = x.groups.find((g) => g.group === group)?.columns.find((c) => c.value === value);
  if (!col) return [];
  return x.responses.map((r) => ({
    label: r.label,
    percent: col.reportable ? (r.cells[col.ordinal] ?? null) : null,
    isNet: r.isNet,
  }));
}

export type ReducedRow = { label: string; percent: number };

/**
 * A banner column that aggregates its neighbours rather than standing beside them.
 *
 * The Age banner runs `18-24, 25-34, NET 18-34, 35-49, 50-64, 65+, NET 50+`. In a table
 * those NET columns are useful; in a chart they are bars drawn from the same respondents
 * as the bars either side of them, so they double-count and always out-rank their own
 * components. The table keeps them; the charts leave them out and say so.
 */
export function isAggregateColumn(value: string): boolean {
  return /^NET\b/i.test(value.trim());
}

/**
 * One response row across every category of a breakdown group, largest first.
 *
 * Columns whose base is below the reporting threshold, and cells with no estimate, are
 * **dropped** rather than emitted as zero. A suppressed cell means "we do not know", and
 * a zero-height bar says "nobody" – the two must never be confused. Aggregate (NET)
 * columns are dropped too, for a different reason. Both counts come back so the caller
 * can caption what is missing rather than let the chart imply it was never there.
 */
export function reduceCrosstab(
  x: Crosstab,
  sel: { group: string; response: string },
): { rows: ReducedRow[]; hidden: number; aggregates: number } {
  const group = x.groups.find((g) => g.group === sel.group);
  const response = x.responses.find((r) => r.label === sel.response);
  if (!group || !response) return { rows: [], hidden: 0, aggregates: 0 };

  let hidden = 0;
  let aggregates = 0;
  const rows: ReducedRow[] = [];
  for (const col of group.columns) {
    if (isAggregateColumn(col.value)) {
      aggregates++;
      continue;
    }
    const value = response.cells[col.ordinal];
    if (!col.reportable || typeof value !== "number") {
      hidden++;
      continue;
    }
    rows.push({ label: col.value, percent: value });
  }
  rows.sort((a, b) => b.percent - a.percent);
  return { rows, hidden, aggregates };
}

/** A single cell: `crosstabValue(x, { group: "Total", response: "NET Support" })`. */
export function crosstabValue(
  x: Crosstab,
  sel: { group: string; value?: string; response: string },
): number | null {
  const group = x.groups.find((g) => g.group === sel.group);
  if (!group) return null;
  const col = sel.value ? group.columns.find((c) => c.value === sel.value) : group.columns[0];
  if (!col || !col.reportable) return null;

  const response = x.responses.find((r) => r.label === sel.response);
  if (!response) return null;

  const value = response.cells[col.ordinal];
  return typeof value === "number" ? value : null;
}

export type DriftStatus = "match" | "drift" | "unverifiable";
export type Drift = {
  status: DriftStatus;
  claimed: number | null;
  computed: number | null;
  /** Signed: positive when the data is higher than the prose. Null unless both are known. */
  delta: number | null;
};

/**
 * Compare a figure the write-up asserts against the figure the estimates hold.
 *
 * The tolerance is one percentage point because the prose rounds to whole points while the
 * estimates carry two decimals: 39.84 written as "40" is honest rounding, not an error. It
 * is deliberately tight enough to catch the two claims in this poll that are not rounding —
 * E3's "63%" against a computed 64.6, and B1's "Coalition 27" against 25.8.
 *
 * A claim we cannot compute at all is `unverifiable`, not `drift`. The write-up cites the
 * seat of Kew; this poll's finest geography is the eight upper-house regions, so there is
 * no cell to check it against. Saying "the data disagrees" would be as wrong as saying
 * "the data agrees".
 */
export function driftFlag(claimed: number | null, computed: number | null, tolerance = 1.0): Drift {
  if (claimed === null || computed === null) {
    return { status: "unverifiable", claimed, computed, delta: null };
  }
  const delta = Number((computed - claimed).toFixed(2));
  return {
    status: Math.abs(delta) > tolerance ? "drift" : "match",
    claimed,
    computed,
    delta,
  };
}

/** "data shows 64.6% (+1.6)" — the drift chip's text. */
export function describeDrift(d: Drift): string | null {
  if (d.status !== "drift" || d.computed === null || d.delta === null) return null;
  const sign = d.delta > 0 ? "+" : "−";
  return `data shows ${d.computed.toFixed(1)}% (${sign}${Math.abs(d.delta).toFixed(1)})`;
}

/**
 * The figure a claim points at, read out of the whole-sample column.
 *
 * A claim addresses its cell either by naming the response or by its rank. Rank exists
 * for questions whose responses are whole paragraphs — D6's arguments run to two hundred
 * characters, and "the strongest argument scored 48%" is a claim about the top-ranked
 * row, not about a particular sentence.
 */
export function claimValue(topline: ToplineRow[], claim: EvidenceClaim): number | null {
  if (claim.response !== undefined) {
    return topline.find((r) => r.label === claim.response)?.percent ?? null;
  }
  if (claim.rank !== undefined && claim.rank >= 1) {
    return topResponses(topline, claim.rank)[claim.rank - 1]?.percent ?? null;
  }
  return null;
}

export type MatrixSource = { code: string; title: string; topline: ToplineRow[] };
export type HeatRow = { name: string; cells: Array<{ x: string; y: number | null }> };

/**
 * A battery of questions as a matrix — twelve issues down, six parties across.
 *
 * Built from the toplines the poll payload already carries, so the heatmap costs no
 * request. Columns are fixed to the first question's response order and every row is
 * padded to them: Apex needs a rectangular series, and a question missing a response must
 * leave a hole rather than shift its neighbours one column left.
 */
export function buildMatrix(questions: MatrixSource[], codes: string[]): HeatRow[] {
  const found = codes
    .map((c) => questions.find((q) => q.code === c))
    .filter((q): q is MatrixSource => q !== undefined);
  if (found.length === 0) return [];

  const columns = found[0].topline.filter((r) => !r.isNet).map((r) => r.label);

  return found.map((q) => ({
    name: q.title,
    cells: columns.map((x) => {
      const hit = q.topline.find((r) => !r.isNet && r.label === x);
      return { x, y: hit?.percent ?? null };
    }),
  }));
}
