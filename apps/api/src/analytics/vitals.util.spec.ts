import { MAX_VITALS_PER_BATCH, sanitiseVitals } from "./vitals.util";

describe("sanitiseVitals", () => {
  const vital = (over: Record<string, unknown> = {}) => ({
    metric: "lcp",
    value: 1234.5,
    route: "/walk/:id",
    connection: "4g",
    device: "mobile",
    ...over,
  });

  it("maps a valid entry to a namespaced metric with allowlisted labels", () => {
    expect(sanitiseVitals({ vitals: [vital()] })).toEqual([
      {
        metricName: "webvital.lcp",
        metricValue: 1234.5,
        labels: { route: "/walk/:id", connection: "4g", device: "mobile" },
      },
    ]);
  });

  it("returns empty for non-object bodies and missing/non-array vitals", () => {
    expect(sanitiseVitals(null)).toEqual([]);
    expect(sanitiseVitals("lcp")).toEqual([]);
    expect(sanitiseVitals({})).toEqual([]);
    expect(sanitiseVitals({ vitals: "nope" })).toEqual([]);
  });

  it("drops unknown metrics and non-finite/negative values", () => {
    const out = sanitiseVitals({
      vitals: [
        vital({ metric: "memory" }),
        vital({ value: Number.NaN }),
        vital({ value: Number.POSITIVE_INFINITY }),
        vital({ value: -5 }),
        vital({ value: "1200" }),
        null,
        "junk",
        vital({ metric: "CLS", value: 0.02 }),
      ],
    });
    // Only the case-insensitive CLS entry survives.
    expect(out).toEqual([
      {
        metricName: "webvital.cls",
        metricValue: 0.02,
        labels: { route: "/walk/:id", connection: "4g", device: "mobile" },
      },
    ]);
  });

  it("clamps values to per-metric ceilings", () => {
    const out = sanitiseVitals({
      vitals: [vital({ metric: "ttfb", value: 1e9 }), vital({ metric: "cls", value: 5000 })],
    });
    expect(out.map((v) => v.metricValue)).toEqual([600_000, 100]);
  });

  it("normalises routes: strips query/hash, caps length, defaults non-paths to /", () => {
    const out = sanitiseVitals({
      vitals: [
        vital({ route: "/turf?id=secret#frag" }),
        vital({ route: `/${"a".repeat(300)}` }),
        vital({ route: "https://evil.example" }),
        vital({ route: 42 }),
      ],
    });
    expect(out[0].labels.route).toBe("/turf");
    expect(out[1].labels.route).toHaveLength(100);
    expect(out[2].labels.route).toBe("/");
    expect(out[3].labels.route).toBe("/");
  });

  it("nulls labels outside the connection/device allowlists", () => {
    const [v] = sanitiseVitals({
      vitals: [vital({ connection: "5g", device: "smart-fridge" })],
    });
    expect(v.labels).toEqual({ route: "/walk/:id", connection: null, device: null });
  });

  it("caps a batch at MAX_VITALS_PER_BATCH entries", () => {
    const out = sanitiseVitals({ vitals: Array.from({ length: 50 }, () => vital()) });
    expect(out).toHaveLength(MAX_VITALS_PER_BATCH);
  });
});
