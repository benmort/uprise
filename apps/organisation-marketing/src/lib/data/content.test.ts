import { describe, expect, it } from "vitest";

import { FAQS } from "./faqs";
import { FUNDERS_CTA, FUNDERS_FAQS, FUNDING_USES } from "./funders";
import { IMPACT_HIGHLIGHTS } from "./impact";
import { CAPABILITIES, HERO_WORDS, SITEMAP, STATS, VALUES } from "./site";

describe("site constants", () => {
  it("pairs a value with a label for every stat", () => {
    expect(STATS.length).toBeGreaterThan(0);
    for (const stat of STATS) {
      expect(stat.value.length).toBeGreaterThan(0);
      expect(stat.label.length).toBeGreaterThan(0);
    }
  });

  it("numbers the values 01..04 in order", () => {
    expect(VALUES.map((v) => v.no)).toEqual(["01", "02", "03", "04"]);
    expect(VALUES.every((v) => v.title.length > 0 && v.desc.length > 0)).toBe(true);
  });

  it("ends every rotating hero word with a full stop", () => {
    expect(HERO_WORDS.length).toBeGreaterThan(0);
    expect(HERO_WORDS.every((w) => w.endsWith("."))).toBe(true);
  });

  it("lists capabilities and links every sitemap entry to a root path", () => {
    expect(CAPABILITIES.length).toBeGreaterThan(0);
    expect(SITEMAP.length).toBeGreaterThan(0);
    for (const item of SITEMAP) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps sitemap hrefs unique", () => {
    const hrefs = SITEMAP.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("FAQ content", () => {
  it("gives every FAQ a question and an answer", () => {
    expect(FAQS.length).toBeGreaterThan(0);
    for (const faq of FAQS) {
      expect(faq.q.trim().length).toBeGreaterThan(0);
      expect(faq.a.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("funders content", () => {
  it("describes at least one funding use", () => {
    expect(FUNDING_USES.length).toBeGreaterThan(0);
    for (const use of FUNDING_USES) {
      expect(use.label.length).toBeGreaterThan(0);
      expect(use.desc.length).toBeGreaterThan(0);
    }
  });

  it("points every funders CTA button at an internal route", () => {
    expect(FUNDERS_CTA.buttons.length).toBeGreaterThan(0);
    for (const button of FUNDERS_CTA.buttons) {
      expect(button.href.startsWith("/")).toBe(true);
      expect(button.label.length).toBeGreaterThan(0);
    }
  });

  it("carries funder-facing FAQs", () => {
    expect(FUNDERS_FAQS.length).toBeGreaterThan(0);
    expect(FUNDERS_FAQS.every((f) => f.q.length > 0 && f.a.length > 0)).toBe(true);
  });
});

describe("impact highlights", () => {
  it("pairs a value with a label for every highlight", () => {
    expect(IMPACT_HIGHLIGHTS.length).toBeGreaterThan(0);
    for (const highlight of IMPACT_HIGHLIGHTS) {
      expect(highlight.value.length).toBeGreaterThan(0);
      expect(highlight.label.length).toBeGreaterThan(0);
    }
  });
});
