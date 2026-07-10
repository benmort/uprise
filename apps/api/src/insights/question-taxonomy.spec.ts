import {
  baseCode,
  cleanTitle,
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
});
