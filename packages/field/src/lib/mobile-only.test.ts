import { describe, expect, it } from "vitest";
import { detectPlatform, fieldNoticeMode, isHandheld, isMobileViewport } from "./mobile-only";

describe("isMobileViewport", () => {
  it("treats phone-sized (and unknown) widths as mobile, wider as not", () => {
    expect(isMobileViewport(390)).toBe(true); // iPhone
    expect(isMobileViewport(768)).toBe(true); // boundary
    expect(isMobileViewport(0)).toBe(true); // unknown → don't block a real phone
    expect(isMobileViewport(1024)).toBe(false); // tablet/desktop
    expect(isMobileViewport(1440)).toBe(false); // desktop
  });
});

describe("detectPlatform", () => {
  it("detects iOS / Android / desktop", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });
});

describe("isHandheld", () => {
  it("treats touch devices (incl. wide tablets) and phone-width as handheld; non-touch desktop is not", () => {
    expect(isHandheld({ isTouch: true, width: 1024 })).toBe(true); // iPad landscape (touch)
    expect(isHandheld({ isTouch: false, width: 390 })).toBe(true); // phone-width fallback
    expect(isHandheld({ isTouch: false, width: 1440 })).toBe(false); // desktop, no touch
  });
});

describe("fieldNoticeMode", () => {
  const base = { isTouch: false, width: 1440, isSuperAdmin: false, isStandalone: false, dismissed: false };
  it("shows 'use-phone' on non-touch desktop, 'install' on a phone or tablet browser", () => {
    expect(fieldNoticeMode(base)).toBe("use-phone"); // desktop
    expect(fieldNoticeMode({ ...base, width: 390 })).toBe("install"); // phone
    expect(fieldNoticeMode({ ...base, isTouch: true, width: 1024 })).toBe("install"); // tablet (touch)
  });
  it("shows nothing for super-admins, the installed app, or a dismissed session", () => {
    expect(fieldNoticeMode({ ...base, isSuperAdmin: true })).toBe("none");
    expect(fieldNoticeMode({ ...base, width: 390, isStandalone: true })).toBe("none");
    expect(fieldNoticeMode({ ...base, width: 390, dismissed: true })).toBe("none");
  });
});
