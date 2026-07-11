import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultReturnTo, validateReturnTo, withReturnTo } from "./return-to";

const ENV_KEY = "NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS";

describe("return-to", () => {
  const original = process.env[ENV_KEY];

  beforeEach(() => {
    process.env[ENV_KEY] = "http://localhost:3000, https://app.example.com/";
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  describe("defaultReturnTo", () => {
    it("returns the first configured origin", () => {
      expect(defaultReturnTo()).toBe("http://localhost:3000");
    });

    it("strips a trailing slash and trims whitespace from the origin", () => {
      process.env[ENV_KEY] = "  https://app.example.com/  ";
      expect(defaultReturnTo()).toBe("https://app.example.com");
    });

    it("falls back to localhost:3000 when the allowlist is empty", () => {
      process.env[ENV_KEY] = "";
      expect(defaultReturnTo()).toBe("http://localhost:3000");
    });

    it("falls back to localhost:3000 when the env var is unset", () => {
      delete process.env[ENV_KEY];
      expect(defaultReturnTo()).toBe("http://localhost:3000");
    });
  });

  describe("withReturnTo", () => {
    it("returns the path unchanged when there is no return_to", () => {
      expect(withReturnTo("/sign-in", null)).toBe("/sign-in");
      expect(withReturnTo("/sign-in", undefined)).toBe("/sign-in");
      expect(withReturnTo("/sign-in", "")).toBe("/sign-in");
    });

    it("appends return_to with ? when the path has no query string", () => {
      expect(withReturnTo("/sign-in", "https://app.example.com/x")).toBe(
        "/sign-in?return_to=https%3A%2F%2Fapp.example.com%2Fx",
      );
    });

    it("appends return_to with & when the path already has a query string", () => {
      expect(withReturnTo("/sign-in?foo=1", "https://app.example.com")).toBe(
        "/sign-in?foo=1&return_to=https%3A%2F%2Fapp.example.com",
      );
    });
  });

  describe("validateReturnTo", () => {
    it("returns the default when the raw value is missing", () => {
      expect(validateReturnTo(null)).toBe("http://localhost:3000");
      expect(validateReturnTo(undefined)).toBe("http://localhost:3000");
      expect(validateReturnTo("")).toBe("http://localhost:3000");
    });

    it("passes through a full URL whose origin is on the allowlist", () => {
      expect(validateReturnTo("https://app.example.com/dashboard?a=1")).toBe(
        "https://app.example.com/dashboard?a=1",
      );
    });

    it("matches the allowlist case-insensitively", () => {
      expect(validateReturnTo("https://APP.example.com/dashboard")).toBe(
        "https://app.example.com/dashboard",
      );
    });

    it("resolves a relative path against the default origin (which is allowed)", () => {
      expect(validateReturnTo("/deep/path")).toBe("http://localhost:3000/deep/path");
    });

    it("rejects an off-allowlist origin and returns the default (open-redirect guard)", () => {
      expect(validateReturnTo("https://evil.example/steal")).toBe("http://localhost:3000");
    });

    it("rejects a different port on an otherwise allowed host", () => {
      expect(validateReturnTo("http://localhost:9999/x")).toBe("http://localhost:3000");
    });
  });
});
