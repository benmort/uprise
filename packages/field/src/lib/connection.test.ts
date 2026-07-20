import { afterEach, describe, expect, it } from "vitest";
import { isFastConnection } from "./connection";

const orig = globalThis.navigator;

function stubNavigator(nav: unknown) {
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: orig, configurable: true });
});

describe("isFastConnection", () => {
  it("is false when navigator is absent (SSR)", () => {
    stubNavigator(undefined);
    expect(isFastConnection()).toBe(false);
  });

  it("allows when the Network Information API is absent (iOS)", () => {
    stubNavigator({});
    expect(isFastConnection()).toBe(true);
    stubNavigator({ connection: {} }); // no effectiveType
    expect(isFastConnection()).toBe(true);
  });

  it("respects saveData as an absolute opt-out even on 4g", () => {
    stubNavigator({ connection: { saveData: true, effectiveType: "4g" } });
    expect(isFastConnection()).toBe(false);
  });

  it("allows 4g/wifi and blocks slower profiles", () => {
    stubNavigator({ connection: { effectiveType: "4g" } });
    expect(isFastConnection()).toBe(true);
    for (const t of ["3g", "2g", "slow-2g"]) {
      stubNavigator({ connection: { effectiveType: t } });
      expect(isFastConnection()).toBe(false);
    }
  });
});
