import { describe, it, expect } from "vitest";
import { fuzzyIncludes } from "./fuzzy";

describe("fuzzyIncludes", () => {
  it("matches an empty / whitespace query", () => {
    expect(fuzzyIncludes("anything", "")).toBe(true);
    expect(fuzzyIncludes("anything", "   ")).toBe(true);
  });

  it("matches a direct substring, case-insensitively", () => {
    expect(fuzzyIncludes("Glebe Point Road", "point")).toBe(true);
    expect(fuzzyIncludes("Glebe Point Road", "POINT")).toBe(true);
  });

  it("matches a subsequence across gaps", () => {
    expect(fuzzyIncludes("Glebe Point Road", "gpr")).toBe(true);
    expect(fuzzyIncludes("demo organiser", "dmo")).toBe(true);
  });

  it("rejects out-of-order or missing characters", () => {
    expect(fuzzyIncludes("abc", "acb")).toBe(false); // wrong order
    expect(fuzzyIncludes("abc", "abcd")).toBe(false); // extra char
  });

  it("trims surrounding whitespace on the query before matching", () => {
    expect(fuzzyIncludes("hello", "  ell  ")).toBe(true);
  });
});
