import {
  baseCode,
  cleanTitle,
  evidenceOf,
  groupQuestions,
  rankLabel,
  themeOf,
  themeRank,
  THEMES,
  VIC_TREATY_SLUG,
  type RawQuestion,
} from "./question-taxonomy";

const q = (code: string, title: string, over: Partial<RawQuestion> = {}): RawQuestion => ({
  code,
  title,
  category: "treaty",
  hasNet: false,
  responseKind: "single_choice",
  ...over,
});

describe("question taxonomy", () => {
  describe("baseCode", () => {
    it("strips the ingest's -N block suffix", () => {
      expect(baseCode("C1-2")).toBe("C1");
      expect(baseCode("C3_1-2")).toBe("C3_1");
      expect(baseCode("D6-2")).toBe("D6");
    });

    it("leaves an underscore-numbered code alone", () => {
      expect(baseCode("C3_12")).toBe("C3_12");
      expect(baseCode("D10")).toBe("D10");
    });
  });

  describe("themeOf", () => {
    it("maps every code of the VIC treaty instrument", () => {
      expect(themeOf(VIC_TREATY_SLUG, "B1")).toBe("party_voting");
      expect(themeOf(VIC_TREATY_SLUG, "C1")).toBe("issues_salience");
      expect(themeOf(VIC_TREATY_SLUG, "C4")).toBe("treaty_awareness");
      expect(themeOf(VIC_TREATY_SLUG, "C5")).toBe("treaty_support");
      expect(themeOf(VIC_TREATY_SLUG, "E1")).toBe("treaty_support");
      expect(themeOf(VIC_TREATY_SLUG, "D5")).toBe("treaty_case_for");
      expect(themeOf(VIC_TREATY_SLUG, "D6")).toBe("treaty_case_for");
      expect(themeOf(VIC_TREATY_SLUG, "D7")).toBe("treaty_case_against");
      expect(themeOf(VIC_TREATY_SLUG, "D10")).toBe("treaty_case_against");
      expect(themeOf(VIC_TREATY_SLUG, "E3")).toBe("treaty_electoral");
      expect(themeOf(VIC_TREATY_SLUG, "E5")).toBe("treaty_racism");
    });

    it("resolves the whole C3_* battery by prefix", () => {
      for (let i = 1; i <= 12; i++) {
        expect(themeOf(VIC_TREATY_SLUG, `C3_${i}`)).toBe("issues_competence");
      }
    });

    it("resolves a -N block to its base question's theme", () => {
      expect(themeOf(VIC_TREATY_SLUG, "C1-2")).toBe("issues_salience");
      expect(themeOf(VIC_TREATY_SLUG, "C3_1-2")).toBe("issues_competence");
      expect(themeOf(VIC_TREATY_SLUG, "D6-2")).toBe("treaty_case_for");
    });

    it("refuses to guess for another poll's identical codes", () => {
      expect(themeOf("some-other-poll", "C5")).toBeNull();
      expect(themeOf(null, "C5")).toBeNull();
      expect(themeOf(undefined, "C5")).toBeNull();
    });

    it("returns null for an unknown code in a known poll", () => {
      expect(themeOf(VIC_TREATY_SLUG, "Z9")).toBeNull();
      expect(themeOf(VIC_TREATY_SLUG, "C2")).toBeNull();
    });

    it("names only themes that exist in THEMES", () => {
      const keys = new Set(THEMES.map((t) => t.key));
      const codes = ["B1", "B2", "B3", "C1", "C3_7", "C4", "C5", "D1", "D6", "D9", "E1", "E2", "E4"];
      for (const c of codes) expect(keys.has(themeOf(VIC_TREATY_SLUG, c)!)).toBe(true);
    });
  });

  describe("themeRank", () => {
    it("orders themes as declared, sinking unknown and null", () => {
      expect(themeRank("treaty_support")).toBe(0);
      expect(themeRank("issues_competence")).toBe(THEMES.length - 1);
      expect(themeRank("nope")).toBe(THEMES.length);
      expect(themeRank(null)).toBe(THEMES.length);
    });

    it("declares the before/after pair as codes the poll actually has", () => {
      const compare = THEMES.find((t) => t.key === "treaty_support")!.compare!;
      expect(compare).toMatchObject({ before: "C5", after: "E1" });
      // Both must resolve to the theme that declares the comparison, or the client
      // will look for them in the wrong block.
      expect(themeOf(VIC_TREATY_SLUG, compare.before)).toBe("treaty_support");
      expect(themeOf(VIC_TREATY_SLUG, compare.after)).toBe("treaty_support");
    });

    it("declares a comparison on no other theme", () => {
      expect(THEMES.filter((t) => t.compare).map((t) => t.key)).toEqual(["treaty_support"]);
    });

    it("puts every treaty theme before every background theme", () => {
      const treaty = THEMES.filter((t) => t.category === "treaty").map((t) => themeRank(t.key));
      const background = THEMES.filter((t) => t.category === "polling_background").map((t) => themeRank(t.key));
      expect(Math.max(...treaty)).toBeLessThan(Math.min(...background));
    });
  });

  describe("cleanTitle", () => {
    it("strips the code prefix and the banner suffix", () => {
      expect(cleanTitle("C4. Victoria agreed a treaty process by BANNER COMMON THREADS", "C4")).toBe(
        "Victoria agreed a treaty process",
      );
    });

    it("strips the RANKED marker, which is surfaced as the variant label instead", () => {
      expect(
        cleanTitle("C1. Which issue is most important? RANKED TOP 3 by BANNER COMMON THREADS", "C1-2"),
      ).toBe("Which issue is most important?");
      expect(cleanTitle("D6. Strongest reason? RANKED FIRST by BANNER COMMON THREADS", "D6")).toBe(
        "Strongest reason?",
      );
    });

    it("uses the base code, so a -N block still loses its prefix", () => {
      expect(cleanTitle("C3_1. Managing the economy by BANNER COMMON THREADS", "C3_1-2")).toBe(
        "Managing the economy",
      );
    });

    it("restores the space in a run-on sentence (full stop glued to the next capital)", () => {
      expect(cleanTitle("C5. Addresses injustices.It supports self-determination by BANNER X", "C5")).toBe(
        "Addresses injustices. It supports self-determination",
      );
    });

    it("strips a bare NET block marker, which `hasNet` already records", () => {
      expect(cleanTitle("B1. Who would you vote for? NET by BANNER COMMON THREADS", "B1")).toBe(
        "Who would you vote for?",
      );
    });

    it("strips stacked trailing markers", () => {
      expect(cleanTitle("B1. Who would you vote for? NET RANKED FIRST by BANNER X", "B1")).toBe(
        "Who would you vote for?",
      );
    });

    it("keeps NET when it is part of the question, not a trailing marker", () => {
      expect(cleanTitle("C9. Is the NET benefit positive? by BANNER X", "C9")).toBe(
        "Is the NET benefit positive?",
      );
    });

    it("leaves an already-clean title untouched", () => {
      expect(cleanTitle("Do you support a Treaty?", "C5")).toBe("Do you support a Treaty?");
    });
  });

  describe("rankLabel", () => {
    it("reads the rank marker", () => {
      expect(rankLabel("C1. Issue? RANKED FIRST by BANNER X")).toBe("Ranked first");
      expect(rankLabel("C1. Issue? RANKED TOP 3 by BANNER X")).toBe("Ranked top 3");
      expect(rankLabel("D6. Reason? RANKED TOP 2 by BANNER X")).toBe("Ranked top 2");
    });

    it("tolerates a missing space after TOP", () => {
      expect(rankLabel("C1. Issue? RANKED TOP3 by BANNER X")).toBe("Ranked top 3");
    });

    it("is null when there is no marker", () => {
      expect(rankLabel("C5. Do you support a Treaty? by BANNER X")).toBeNull();
    });
  });

  describe("groupQuestions", () => {
    it("collapses a genuine variant onto its base row", () => {
      const rows = groupQuestions(VIC_TREATY_SLUG, [
        q("C1", "C1. Most important issue? RANKED FIRST by BANNER COMMON THREADS"),
        q("C1-2", "C1. Most important issue? RANKED TOP 3 by BANNER COMMON THREADS"),
      ]);

      expect(rows).toHaveLength(1);
      expect(rows[0].code).toBe("C1");
      expect(rows[0].title).toBe("Most important issue?");
      expect(rows[0].rank).toBe("Ranked first");
      expect(rows[0].variants).toEqual([
        { code: "C1", rank: "Ranked first" },
        { code: "C1-2", rank: "Ranked top 3" },
      ]);
    });

    it("drops an exact duplicate block rather than showing it twice", () => {
      // C3_1-2 repeats C3_1 verbatim in the source sheet – same title, same percentages.
      const title = "C3_1. Managing the economy by BANNER COMMON THREADS";
      const rows = groupQuestions(VIC_TREATY_SLUG, [q("C3_1", title), q("C3_1-2", title)]);

      expect(rows).toHaveLength(1);
      expect(rows[0].code).toBe("C3_1");
      expect(rows[0].variants).toEqual([{ code: "C3_1", rank: null }]);
    });

    it("preserves input order and carries the source fields through", () => {
      const rows = groupQuestions(VIC_TREATY_SLUG, [
        q("C5", "C5. Support? by BANNER X", { hasNet: true, responseKind: "support_oppose" }),
        q("B1", "B1. First preference? by BANNER X", { category: "polling_background" }),
      ]);

      expect(rows.map((r) => r.code)).toEqual(["C5", "B1"]);
      expect(rows[0]).toMatchObject({ hasNet: true, responseKind: "support_oppose", theme: "treaty_support" });
      expect(rows[1]).toMatchObject({ category: "polling_background", theme: "party_voting" });
    });

    it("leaves theme null for an unknown poll, so the UI can fall back to category", () => {
      const rows = groupQuestions("another-poll", [q("C5", "C5. Support? by BANNER X")]);
      expect(rows[0].theme).toBeNull();
    });

    it("is a no-op on an empty list", () => {
      expect(groupQuestions(VIC_TREATY_SLUG, [])).toEqual([]);
    });
  });

  describe("evidenceOf", () => {
    /** The six findings the committed sidecar carries, by the code each is tagged with. */
    const FINDINGS = ["C5", "D6", "E2", "E4", "B1", "C1"];

    it("backs every key finding with at least one exhibit", () => {
      for (const code of FINDINGS) {
        const evidence = evidenceOf(VIC_TREATY_SLUG, code);
        expect(evidence).not.toBeNull(); // every finding must have evidence
        expect(evidence!.items.length).toBeGreaterThan(0);
      }
    });

    it("refuses to guess for another poll, or an unknown finding", () => {
      expect(evidenceOf("some-other-poll", "C5")).toBeNull();
      expect(evidenceOf(VIC_TREATY_SLUG, "Z9")).toBeNull();
      expect(evidenceOf(VIC_TREATY_SLUG, null)).toBeNull();
      expect(evidenceOf(null, "C5")).toBeNull();
    });

    it("only ever cites questions this instrument actually has", () => {
      // Every code an exhibit names must resolve to a theme, which is only true of the
      // 36 codes the sheet produced. A typo'd code would fetch a 404 on expand.
      for (const code of FINDINGS) {
        for (const item of evidenceOf(VIC_TREATY_SLUG, code)!.items) {
          for (const cited of [item.code, ...(item.matrix ?? [])].filter(Boolean) as string[]) {
            expect({ finding: code, cites: cited, theme: themeOf(VIC_TREATY_SLUG, cited) }.theme).not.toBeNull();
          }
        }
      }
    });

    it("gives every exhibit either a chart to draw or a reason it cannot be drawn", () => {
      for (const code of FINDINGS) {
        for (const item of evidenceOf(VIC_TREATY_SLUG, code)!.items) {
          expect(item.label.length).toBeGreaterThan(0);
          const drawable = Boolean(item.code) || Boolean(item.matrix);
          expect({ finding: code, label: item.label, ok: drawable || Boolean(item.unverifiable) }.ok).toBe(true);
        }
      }
    });

    it("addresses a claim by response name or by rank, never both", () => {
      for (const code of FINDINGS) {
        for (const { claim } of evidenceOf(VIC_TREATY_SLUG, code)!.items) {
          if (!claim) continue;
          // A claim addresses exactly one cell: by response name, or by rank.
          expect(Boolean(claim.response) !== Boolean(claim.rank)).toBe(true);
          expect(claim.percent).toBeGreaterThanOrEqual(0);
          expect(claim.percent).toBeLessThanOrEqual(100);
        }
      }
    });

    it("records the two figures the write-up gets wrong, exactly as written", () => {
      // These transcribe the prose. The client computes 64.6 and 25.8 respectively and
      // shows the disagreement — so if either number is "helpfully" corrected here, the
      // drift chip silently disappears and the reader is told the poll agrees with itself.
      const e3 = evidenceOf(VIC_TREATY_SLUG, "E2")!.items.find(
        (i) => i.code === "E3" && !i.group,
      );
      expect(e3!.claim).toEqual({ response: "Pauline Hanson's One Nation", percent: 63 });

      const b1 = evidenceOf(VIC_TREATY_SLUG, "B1")!.items[0];
      expect(b1.claim).toEqual({ response: "Coalition", percent: 27 });
    });

    it("marks the Kew clause unverifiable, with no question behind it", () => {
      const kew = evidenceOf(VIC_TREATY_SLUG, "E2")!.items.find((i) => i.unverifiable);
      expect(kew).toBeDefined();
      expect(kew!.code).toBeUndefined(); // nothing to chart
      expect(kew!.unverifiable).toMatch(/upper-house/i);
    });

    it("draws the party-competence matrix from the whole C3 battery", () => {
      const matrix = evidenceOf(VIC_TREATY_SLUG, "C1")!.items.find((i) => i.matrix);
      expect(matrix!.matrix).toHaveLength(12);
      expect(matrix!.matrix).toEqual(Array.from({ length: 12 }, (_, i) => `C3_${i + 1}`));
      for (const c of matrix!.matrix!) expect(themeOf(VIC_TREATY_SLUG, c)).toBe("issues_competence");
    });

    it("names a response whenever it charts a breakdown, so the chart has a row to follow", () => {
      for (const code of FINDINGS) {
        for (const item of evidenceOf(VIC_TREATY_SLUG, code)!.items) {
          if (item.group) expect({ finding: code, label: item.label, response: item.response }.response).toBeTruthy();
        }
      }
    });
  });
});
