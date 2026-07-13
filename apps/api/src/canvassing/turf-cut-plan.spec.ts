import { autoTurfName, orderByLocality, planTurfs, type PlannerBlock } from "./turf-cut-plan";

const mb = (code: string, addresses: number, name: string | null = code): PlannerBlock => ({ code, name, addresses });

describe("orderByLocality", () => {
  it("keeps a spatial cluster contiguous (no interleaving)", () => {
    // Two tight clusters far apart on longitude; ordering must not interleave them.
    const blocks: PlannerBlock[] = [
      { code: "L1", name: "L1", addresses: 10, lat: -37.8, lng: 144.9 },
      { code: "R1", name: "R1", addresses: 10, lat: -37.8, lng: 145.9 },
      { code: "L2", name: "L2", addresses: 10, lat: -37.801, lng: 144.9 },
      { code: "R2", name: "R2", addresses: 10, lat: -37.801, lng: 145.9 },
    ];
    const order = orderByLocality(blocks).map((b) => b.code);
    const lefts = [order.indexOf("L1"), order.indexOf("L2")].sort((a, b) => a - b);
    // The two left blocks land next to each other (indices differ by 1) — cluster preserved.
    expect(lefts[1]! - lefts[0]!).toBe(1);
  });

  it("falls back to name order when centroids are missing", () => {
    const order = orderByLocality([mb("b", 1, "Beta"), mb("a", 1, "Alpha")]).map((b) => b.code);
    expect(order).toEqual(["a", "b"]);
  });

  it("returns every block", () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({
      code: `m${i}`, name: `m${i}`, addresses: 10, lat: -37.8 + i * 0.001, lng: 144.9 + (i % 3) * 0.001,
    }));
    expect(orderByLocality(blocks)).toHaveLength(20);
  });
});

describe("autoTurfName", () => {
  it("names by the mesh-block names, admin-style", () => {
    expect(autoTurfName(["Kew · N"])).toBe("Kew · N");
    expect(autoTurfName(["Kew · N", "Kew · S"])).toBe("Kew · N + Kew · S");
    expect(autoTurfName(["Kew · N", "Kew · S", "Kew · E"])).toBe("Kew · N + 2 more");
  });
  it("skips blanks and falls back", () => {
    expect(autoTurfName([null, "  ", "Kew · N"])).toBe("Kew · N");
    expect(autoTurfName([null, undefined, ""])).toBe("Untitled turf");
  });
});

describe("planTurfs", () => {
  it("packs blocks into turfs within [min,max]", () => {
    // 6 blocks × 20 = 120 → two turfs of 60 each.
    const plans = planTurfs(
      Array.from({ length: 6 }, (_, i) => mb(`m${i}`, 20)),
      { min: 60, max: 100 },
    );
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.addresses)).toEqual([60, 60]);
    expect(plans.every((p) => !p.outOfRange)).toBe(true);
  });

  it("starts a new turf only once the current one meets min", () => {
    // 40 + 40 = 80 (≥min, <max) then +40 would hit 120>max → flush at 80; last 40 tail merges back.
    const plans = planTurfs([mb("a", 40), mb("b", 40), mb("c", 40)], { min: 60, max: 100 });
    expect(plans).toHaveLength(1); // 80 then a 40 tail (<min) merged in → 120, one turf
    expect(plans[0]!.addresses).toBe(120);
  });

  it("drops zero-address blocks", () => {
    const plans = planTurfs([mb("a", 0), mb("b", 80), mb("c", 0)], { min: 60, max: 100 });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.codes).toEqual(["b"]);
  });

  it("makes an oversized mesh block its own flagged turf", () => {
    const plans = planTurfs([mb("big", 250), mb("a", 70)], { min: 60, max: 100 });
    expect(plans).toHaveLength(2);
    const big = plans.find((p) => p.codes.includes("big"))!;
    expect(big.addresses).toBe(250);
    expect(big.outOfRange).toBe(true);
    expect(plans.find((p) => p.codes.includes("a"))!.outOfRange).toBe(false);
  });

  it("merges a too-small tail into the previous turf", () => {
    // 80 (turf 1) then 30 tail (<min) → merged → 110.
    const plans = planTurfs([mb("a", 45), mb("b", 45), mb("c", 30)], { min: 60, max: 100 });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.addresses).toBe(120);
  });

  it("keeps a whole campaign below min as one flagged turf", () => {
    const plans = planTurfs([mb("a", 20), mb("b", 15)], { min: 60, max: 100 });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.addresses).toBe(35);
    expect(plans[0]!.outOfRange).toBe(true);
  });

  it("names each turf from its blocks", () => {
    const plans = planTurfs([mb("m1", 80, "Kew · N"), mb("m2", 80, "Kew · S")], { min: 60, max: 100 });
    expect(plans.map((p) => p.name)).toEqual(["Kew · N", "Kew · S"]);
  });
});
