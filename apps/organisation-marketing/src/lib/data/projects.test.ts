import { describe, expect, it } from "vitest";

import { CASE_DETAILS, getCaseDetail, getProject, PROJECTS } from "./projects";

describe("PROJECTS index", () => {
  it("lists projects with unique slugs", () => {
    const slugs = PROJECTS.map((p) => p.slug);
    expect(slugs.length).toBeGreaterThan(0);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has a case-study detail for every listed project", () => {
    for (const project of PROJECTS) {
      expect(CASE_DETAILS[project.slug]).toBeDefined();
    }
  });

  it("does not carry an orphan case detail without a project", () => {
    const projectSlugs = new Set(PROJECTS.map((p) => p.slug));
    for (const slug of Object.keys(CASE_DETAILS)) {
      expect(projectSlugs.has(slug)).toBe(true);
    }
  });
});

describe("getProject", () => {
  it("finds a project by slug", () => {
    const project = getProject("uprise");
    expect(project?.name).toBe("Uprise");
    expect(project?.tag).toBe("Platform");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProject("nonexistent")).toBeUndefined();
  });
});

describe("getCaseDetail", () => {
  it("returns the detail object for a known project", () => {
    const detail = getCaseDetail("climate-200");
    expect(detail).toBeDefined();
    expect(detail?.client).toBe("Climate 200");
    expect(detail?.results.length).toBeGreaterThan(0);
    expect(detail?.results[0]).toHaveProperty("value");
    expect(detail?.results[0]).toHaveProperty("label");
  });

  it("returns undefined when there is no detail for the slug", () => {
    expect(getCaseDetail("nope")).toBeUndefined();
  });

  it("keeps a stack and a gallery for each case", () => {
    for (const slug of Object.keys(CASE_DETAILS)) {
      const detail = getCaseDetail(slug);
      expect(detail?.stack.length).toBeGreaterThan(0);
      expect(detail?.gallery.length).toBeGreaterThan(0);
      expect(detail?.quote.text.length).toBeGreaterThan(0);
    }
  });
});
