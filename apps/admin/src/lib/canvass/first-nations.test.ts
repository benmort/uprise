import { describe, expect, it } from "vitest";
import { FN_TABS, firstNationsSlug, firstNationsTab, resolveFirstNationsLevel } from "./first-nations";

/**
 * `firstNationsSlug` must produce exactly what the API's FN_SLUG SQL produces, or a map click
 * writes a URL the API cannot resolve. These cases are real ABS names pulled from geo.ireg /
 * geo.iloc, with their actual SQL-derived slugs.
 */
describe("firstNationsSlug", () => {
  it.each([
    ["Sydney - Wollongong", "sydney-wollongong"],
    ["North-Eastern NSW", "north-eastern-nsw"],
    ["Cairns - Atherton", "cairns-atherton"],
    // Trailing punctuation must not leave a dangling dash — the SQL btrims it.
    ["Christmas - Cocos (Keeling) Is.", "christmas-cocos-keeling-is"],
    ["Amanbidji (Mialuni)", "amanbidji-mialuni"],
    ["Apatula (Finke) Homelands - West", "apatula-finke-homelands-west"],
    ["Dubbo", "dubbo"],
  ])("slugs %s → %s", (name, expected) => {
    expect(firstNationsSlug(name)).toBe(expected);
  });

  it("never emits leading or trailing dashes, or repeated separators", () => {
    expect(firstNationsSlug("  --Bogan!!  ")).toBe("bogan");
    expect(firstNationsSlug("A  /  B")).toBe("a-b");
  });
});

describe("First Nations URL vocabulary", () => {
  it("maps each level to a friendly tab and back", () => {
    for (const { tab, level } of FN_TABS) {
      expect(firstNationsTab(level)).toBe(tab);
      expect(resolveFirstNationsLevel(tab)).toBe(level);
    }
  });

  it("still accepts the raw ABS level codes, so old links keep working", () => {
    expect(resolveFirstNationsLevel("ireg")).toBe("ireg");
    expect(resolveFirstNationsLevel("iare")).toBe("iare");
    expect(resolveFirstNationsLevel("iloc")).toBe("iloc");
  });

  it("defaults to Regions for a missing or unknown tab", () => {
    expect(resolveFirstNationsLevel(null)).toBe("ireg");
    expect(resolveFirstNationsLevel("")).toBe("ireg");
    expect(resolveFirstNationsLevel("bogus")).toBe("ireg");
  });
});
