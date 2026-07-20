import { describe, expect, it } from "vitest";
import { createVitalsBuffer, deviceClass, normaliseRoute } from "./vitals";

describe("normaliseRoute", () => {
  it("collapses cuid, uuid and numeric segments to :id", () => {
    expect(normaliseRoute("/cmc4x2h9a0001lm08qwerty12/door/42")).toBe("/:id/door/:id");
    expect(normaliseRoute("/f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe("/:id");
  });

  it("leaves static segments alone and strips query/hash", () => {
    expect(normaliseRoute("/get-turf?campaignId=abc#x")).toBe("/get-turf");
    expect(normaliseRoute("/")).toBe("/");
    expect(normaliseRoute("/shifts")).toBe("/shifts");
  });

  it("defaults non-path input to /", () => {
    expect(normaliseRoute("not-a-path")).toBe("/");
    expect(normaliseRoute("")).toBe("/");
  });
});

describe("deviceClass", () => {
  it("classifies phone, tablet and desktop user-agents", () => {
    expect(deviceClass("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile")).toBe("mobile");
    expect(deviceClass("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(deviceClass("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
  });
});

describe("createVitalsBuffer", () => {
  const ctx = { connection: "4g", device: "mobile" };

  it("buffers known metrics with their route and drains them once", () => {
    const buf = createVitalsBuffer();
    buf.add({ id: "a", name: "LCP", value: 1800 }, "/");
    buf.add({ id: "b", name: "TTFB", value: 120 }, "/:id");
    expect(buf.drain(ctx)).toEqual({
      vitals: [
        { metric: "lcp", value: 1800, route: "/", connection: "4g", device: "mobile" },
        { metric: "ttfb", value: 120, route: "/:id", connection: "4g", device: "mobile" },
      ],
    });
    // Drained — a second flush has nothing to send.
    expect(buf.drain(ctx)).toBeNull();
  });

  it("keeps the latest value when a metric re-reports under the same id (CLS growth)", () => {
    const buf = createVitalsBuffer();
    buf.add({ id: "cls-1", name: "CLS", value: 0.01 }, "/");
    buf.add({ id: "cls-1", name: "CLS", value: 0.07 }, "/");
    expect(buf.drain(ctx)?.vitals).toEqual([
      { metric: "cls", value: 0.07, route: "/", connection: "4g", device: "mobile" },
    ]);
  });

  it("ignores Next custom metrics, unknown names and non-finite values", () => {
    const buf = createVitalsBuffer();
    buf.add({ id: "n1", name: "Next.js-hydration", value: 300 }, "/");
    buf.add({ id: "n2", name: "FID", value: 10 }, "/");
    buf.add({ id: "n3", name: "LCP", value: Number.NaN }, "/");
    expect(buf.drain(ctx)).toBeNull();
  });
});
