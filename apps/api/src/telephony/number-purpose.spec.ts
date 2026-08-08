import { isVoicePurpose, normalisePurpose } from "./number-purpose";

describe("normalisePurpose", () => {
  // The whole point: provisioning stamps "voice", the DTO/UI said "transactional", and the two
  // never met — a provisioned local number never appeared as the calls number.
  it("folds the legacy alias onto the canonical value", () => {
    expect(normalisePurpose("transactional")).toBe("voice");
    expect(normalisePurpose("voice")).toBe("voice");
  });

  it("passes the other purposes through", () => {
    expect(normalisePurpose("marketing")).toBe("marketing");
    expect(normalisePurpose("whatsapp")).toBe("whatsapp");
  });

  it("is forgiving about case and padding", () => {
    expect(normalisePurpose("  Voice ")).toBe("voice");
    expect(normalisePurpose("TRANSACTIONAL")).toBe("voice");
  });

  it("leaves anything unrecognised unset rather than guessing", () => {
    expect(normalisePurpose("sms")).toBeUndefined();
    expect(normalisePurpose("")).toBeUndefined();
    expect(normalisePurpose(null)).toBeUndefined();
    expect(normalisePurpose(undefined)).toBeUndefined();
  });
});

describe("isVoicePurpose", () => {
  // Rows stamped under either vocabulary must both resolve, or existing tenants lose their
  // calls number the moment the spelling changes.
  it("recognises both spellings as the calls number", () => {
    expect(isVoicePurpose("voice")).toBe(true);
    expect(isVoicePurpose("transactional")).toBe(true);
  });

  it("rejects the non-call purposes", () => {
    expect(isVoicePurpose("marketing")).toBe(false);
    expect(isVoicePurpose("whatsapp")).toBe(false);
    expect(isVoicePurpose(null)).toBe(false);
  });
});
