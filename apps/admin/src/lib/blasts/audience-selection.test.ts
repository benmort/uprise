import { describe, expect, it } from "vitest";
import { replacementAudienceId, shouldReplaceAudience } from "./audience-selection";

const base = { isWhatsapp: true, selectedId: "aud-wa", validIds: ["aud-wa", "aud-wa2"], loaded: true };

describe("shouldReplaceAudience", () => {
  /**
   * THE regression. Opening a saved WhatsApp blast resolves the blast before the audience list
   * arrives, so the narrowing effect ran against `[]`, decided the blast's own audience was
   * invalid, and wiped it — after which the list landed and a different audience was selected and
   * autosaved. An unloaded list is not evidence that the selection is wrong.
   */
  it("never replaces while the audience list is still loading", () => {
    expect(shouldReplaceAudience({ ...base, validIds: [], loaded: false })).toBe(false);
    expect(shouldReplaceAudience({ ...base, selectedId: "aud-from-blast", validIds: [], loaded: false })).toBe(false);
  });

  it("keeps a selection that IS valid for the channel", () => {
    expect(shouldReplaceAudience(base)).toBe(false);
  });

  it("replaces a selection that is genuinely invalid once the list has loaded", () => {
    expect(shouldReplaceAudience({ ...base, selectedId: "aud-sms-only" })).toBe(true);
  });

  it("does not narrow on SMS — every audience is valid there", () => {
    expect(shouldReplaceAudience({ ...base, isWhatsapp: false, selectedId: "anything", validIds: [] })).toBe(false);
  });

  // An empty selection belongs to the "pick a default" path, not the fallback.
  it("leaves an empty selection alone", () => {
    expect(shouldReplaceAudience({ ...base, selectedId: "" })).toBe(false);
  });

  // Loaded AND genuinely empty is the real "no valid audiences" case — the selection must go.
  it("clears the selection when the loaded list has no valid audiences", () => {
    expect(shouldReplaceAudience({ ...base, validIds: [], loaded: true })).toBe(true);
  });
});

describe("replacementAudienceId", () => {
  it("takes the first valid audience", () => {
    expect(replacementAudienceId(["a", "b"])).toBe("a");
  });

  it("clears to empty when there is nothing valid", () => {
    expect(replacementAudienceId([])).toBe("");
  });
});
