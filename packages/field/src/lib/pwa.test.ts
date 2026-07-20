import { afterEach, describe, expect, it, vi } from "vitest";
import { isStandalone } from "./pwa";

const origWindow = globalThis.window;

function stubWindow(win: unknown) {
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: origWindow, configurable: true });
  vi.restoreAllMocks();
});

describe("isStandalone", () => {
  it("is false during SSR (no window)", () => {
    stubWindow(undefined);
    expect(isStandalone()).toBe(false);
  });

  it("is true when the display-mode media query matches", () => {
    stubWindow({ matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }), navigator: {} });
    expect(isStandalone()).toBe(true);
  });

  it("is true via the iOS navigator.standalone flag", () => {
    stubWindow({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } });
    expect(isStandalone()).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    stubWindow({ matchMedia: () => ({ matches: false }), navigator: {} });
    expect(isStandalone()).toBe(false);
  });

  it("survives a missing matchMedia", () => {
    stubWindow({ navigator: {} });
    expect(isStandalone()).toBe(false);
  });
});
