import { describe, it, expect } from "vitest";

import {
  ALL_ROWS,
  AS_AT,
  COMPARISON_GROUPS,
  HORIZON_LABEL,
  plannedByHorizon,
  type ComparisonRow,
} from "./comparison";

const VENDOR_CELLS = ALL_ROWS.flatMap((r) => [r.actionNetwork, r.nationBuilder]);

/** Every authored string on the page's data, for the copy rules. */
const ALL_STRINGS = ALL_ROWS.flatMap((r) => [
  r.area,
  r.actionNetwork.note,
  r.nationBuilder.note,
  r.upriseToday.note,
  ...(r.uprisePlanned ? [r.uprisePlanned.note] : []),
]);

describe("citing the competitors", () => {
  it("backs every competitor claim with a public source", () => {
    // This page names two other vendors. An uncited claim about them must never ship — a reader
    // has to be able to check it, and we have to be able to defend it.
    for (const cell of VENDOR_CELLS) {
      expect(cell.source).toMatch(/^https:\/\//);
      expect(cell.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries an as-at date, because these products change", () => {
    expect(AS_AT).toMatch(/\d{4}$/);
  });

  it("never claims a vendor lacks a security certification", () => {
    // Absence of a published attestation is not absence of certification. The distinction matters
    // legally and reputationally, and it applies to us equally.
    for (const s of ALL_STRINGS) {
      expect(s).not.toMatch(/\b(SOC ?2|ISO ?27001|certified|accredited|approved|endorsed)\b/i);
    }
  });

  it("does not publish the claims the research flagged as unsafe", () => {
    const joined = ALL_STRINGS.join(" ").toLowerCase();
    // Payment rates vary by tier, country and charity status; quoting one reads as the rate.
    expect(joined).not.toMatch(/4\.9\s?%/);
    // Only the database is evidenced in-region; compute is not pinned, so residency is not a claim.
    expect(joined).not.toMatch(/data residency|sovereign|hosted in australia/);
    // Send-rate figures depend on a queue flag that defaults off.
    expect(joined).not.toMatch(/\d[\d,]*\s*(messages|sms)\s*(per|\/)\s*(second|minute|hour)/);
  });

  it("qualifies NationBuilder texting rather than flattening it to US-only", () => {
    // The support article says US and Canada; a May 2026 release note also lists the UK. Saying
    // only the first would understate a competitor, which is the same sin as overstating ourselves.
    const row = ALL_ROWS.find((r) => r.area === "SMS broadcasts");
    expect(row?.nationBuilder.note).toMatch(/UK|United Kingdom/);
  });
});

describe("grading ourselves honestly", () => {
  it("gives every non-shipped Uprise row a plan", () => {
    // A gap with no stated intent reads as an oversight. Either we are shipping it, or we say
    // where it sits — including saying plainly that we are not going to build it.
    for (const row of ALL_ROWS) {
      if (row.upriseToday.status !== "shipped") {
        expect(row.uprisePlanned, `${row.area} has no plan`).toBeDefined();
      }
    }
  });

  it("counts built-but-switched-off capabilities as absent today", () => {
    // WhatsApp, journeys and the public API all exist in the codebase and none can be reached by
    // a customer. Grading them shipped is exactly how a comparison page starts lying.
    for (const area of ["WhatsApp", "Automation", "Public API"]) {
      const row = ALL_ROWS.find((r) => r.area === area);
      expect(row?.upriseToday.status, `${area} should not read as shipped`).toBe("absent");
      expect(row?.uprisePlanned).toBeDefined();
    }
  });

  it("does not claim email, petitions or fundraising", () => {
    // The three capabilities the pricing page used to assert and the product does not have.
    for (const area of ["Email broadcasts", "Petitions and forms", "Fundraising"]) {
      const row = ALL_ROWS.find((r) => r.area === area);
      expect(row?.upriseToday.status, area).toBe("absent");
    }
  });

  it("admits where both competitors are ahead", () => {
    // If no row favours them, nobody believes any row that favours us.
    const behind = ALL_ROWS.filter(
      (r) =>
        r.upriseToday.status === "absent" &&
        r.actionNetwork.status === "shipped" &&
        r.nationBuilder.status === "shipped",
    );
    expect(behind.length).toBeGreaterThanOrEqual(3);
  });

  it("states an opt-out rather than inventing parity", () => {
    // "Parity or better on everything" would not be true: we are not building a website CMS or a
    // donation processor. Saying so is more credible than a roadmap entry nobody intends to do.
    expect(plannedByHorizon("not-our-lane").length).toBeGreaterThan(0);
  });
});

describe("table integrity", () => {
  it("has unique area names and no empty groups", () => {
    const areas = ALL_ROWS.map((r) => r.area);
    expect(new Set(areas).size).toBe(areas.length);
    for (const g of COMPARISON_GROUPS) expect(g.rows.length).toBeGreaterThan(0);
  });

  it("labels every horizon it uses", () => {
    for (const row of ALL_ROWS) {
      if (row.uprisePlanned) expect(HORIZON_LABEL[row.uprisePlanned.horizon]).toBeTruthy();
    }
  });

  it("only marks a competitor absent, never unknown-as-absent", () => {
    // "absent" asserts the vendor does not offer it and needs their documentation behind it;
    // anything we merely could not find is "unclear".
    const unclear = VENDOR_CELLS.filter((c) => c.status === "unclear");
    for (const cell of unclear) expect(cell.note).toMatch(/not confirmed|unclear|could not/i);
  });

  it("returns only matching rows from plannedByHorizon", () => {
    for (const h of ["next", "later", "exploring", "not-our-lane"] as const) {
      for (const row of plannedByHorizon(h)) expect(row.uprisePlanned?.horizon).toBe(h);
    }
  });
});

describe("house copy rules", () => {
  it("uses en-dashes, never em-dashes", () => {
    expect(ALL_STRINGS.filter((s) => s.includes("—"))).toEqual([]);
  });

  it("uses no exclamation marks", () => {
    expect(ALL_STRINGS.filter((s) => s.includes("!"))).toEqual([]);
  });

  it("uses Australian spelling", () => {
    const offenders = ALL_STRINGS.filter((s: string) =>
      /\b\w+iz(e|ing|ed|ation)\b|\bcolor\b|\bcenter\b|\borganiz/i.test(s),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the shape the page depends on", () => {
  it("exposes rows through groups and the flat list identically", () => {
    const fromGroups: ComparisonRow[] = COMPARISON_GROUPS.flatMap((g) => g.rows);
    expect(ALL_ROWS).toEqual(fromGroups);
  });
});
