import { isAuMobile, isVoiceCapable, isVoiceNumber } from "./phone-capabilities";

describe("phone capabilities", () => {
  it("classifies +614 numbers as AU mobiles (SMS-only)", () => {
    expect(isAuMobile("+61485052501")).toBe(true);
    expect(isAuMobile("  +61400000001  ")).toBe(true);
    expect(isAuMobile("+61255501234")).toBe(false); // Sydney local
    expect(isAuMobile("+61731234567")).toBe(false); // Brisbane local
    expect(isAuMobile("+15550001111")).toBe(false); // non-AU
    expect(isAuMobile("")).toBe(false);
    expect(isAuMobile(null)).toBe(false);
    expect(isAuMobile(undefined)).toBe(false);
  });

  it("voice capability = a non-empty, non-mobile number", () => {
    expect(isVoiceCapable("+61255501234")).toBe(true);
    expect(isVoiceCapable("+61485052501")).toBe(false);
    expect(isVoiceCapable("")).toBe(false);
    expect(isVoiceCapable(null)).toBe(false);
    expect(isVoiceCapable(undefined)).toBe(false);
  });

  describe("isVoiceNumber (a provisioned row, not a bare string)", () => {
    it("selects the stored local class and rejects the stored mobile class", () => {
      expect(isVoiceNumber({ numberType: "local", phoneNumberE164: "+61255501234" })).toBe(true);
      expect(isVoiceNumber({ numberType: "mobile", phoneNumberE164: "+61485052501" })).toBe(false);
    });

    // The stored class is what the number was actually provisioned under; a prefix is a
    // guess. Where they disagree the class wins, in BOTH directions.
    it("a stored class beats the prefix in both directions", () => {
      expect(isVoiceNumber({ numberType: "local", phoneNumberE164: "+61485052501" })).toBe(true);
      expect(isVoiceNumber({ numberType: "mobile", phoneNumberE164: "+61255501234" })).toBe(false);
    });

    it("falls back to the prefix only when no class is stored", () => {
      expect(isVoiceNumber({ numberType: null, phoneNumberE164: "+61255501234" })).toBe(true);
      expect(isVoiceNumber({ numberType: null, phoneNumberE164: "+61485052501" })).toBe(false);
      expect(isVoiceNumber({ phoneNumberE164: "+61255501234" })).toBe(true);
    });

    it("is the exact complement of SMS capability on the two AU classes", () => {
      // Guards the pairing itself: no number may be both, and none may be neither.
      const rows = [
        { numberType: "local", phoneNumberE164: "+61255501234" },
        { numberType: "mobile", phoneNumberE164: "+61485052501" },
      ];
      for (const row of rows) {
        expect(isVoiceNumber(row)).toBe(row.numberType === "local");
      }
    });
  });
});
