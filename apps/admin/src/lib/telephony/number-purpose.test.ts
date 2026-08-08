import { describe, expect, it } from "vitest";
import { isVoicePurpose } from "./number-purpose";

describe("isVoicePurpose", () => {
  // The regression: the calls card looked only for "transactional" while provisioning stamps
  // "voice", so a provisioned local number never appeared as the calls number and the card
  // offered to buy one the tenant already had.
  it("recognises the value provisioning actually stamps", () => {
    expect(isVoicePurpose("voice")).toBe(true);
  });

  it("still recognises the legacy alias on existing rows", () => {
    expect(isVoicePurpose("transactional")).toBe(true);
  });

  it("rejects the non-call purposes", () => {
    expect(isVoicePurpose("marketing")).toBe(false);
    expect(isVoicePurpose("whatsapp")).toBe(false);
  });

  it("is safe on absent or oddly-cased input", () => {
    expect(isVoicePurpose(null)).toBe(false);
    expect(isVoicePurpose(undefined)).toBe(false);
    expect(isVoicePurpose("")).toBe(false);
    expect(isVoicePurpose("  Voice ")).toBe(true);
  });
});
