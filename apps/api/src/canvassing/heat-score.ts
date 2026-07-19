/**
 * The canvass targeting heat score — PURE module (no DB, no Nest), mirroring the
 * recommend-turf.ts / turf-estimate.model.ts pattern so the whole algorithm is
 * golden-fixture testable.
 *
 * Design (see the approved plan; grounded in field-experiment literature + the
 * CDC SVI composite-index pattern):
 *   score = gate · 100 · Σ w_f·s_f / Σ w_f      over factors AVAILABLE per SA1
 * where `gate = min(1, doors/30)` enforces the multiplicative boundary condition
 * (no knockable doors ⇒ ~0, however persuadable the area looks — expected value
 * per hour is contact-rate × effect), and missing factors drop out of BOTH sums
 * (weight renormalisation, never 0.5 imputation). Cells with < 60% of the preset's
 * weight available score null — "we don't know" must never paint as "cold".
 *
 * Normalisation: Hazen percentile rank WITHIN the boundary for distribution-shaped
 * signals (counts/densities — rank is invariant under monotone transforms, so
 * skew needs no tuning); anchored 0–1 formulas (support share, freshness,
 * competitiveness, fit) map directly and are never ranked. A rank signal that is
 * constant across the boundary contributes 0.5 everywhere and is reported in
 * meta.constantFactors — it stops discriminating without distorting.
 */

export const HEAT_FACTORS = [
  "doors",
  "persuadability",
  "supporter",
  "fit",
  "efficiency",
  "freshness",
  // Opt-in factors (weight 0 in every preset — scores are identical until a slider moves):
  "community", // second demographic lens, default CALD language-other-than-English share
  "progressive", // 2023 Voice referendum Yes% by division (coarse, badged low-resolution)
  "informality", // booth informal-vote share, attendance-smeared — enrolment/formality risk
] as const;
export type HeatFactor = (typeof HEAT_FACTORS)[number];

export type HeatWeights = Record<HeatFactor, number>;

export type HeatPreset = "persuasion" | "gotv" | "coverage";

/**
 * Default weights per preset (sum 100). Research-grounded: Persuasion maximises
 * contested conversations (booth 50/50 proximity + poll ambivalence — presented as
 * WHERE to knock, never promised vote lift, per Kalla & Broockman); the Australian
 * GOTV preset means supporter re-contact under compulsory voting; Coverage mirrors
 * the full-coverage doctrine (uncontacted doors × walkability). Freshness never
 * hits zero — re-knocking last week's doors is waste under every strategy.
 */
export const HEAT_PRESETS: Record<HeatPreset, HeatWeights> = {
  persuasion: { doors: 20, persuadability: 30, supporter: 5, fit: 15, efficiency: 15, freshness: 15, community: 0, progressive: 0, informality: 0 },
  gotv: { doors: 15, persuadability: 5, supporter: 40, fit: 10, efficiency: 15, freshness: 15, community: 0, progressive: 0, informality: 0 },
  coverage: { doors: 35, persuadability: 5, supporter: 5, fit: 5, efficiency: 20, freshness: 30, community: 0, progressive: 0, informality: 0 },
};

/** Doors at which the sufficiency gate saturates (min(1, doors/GATE_DOORS)). */
export const GATE_DOORS = 30;
/** Available-weight floor below which a cell is honest-null rather than scored. */
export const MIN_AVAILABLE_WEIGHT_SHARE = 0.6;
/** Empirical-Bayes shrinkage mass for the support share (1-of-1 must not read 100%). */
export const SUPPORT_SHRINKAGE_M = 20;
/** Attributed booth votes below which the election signal is flagged low-confidence. */
export const LOW_CONFIDENCE_VOTES = 30;

/** One SA1's raw factor inputs, straight out of the extraction query. */
export interface RawHeatRow {
  sa1Code: string;
  /** Boundary-clipped G-NAF door count (sum over member meshblocks inside the boundary). */
  doors: number;
  /** Member meshblocks with at least one address. */
  occupiedMbs: number;
  /** SA1 area (km²) — national figure; null when unknown. */
  areaKm2: number | null;
  /** SEIFA decile (or the configured fit indicator's value); null = ABS-suppressed. */
  fitValue: number | null;
  /** Poll % for the campaign's nominated response, smeared from the electorate; null = no attribution. */
  pollPercent: number | null;
  /** Whether the poll response is a NET row (percent is a net; soft share derives differently). */
  pollIsNet: boolean;
  /** Share of the SA1's addresses agreeing with its modal electorate (splitAttribution below 0.9). */
  electorateMajorityShare: number | null;
  /** Booth competitiveness01 (attendance-weighted or IDW); null = no election data. */
  competitiveness: number | null;
  /** Attributed mark-off votes behind the booth metrics; null for IDW rows. */
  attributedVotes: number | null;
  /** Aligned-party first-preference share (0–1); null when the campaign sets no party codes. */
  alignedFpShare: number | null;
  /** Referendum Yes % for the SA1's division (persuadability fallback + the progressive factor); null when absent. */
  referendumYesPct: number | null;
  /** Second demographic lens value (default CALD LOTE share, percent 0–100); null = suppressed/absent. */
  communityValue: number | null;
  /** Booth informal-vote share (0–1), attendance-smeared; null when no election data. */
  informalityShare: number | null;
  /** Tenant contacts resolved to this SA1 (gnafPid-linked only). */
  contacts: number;
  /** Contacts whose latest disposition is STRONG_SUPPORT | LEAN_SUPPORT. */
  supporters: number;
  /** Contacts with any support-levelled disposition. */
  dispositioned: number;
  /** Σ exp(−ln2 · ageDays/30) over each contact's latest knock (0 = never knocked). */
  knockDecay: number;
  /** SA1 area share inside the boundary (dashed-edge UI treatment). */
  coverageFraction: number;
}

export interface HeatCellResult {
  sa1Code: string;
  /** 0–100; null = insufficient data (paints as hatched no-data, never cold). */
  score: number | null;
  /** 1–5 from the within-boundary quantile breaks; null when score is null. */
  band: number | null;
  /** 0–1 per available factor; absent key = factor unavailable for this cell. */
  subScores: Partial<Record<HeatFactor, number>>;
  available: HeatFactor[];
  flags: string[];
  coverageFraction: number;
}

export interface HeatMeta {
  weights: HeatWeights;
  sa1Count: number;
  /** Within-boundary score quantiles [q20, q40, q60, q80] over non-null scores. */
  breaks: number[];
  /** Share of cells (0–1) for which each factor contributed. */
  factorCoverage: Record<HeatFactor, number>;
  /** Rank-degenerate signals (constant within the boundary) — they contribute 0.5 flat. */
  constantFactors: HeatFactor[];
  /** Signals whose true resolution is coarser than SA1 (ecological-inference honesty). */
  lowResolutionFactors: Array<{ factor: HeatFactor; component: string; resolution: string }>;
}

/** Hazen percentile ranks (r−0.5)/N with average ranks for ties; null-safe passthrough. */
export function hazenRanks(values: Array<number | null>): Array<number | null> {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v));
  const n = present.length;
  const out: Array<number | null> = values.map(() => null);
  if (n === 0) return out;
  const sorted = [...present].sort((a, b) => a.v - b.v);
  // Average rank per distinct value (ties share the mean of their positional ranks).
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based mean position
    for (let k = i; k <= j; k++) out[sorted[k].i] = (avgRank - 0.5) / n;
    i = j + 1;
  }
  return out;
}

/** True when every present value in the column is identical (rank degenerates). */
function isConstant(values: Array<number | null>): boolean {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return false;
  return present.every((v) => v === present[0]);
}

/** Near-target fit lens: 1 at the target, linear falloff to 0 at ±span. */
export function fitScore(value: number, target: number, span: number): number {
  return Math.max(0, 1 - Math.min(Math.abs(value - target), span) / span);
}

export interface HeatScoreOptions {
  weights: HeatWeights;
  /** Fit lens (defaults: SEIFA decile near-middle — a configurable lens, not a claim about voters). */
  fitTarget?: number;
  fitSpan?: number;
  /** Community lens (defaults: higher share = hotter, i.e. target 100 over a 100-point span). */
  communityTarget?: number;
  communitySpan?: number;
}

/**
 * Score every SA1 in a boundary. Deterministic and order-independent: ranks are
 * computed over the whole input, output preserves input order.
 */
export function scoreCells(rows: RawHeatRow[], opts: HeatScoreOptions): { cells: HeatCellResult[]; meta: HeatMeta } {
  const weights = opts.weights;
  const fitTarget = opts.fitTarget ?? 5.5;
  const fitSpan = opts.fitSpan ?? 4.5;
  const communityTarget = opts.communityTarget ?? 100;
  const communitySpan = opts.communitySpan ?? 100;
  const totalWeight = HEAT_FACTORS.reduce((s, f) => s + Math.max(0, weights[f] ?? 0), 0);

  // ── Rank-normalised columns (within-boundary Hazen percentiles) ──────────
  const doorsRank = hazenRanks(rows.map((r) => r.doors));
  const densityRank = hazenRanks(
    rows.map((r) => (r.areaKm2 && r.areaKm2 > 0 ? r.doors / r.areaKm2 : null)),
  );
  const clusterRank = hazenRanks(
    rows.map((r) => (r.occupiedMbs > 0 ? r.doors / r.occupiedMbs : null)),
  );
  const contactDensityRank = hazenRanks(
    rows.map((r) => (r.doors > 0 && r.contacts > 0 ? r.contacts / r.doors : r.contacts > 0 ? 1 : null)),
  );

  const constantFactors: HeatFactor[] = [];
  if (rows.length > 1 && isConstant(rows.map((r) => r.doors))) constantFactors.push("doors");

  // Boundary-wide support share for empirical-Bayes shrinkage.
  const totalSupporters = rows.reduce((s, r) => s + r.supporters, 0);
  const totalDispositioned = rows.reduce((s, r) => s + r.dispositioned, 0);
  const boundaryShare = totalDispositioned > 0 ? totalSupporters / totalDispositioned : 0.5;

  const anyPoll = rows.some((r) => r.pollPercent != null);
  const anyBooth = rows.some((r) => r.competitiveness != null);
  const anyReferendum = rows.some((r) => r.referendumYesPct != null);
  const anyContacts = rows.some((r) => r.contacts > 0);

  const lowResolutionFactors: HeatMeta["lowResolutionFactors"] = [];
  if (anyPoll) lowResolutionFactors.push({ factor: "persuadability", component: "poll", resolution: "electorate" });
  if (!anyPoll && !anyBooth && anyReferendum) {
    lowResolutionFactors.push({ factor: "persuadability", component: "referendum", resolution: "ced" });
  }
  if (anyPoll && rows.length > 1 && isConstant(rows.map((r) => r.pollPercent)) && !anyBooth) {
    constantFactors.push("persuadability");
  }

  const factorCounts = Object.fromEntries(HEAT_FACTORS.map((f) => [f, 0])) as Record<HeatFactor, number>;
  if (anyReferendum && (weights.progressive ?? 0) > 0) {
    lowResolutionFactors.push({ factor: "progressive", component: "referendum", resolution: "ced" });
  }

  const scored = rows.map((row, i) => {
    const subScores: Partial<Record<HeatFactor, number>> = {};
    const flags: string[] = [];

    // doors — rank of boundary-clipped door count (always available; may be constant).
    subScores.doors = constantFactors.includes("doors") ? 0.5 : (doorsRank[i] ?? 0.5);

    // persuadability — mean of available components (poll soft share, booth competitiveness),
    // referendum closeness as the last-resort fallback.
    {
      const parts: number[] = [];
      if (row.pollPercent != null) {
        // A NET row (e.g. NET Support) reads as ambivalence via closeness-to-even;
        // a soft/undecided response % is already the ambivalence measure.
        parts.push(row.pollIsNet ? 1 - Math.min(Math.abs(row.pollPercent) / 100, 1) : Math.min(row.pollPercent / 100, 1));
      }
      if (row.competitiveness != null) {
        parts.push(Math.max(0, Math.min(1, row.competitiveness)));
        if (row.attributedVotes != null && row.attributedVotes < LOW_CONFIDENCE_VOTES) flags.push("low_confidence");
        if (row.attributedVotes == null) flags.push("interpolated_booths");
      }
      if (parts.length === 0 && row.referendumYesPct != null) {
        // Referendum closeness to 50 as a weak competitiveness proxy.
        parts.push(1 - Math.min(Math.abs(row.referendumYesPct - 50) / 25, 1));
      }
      if (parts.length > 0) {
        subScores.persuadability = parts.reduce((s, p) => s + p, 0) / parts.length;
      }
      if (row.electorateMajorityShare != null && row.electorateMajorityShare < 0.9) flags.push("splitAttribution");
    }

    // supporter — contact density rank ⊕ shrunken support share; booth aligned-party
    // FP share substitutes for the contact half when the tenant has no contacts here.
    {
      const parts: number[] = [];
      if (anyContacts && row.doors > 0) {
        const density = contactDensityRank[i];
        if (density != null) parts.push(density);
        if (row.dispositioned > 0 || totalDispositioned > 0) {
          const share = (row.supporters + SUPPORT_SHRINKAGE_M * boundaryShare) / (row.dispositioned + SUPPORT_SHRINKAGE_M);
          parts.push(Math.max(0, Math.min(1, share)));
        }
      }
      if (parts.length === 0 && row.alignedFpShare != null) {
        parts.push(Math.max(0, Math.min(1, row.alignedFpShare)));
      }
      if (parts.length > 0) subScores.supporter = parts.reduce((s, p) => s + p, 0) / parts.length;
    }

    // fit — near-target lens over the configured indicator; ABS suppression = unavailable.
    if (row.fitValue != null) subScores.fit = fitScore(row.fitValue, fitTarget, fitSpan);

    // community — the second demographic lens (default: CALD share, higher = hotter).
    if (row.communityValue != null) {
      subScores.community = fitScore(row.communityValue, communityTarget, communitySpan);
    }

    // progressive — 2023 Voice Yes share, anchored (division-resolution; badged in meta).
    if (row.referendumYesPct != null) {
      subScores.progressive = Math.max(0, Math.min(1, row.referendumYesPct / 100));
    }

    // informality — booth informal-vote share, anchored with a 15-point ceiling (the worst
    // divisions run ~14–17% informal; 15%+ maps to 1 so ordinary variation isn't crushed).
    if (row.informalityShare != null) {
      subScores.informality = Math.max(0, Math.min(1, row.informalityShare / 0.15));
    }

    // efficiency — 0.6·density rank + 0.4·clustering rank (needs at least one component).
    {
      const d = densityRank[i];
      const c = clusterRank[i];
      if (d != null && c != null) subScores.efficiency = 0.6 * d + 0.4 * c;
      else if (d != null) subScores.efficiency = d;
      else if (c != null) subScores.efficiency = c;
    }

    // freshness — exponential knock decay against doors; unavailable when the tenant
    // has no contacts anywhere in the boundary (cold universe: constant 1 ≡ dropped).
    if (anyContacts && row.doors > 0) {
      subScores.freshness = 1 - Math.min(1, row.knockDecay / row.doors);
    }

    const available = HEAT_FACTORS.filter((f) => subScores[f] != null && (weights[f] ?? 0) > 0);
    for (const f of available) factorCounts[f] += 1;

    const availableWeight = available.reduce((s, f) => s + weights[f], 0);
    let score: number | null = null;
    if (totalWeight > 0 && availableWeight / totalWeight >= MIN_AVAILABLE_WEIGHT_SHARE) {
      const blend = available.reduce((s, f) => s + weights[f] * (subScores[f] as number), 0) / availableWeight;
      const gate = Math.min(1, row.doors / GATE_DOORS);
      score = Math.max(0, Math.min(100, 100 * gate * blend));
    } else {
      flags.push("insufficient_data");
    }

    return {
      sa1Code: row.sa1Code,
      score,
      band: null as number | null,
      subScores,
      available,
      flags,
      coverageFraction: row.coverageFraction,
    };
  });

  // ── Within-boundary quantile breaks (five bands) over non-null scores ─────
  const nonNull = scored.map((c) => c.score).filter((s): s is number => s != null).sort((a, b) => a - b);
  const quantile = (q: number): number => {
    if (nonNull.length === 0) return 0;
    const pos = q * (nonNull.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return nonNull[lo] + (nonNull[hi] - nonNull[lo]) * (pos - lo);
  };
  const breaks = nonNull.length > 0 ? [quantile(0.2), quantile(0.4), quantile(0.6), quantile(0.8)] : [];
  for (const cell of scored) {
    if (cell.score == null) continue;
    cell.band = 1 + breaks.filter((b) => cell.score! > b).length;
  }

  const factorCoverage = Object.fromEntries(
    HEAT_FACTORS.map((f) => [f, rows.length > 0 ? factorCounts[f] / rows.length : 0]),
  ) as Record<HeatFactor, number>;

  return {
    cells: scored,
    meta: {
      weights,
      sa1Count: rows.length,
      breaks,
      factorCoverage,
      constantFactors,
      lowResolutionFactors,
    },
  };
}

/** Resolve a preset id + optional overrides into effective weights (unknown keys ignored). */
export function resolveWeights(preset: HeatPreset, overrides?: Partial<HeatWeights>): HeatWeights {
  const base = { ...HEAT_PRESETS[preset] };
  if (overrides) {
    for (const f of HEAT_FACTORS) {
      const v = overrides[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) base[f] = v;
    }
  }
  return base;
}
