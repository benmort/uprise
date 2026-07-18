import { isAuMobile, isVoiceCapable } from "./phone-capabilities";

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
});
