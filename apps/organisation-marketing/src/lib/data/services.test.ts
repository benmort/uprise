import { describe, expect, it } from "vitest";

import {
  getService,
  getServiceDetail,
  SERVICE_DETAILS,
  SERVICES,
  VISIBLE_SERVICES,
} from "./services";

describe("SERVICES catalogue", () => {
  it("has unique slugs and sequential numbering", () => {
    const slugs = SERVICES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(SERVICES.map((s) => s.no)).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it("has detail copy for every service in the catalogue", () => {
    for (const service of SERVICES) {
      const detail = SERVICE_DETAILS[service.slug];
      expect(detail).toBeDefined();
      expect(detail.deliverables.length).toBeGreaterThan(0);
      expect(detail.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("VISIBLE_SERVICES", () => {
  it("drops the services flagged hidden", () => {
    expect(VISIBLE_SERVICES.every((s) => !s.hidden)).toBe(true);
  });

  it("excludes exactly the hidden entries from the full catalogue", () => {
    const hidden = SERVICES.filter((s) => s.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    expect(VISIBLE_SERVICES.length).toBe(SERVICES.length - hidden.length);
    const visibleSlugs = new Set(VISIBLE_SERVICES.map((s) => s.slug));
    expect(visibleSlugs.has("rapid-response")).toBe(false);
    expect(visibleSlugs.has("brand-identity")).toBe(false);
    expect(visibleSlugs.has("campaign-websites")).toBe(true);
  });

  it("does not mutate the source catalogue", () => {
    expect(SERVICES.some((s) => s.hidden)).toBe(true);
  });
});

describe("getService", () => {
  it("finds a service by slug", () => {
    const service = getService("data-analytics");
    expect(service?.title).toBe("Data & Analytics");
    expect(service?.tags).toContain("Dashboards");
  });

  it("still resolves a hidden service from the full catalogue", () => {
    expect(getService("rapid-response")?.hidden).toBe(true);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getService("ghost-service")).toBeUndefined();
  });
});

describe("getServiceDetail", () => {
  it("returns the detail with a CTA for a known service", () => {
    const detail = getServiceDetail("campaign-websites");
    expect(detail?.cta.heading.length).toBeGreaterThan(0);
    expect(detail?.cta.button.length).toBeGreaterThan(0);
    expect(detail?.body.length).toBeGreaterThan(0);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getServiceDetail("ghost-service")).toBeUndefined();
  });
});
