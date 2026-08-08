import { describe, expect, it } from "vitest";
import { isDisplayedMobileVerified, resolveAccountMobile } from "./account-mobile";

const VERIFIED = "+61412345678";
const FREE_TEXT = "02 9555 1234"; // a landline someone typed into their profile

describe("resolveAccountMobile", () => {
  /**
   * THE regression. Preferring the free-text `phone` fixed "Verified / No mobile on file", then
   * put the UNVERIFIED number under the Verified chip: someone who typed a landline into their
   * profile and verified a real mobile saw the landline labelled verified.
   */
  it("shows the VERIFIED number once a mobile is verified", () => {
    expect(
      resolveAccountMobile({ phone: FREE_TEXT, mobile: VERIFIED, mobileVerified: true }),
    ).toBe(VERIFIED);
  });

  // The empty state the earlier fix existed for: verified, but the number only lives on `phone`.
  it("still falls back to the profile number when there is no verified mobile stored", () => {
    expect(resolveAccountMobile({ phone: FREE_TEXT, mobile: null, mobileVerified: true })).toBe(
      FREE_TEXT,
    );
  });

  it("shows whatever the user has while unverified — the card is inviting them to verify it", () => {
    expect(
      resolveAccountMobile({ phone: FREE_TEXT, mobile: VERIFIED, mobileVerified: false }),
    ).toBe(FREE_TEXT);
    expect(resolveAccountMobile({ phone: null, mobile: VERIFIED, mobileVerified: false })).toBe(
      VERIFIED,
    );
  });

  it("treats whitespace as absent rather than rendering a blank number", () => {
    expect(resolveAccountMobile({ phone: "   ", mobile: VERIFIED, mobileVerified: true })).toBe(
      VERIFIED,
    );
    expect(resolveAccountMobile({ phone: "   ", mobile: "  ", mobileVerified: true })).toBeNull();
  });

  it("returns null when there is nothing on file", () => {
    expect(resolveAccountMobile({})).toBeNull();
  });
});

describe("isDisplayedMobileVerified", () => {
  it("is true only when the number on screen IS the verified one", () => {
    expect(
      isDisplayedMobileVerified({ phone: FREE_TEXT, mobile: VERIFIED, mobileVerified: true }),
    ).toBe(true);
  });

  // Verified account, but the shown number came from the profile fallback — the chip must not
  // claim that number is verified.
  it("is false when the shown number is the profile fallback", () => {
    expect(
      isDisplayedMobileVerified({ phone: FREE_TEXT, mobile: null, mobileVerified: true }),
    ).toBe(false);
  });

  it("is false whenever the account is unverified", () => {
    expect(
      isDisplayedMobileVerified({ phone: FREE_TEXT, mobile: VERIFIED, mobileVerified: false }),
    ).toBe(false);
  });
});
