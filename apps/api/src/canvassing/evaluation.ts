/**
 * Evaluation mode — PURE module (no DB, no Nest): pair-matched cluster randomisation
 * and the power calculator behind "evaluation mode" at walklist time.
 *
 * Design, from the field-experiment literature:
 * - Comparing canvassed to un-canvassed areas conflates treatment with targeting
 *   (Gerber/Green selection bias — it does not shrink with n). Causal claims need a
 *   randomised holdout, assigned BEFORE work starts and immutable afterwards.
 * - Without electoral-roll access (s91B), the unit is the SA1 cluster and the outcome
 *   is booth-level results / canvass IDs — the Arceneaux precinct template. Clusters
 *   are PAIR-MATCHED on prior competitiveness + doors before randomising, which cuts
 *   between-cluster variance where it lives.
 * - Cluster designs pay a design effect DEFF = 1 + (m − 1)ρ. Power comes from the
 *   number of clusters, not their size — the calculator surfaces that before launch.
 * - Small-n honesty: below the documented floors the module REFUSES the design rather
 *   than blessing an unpowered experiment.
 */

/** Two-sided α = .05, power = .80 → (z_{α/2} + z_β)² ≈ 7.849; the familiar 2.8·√(2p(1−p)/n). */
const POWER_CONSTANT = 7.849;
/** Default intra-cluster correlation for turnout-type outcomes (literature range .01–.05). */
export const DEFAULT_ICC = 0.03;
/** Below this many clusters per arm a cluster design is refused (norm: plan for 80–100+). */
export const MIN_CLUSTERS_PER_ARM = 8;
/** Warn (don't refuse) below this — the literature's "plan for 80–100+ clusters" norm. */
export const RECOMMENDED_CLUSTERS_PER_ARM = 80;
/** Individual-outcome floors: ~1,600 surveyed outcomes/arm detects 5pp; ~4,360 detects 3pp. */
export const MIN_OUTCOMES_PER_ARM_5PP = 1_600;

export interface EvaluationCluster {
  /** SA1 code (or any stable cluster id). */
  code: string;
  /** Doors in the cluster (cluster size m for the design effect). */
  doors: number;
  /** Matching covariate: prior competitiveness/2CP-derived score (0–1); null → matched on doors only. */
  competitiveness: number | null;
}

export interface EvaluationAssignment {
  /** Ordered pairs; within each pair one code is treatment, one holdout. */
  pairs: Array<{ treatment: string; holdout: string }>;
  /** Odd cluster out (always assigned to treatment — never waste a door on an unpaired control). */
  unpaired: string | null;
  treatmentCodes: string[];
  holdoutCodes: string[];
  seed: number;
}

export interface PowerEstimate {
  clustersPerArm: number;
  meanClusterSize: number;
  designEffect: number;
  /** Effective sample size per arm after the design effect. */
  effectivePerArm: number;
  /** Minimum detectable effect (percentage points, ITT) at 80% power / α .05, baseline 50%. */
  mdePercentagePoints: number;
  /** Guard verdicts the UI must respect. */
  refusal: string | null;
  warning: string | null;
}

/** xorshift32 — deterministic, seedable; Math.random is banned in reproducible assignment. */
function xorshift32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

/**
 * Pair-match clusters (sort by competitiveness then doors, take adjacent pairs) and
 * randomise arms within each pair. Deterministic for a given (clusters, seed):
 * shuffling input order changes nothing.
 */
export function assignClusters(clusters: EvaluationCluster[], seed: number): EvaluationAssignment {
  const sorted = [...clusters].sort(
    (a, b) =>
      (a.competitiveness ?? 0.5) - (b.competitiveness ?? 0.5) ||
      a.doors - b.doors ||
      a.code.localeCompare(b.code),
  );
  const rand = xorshift32(seed);
  const pairs: Array<{ treatment: string; holdout: string }> = [];
  const treatmentCodes: string[] = [];
  const holdoutCodes: string[] = [];
  let unpaired: string | null = null;

  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    const aTreated = rand() < 0.5;
    const pair = aTreated ? { treatment: a.code, holdout: b.code } : { treatment: b.code, holdout: a.code };
    pairs.push(pair);
    treatmentCodes.push(pair.treatment);
    holdoutCodes.push(pair.holdout);
  }
  if (sorted.length % 2 === 1) {
    unpaired = sorted[sorted.length - 1].code;
    treatmentCodes.push(unpaired);
  }
  return { pairs, unpaired, treatmentCodes, holdoutCodes, seed };
}

/**
 * Cluster-design power: MDE (pp) for a binary outcome at baseline p = .5, adjusted by
 * the design effect. Refuses designs the literature calls unpowered; warns below the
 * recommended cluster count.
 */
export function clusterPower(
  clusters: EvaluationCluster[],
  opts: { icc?: number } = {},
): PowerEstimate {
  const icc = opts.icc ?? DEFAULT_ICC;
  const clustersPerArm = Math.floor(clusters.length / 2);
  const totalDoors = clusters.reduce((s, c) => s + c.doors, 0);
  const meanClusterSize = clusters.length > 0 ? totalDoors / clusters.length : 0;
  const designEffect = 1 + Math.max(0, meanClusterSize - 1) * icc;
  const rawPerArm = clustersPerArm * meanClusterSize;
  const effectivePerArm = designEffect > 0 ? rawPerArm / designEffect : 0;
  const p = 0.5;
  const mde =
    effectivePerArm > 0 ? Math.sqrt((POWER_CONSTANT * 2 * p * (1 - p)) / effectivePerArm) * 100 : Infinity;

  let refusal: string | null = null;
  let warning: string | null = null;
  if (clustersPerArm < MIN_CLUSTERS_PER_ARM) {
    refusal = `Too few clusters: ${clustersPerArm} per arm (minimum ${MIN_CLUSTERS_PER_ARM}). Power comes from the number of clusters, not their size — widen the boundary or skip evaluation.`;
  } else if (clustersPerArm < RECOMMENDED_CLUSTERS_PER_ARM) {
    warning = `${clustersPerArm} clusters per arm detects only ~${mde.toFixed(1)}pp — professional designs plan for ${RECOMMENDED_CLUSTERS_PER_ARM}+ per arm. Usable for large effects; do not expect to read persuasion (1–3pp) from this.`;
  }

  return {
    clustersPerArm,
    meanClusterSize: Number(meanClusterSize.toFixed(1)),
    designEffect: Number(designEffect.toFixed(2)),
    effectivePerArm: Math.round(effectivePerArm),
    mdePercentagePoints: Number(mde.toFixed(1)),
    refusal,
    warning,
  };
}

/** Individual-outcome MDE (pp) for n surveyed outcomes per arm (panel/placebo designs). */
export function individualMde(nPerArm: number, baseline = 0.5): number {
  if (nPerArm <= 0) return Infinity;
  return Number((Math.sqrt((POWER_CONSTANT * 2 * baseline * (1 - baseline)) / nPerArm) * 100).toFixed(1));
}

/** Subgroup-analysis guard: refuse below the documented floor (≈1,600/arm for 5pp). */
export function subgroupAllowed(nPerArm: number): { allowed: boolean; reason: string | null } {
  if (nPerArm >= MIN_OUTCOMES_PER_ARM_5PP) return { allowed: true, reason: null };
  return {
    allowed: false,
    reason: `Subgroup analysis needs ≥${MIN_OUTCOMES_PER_ARM_5PP.toLocaleString()} surveyed outcomes per arm to detect 5pp; you have ${nPerArm.toLocaleString()}. Report the program-level effect with its confidence interval and stop.`,
  };
}
