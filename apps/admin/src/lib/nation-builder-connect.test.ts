import { describe, expect, it } from "vitest";
import { nationBaseUrl, normaliseNationSlug, validateNationConnect } from "./nation-builder-connect";

describe("normaliseNationSlug", () => {
  it("passes a bare slug through, lowercased and trimmed", () => {
    expect(normaliseNationSlug("  Castle-Hill ")).toBe("castle-hill");
  });

  it("strips the .nationbuilder.com suffix", () => {
    expect(normaliseNationSlug("castle-hill.nationbuilder.com")).toBe("castle-hill");
  });

  it("absorbs a whole pasted control-panel URL", () => {
    expect(normaliseNationSlug("https://castle-hill.nationbuilder.com/admin/settings")).toBe("castle-hill");
    expect(normaliseNationSlug("http://www.castle-hill.nationbuilder.com/?tab=api")).toBe("castle-hill");
  });

  it("rejects other domains rather than guessing — white-labels go via Settings", () => {
    expect(normaliseNationSlug("members.castlehill.org.au")).toBe("");
  });

  it("rejects garbage and empties", () => {
    expect(normaliseNationSlug("")).toBe("");
    expect(normaliseNationSlug("   ")).toBe("");
    expect(normaliseNationSlug("-leading-dash")).toBe("");
    expect(normaliseNationSlug("has spaces")).toBe("");
  });
});

describe("nationBaseUrl", () => {
  it("derives the per-nation endpoint", () => {
    expect(nationBaseUrl("castle-hill")).toBe("https://castle-hill.nationbuilder.com");
  });
});

describe("validateNationConnect", () => {
  it("accepts a slug + token", () => {
    expect(validateNationConnect({ slug: "castle-hill", token: "tok" })).toEqual({});
  });

  it("accepts a pasted URL as the slug field", () => {
    expect(validateNationConnect({ slug: "https://castle-hill.nationbuilder.com", token: "tok" })).toEqual({});
  });

  it("flags each missing field with actionable copy", () => {
    const errors = validateNationConnect({ slug: "", token: " " });
    expect(errors.slug).toContain("nationbuilder.com");
    expect(errors.token).toContain("API token");
  });
});
