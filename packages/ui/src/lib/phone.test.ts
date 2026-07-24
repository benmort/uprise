import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, nationalDisplay, parseE164, toE164 } from "./phone";

describe("toE164", () => {
  it("prefixes the dial code and drops one leading trunk 0", () => {
    expect(toE164("61", "0481565866")).toBe("+61481565866");
    expect(toE164("61", "481565866")).toBe("+61481565866");
  });

  it("ignores spaces/punctuation and returns empty for an empty national part", () => {
    expect(toE164("61", "0481 565 866")).toBe("+61481565866");
    expect(toE164("61", "")).toBe("");
    expect(toE164("1", "555 000 0000")).toBe("+15550000000");
  });
});

describe("parseE164", () => {
  it("matches the country by longest dial-code prefix", () => {
    expect(parseE164("+61481565866")).toEqual({ iso: "AU", national: "481565866" });
    expect(parseE164("+441234567890")).toEqual({ iso: "GB", national: "1234567890" });
    expect(parseE164("+15550000000")).toEqual({ iso: "US", national: "5550000000" });
  });

  it("accepts 00-international and bare dial-code prefixes", () => {
    expect(parseE164("0061481565866")).toEqual({ iso: "AU", national: "481565866" });
  });

  it("treats a plain national number as the default country's", () => {
    expect(parseE164("0481565866")).toEqual({ iso: "AU", national: "0481565866" });
    expect(parseE164("481565866", "NZ")).toEqual({ iso: "NZ", national: "481565866" });
  });

  it("is empty-safe", () => {
    expect(parseE164("")).toEqual({ iso: "AU", national: "" });
    expect(parseE164(null)).toEqual({ iso: "AU", national: "" });
  });
});

describe("nationalDisplay", () => {
  it("re-adds the trunk 0 for AU/NZ only", () => {
    expect(nationalDisplay("AU", "481565866")).toBe("0481565866");
    expect(nationalDisplay("NZ", "211234567")).toBe("0211234567");
    expect(nationalDisplay("US", "5550000000")).toBe("5550000000");
    expect(nationalDisplay("AU", "")).toBe("");
  });
});

describe("formatPhoneDisplay", () => {
  it("formats AU with the trunk 0 in parens", () => {
    expect(formatPhoneDisplay("+61481565866")).toBe("(+61) 0481565866");
  });

  it("formats a non-trunk country without a leading 0", () => {
    expect(formatPhoneDisplay("+15550000000")).toBe("(+1) 5550000000");
  });

  it("passes non-E.164 / blank values through", () => {
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay("0481565866")).toBe("0481565866");
  });
});
