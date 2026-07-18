import { describe, expect, it } from "vitest";
import { detectPlatform, openHint } from "./pwa";

describe("detectPlatform", () => {
  it("detects iOS from iPhone/iPad user-agents", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe("ios");
  });
  it("detects Android", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
  });
  it("falls back to desktop (incl. iPadOS-as-Macintosh, refined elsewhere)", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(detectPlatform("")).toBe("desktop");
  });
});

describe("openHint", () => {
  it("gives a platform-appropriate open hint", () => {
    expect(openHint("ios")).toMatch(/Home Screen/);
    expect(openHint("android")).toMatch(/app drawer/);
    expect(openHint("desktop")).toMatch(/dock/);
  });
});
