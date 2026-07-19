import {
  DEFAULT_ICC,
  EvaluationCluster,
  MIN_CLUSTERS_PER_ARM,
  MIN_OUTCOMES_PER_ARM_5PP,
  assignClusters,
  clusterPower,
  individualMde,
  subgroupAllowed,
} from "./evaluation";

function cluster(code: string, doors = 100, competitiveness: number | null = 0.5): EvaluationCluster {
  return { code, doors, competitiveness };
}

function clusters(n: number): EvaluationCluster[] {
  return Array.from({ length: n }, (_, i) => cluster(`sa1-${String(i).padStart(3, "0")}`, 80 + i, (i % 10) / 10));
}

describe("assignClusters", () => {
  it("pairs adjacent clusters after sorting on competitiveness then doors", () => {
    const input = [cluster("d", 100, 0.9), cluster("a", 100, 0.1), cluster("c", 100, 0.8), cluster("b", 100, 0.2)];
    const { pairs } = assignClusters(input, 42);
    const pairSets = pairs.map((p) => new Set([p.treatment, p.holdout]));
    // a+b are the two least competitive, c+d the most — matching never crosses.
    expect(pairSets.some((s) => s.has("a") && s.has("b"))).toBe(true);
    expect(pairSets.some((s) => s.has("c") && s.has("d"))).toBe(true);
  });

  it("is deterministic for a seed and independent of input order", () => {
    const base = clusters(20);
    const shuffled = [...base].reverse();
    const one = assignClusters(base, 7);
    const two = assignClusters(shuffled, 7);
    expect(two.treatmentCodes.sort()).toEqual(one.treatmentCodes.sort());
    expect(two.holdoutCodes.sort()).toEqual(one.holdoutCodes.sort());
  });

  it("different seeds produce different arm assignments (same pairs)", () => {
    const base = clusters(40);
    const a = assignClusters(base, 1);
    const b = assignClusters(base, 2);
    expect(a.treatmentCodes.sort()).not.toEqual(b.treatmentCodes.sort());
    // Pairing itself is seed-independent (it's the sort), only the coin flips differ.
    const pairKey = (p: { treatment: string; holdout: string }) => [p.treatment, p.holdout].sort().join("|");
    expect(a.pairs.map(pairKey).sort()).toEqual(b.pairs.map(pairKey).sort());
  });

  it("assigns an odd cluster out to treatment, never to a wasted control", () => {
    const { unpaired, treatmentCodes, holdoutCodes } = assignClusters(clusters(21), 3);
    expect(unpaired).not.toBeNull();
    expect(treatmentCodes).toContain(unpaired!);
    expect(holdoutCodes).not.toContain(unpaired!);
    expect(treatmentCodes.length).toBe(11);
    expect(holdoutCodes.length).toBe(10);
  });

  it("every cluster lands in exactly one arm", () => {
    const base = clusters(30);
    const { treatmentCodes, holdoutCodes } = assignClusters(base, 9);
    const all = [...treatmentCodes, ...holdoutCodes].sort();
    expect(all).toEqual(base.map((c) => c.code).sort());
  });
});

describe("clusterPower", () => {
  it("computes the design effect 1+(m−1)ρ and the MDE from the effective n", () => {
    // 40 clusters of 100 doors, ICC .03 → DEFF = 1 + 99·.03 = 3.97;
    // per arm: 20×100/3.97 ≈ 503.8 effective → MDE = √(7.849·0.5/503.8)·100 ≈ 8.8pp.
    const est = clusterPower(Array.from({ length: 40 }, (_, i) => cluster(`c${i}`, 100)));
    expect(est.designEffect).toBeCloseTo(1 + 99 * DEFAULT_ICC, 2);
    expect(est.effectivePerArm).toBe(Math.round((20 * 100) / (1 + 99 * DEFAULT_ICC)));
    expect(est.mdePercentagePoints).toBeCloseTo(8.8, 0);
  });

  it("refuses below the minimum clusters per arm", () => {
    const est = clusterPower(clusters(MIN_CLUSTERS_PER_ARM * 2 - 2));
    expect(est.refusal).toContain("Too few clusters");
  });

  it("warns (not refuses) between the floor and the recommended count", () => {
    const est = clusterPower(clusters(60)); // 30/arm
    expect(est.refusal).toBeNull();
    expect(est.warning).toContain("30 clusters per arm");
  });

  it("passes clean at 160+ clusters", () => {
    const est = clusterPower(clusters(180));
    expect(est.refusal).toBeNull();
    expect(est.warning).toBeNull();
  });

  it("a custom ICC changes the design effect", () => {
    const flat = clusterPower(clusters(60), { icc: 0 });
    expect(flat.designEffect).toBe(1);
  });
});

describe("individualMde + subgroupAllowed (small-n honesty)", () => {
  it("reproduces the documented floors: ~1,600/arm ⇒ ~5pp; ~9,800/arm ⇒ ~2pp", () => {
    expect(individualMde(1_600)).toBeCloseTo(5.0, 0);
    expect(individualMde(9_800)).toBeCloseTo(2.0, 0);
  });

  it("refuses subgroup analysis under the floor with an actionable message", () => {
    const verdict = subgroupAllowed(MIN_OUTCOMES_PER_ARM_5PP - 1);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("program-level effect");
    expect(subgroupAllowed(MIN_OUTCOMES_PER_ARM_5PP).allowed).toBe(true);
  });

  it("degenerate inputs return Infinity, never a fake power claim", () => {
    expect(individualMde(0)).toBe(Infinity);
  });
});
