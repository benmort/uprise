import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getVolunteerId,
  setVolunteerId,
  getVolunteerName,
  setVolunteerName,
  getTenantBrand,
  setTenantBrand,
  newLocalId,
} from "./volunteer";

/** Minimal in-memory localStorage so the storage-backed helpers run under the node env. */
function fakeWindow() {
  const store = new Map<string, string>();
  return {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

describe("volunteer local store", () => {
  afterEach(() => vi.unstubAllGlobals());

  describe("SSR (no window)", () => {
    it("reads are inert and writes are no-ops", () => {
      expect(getVolunteerId()).toBeNull();
      expect(getVolunteerName()).toBe("");
      expect(getTenantBrand()).toBeNull();
      // Writes must not throw when window is absent.
      expect(() => {
        setVolunteerId("u1");
        setVolunteerName("Ada");
        setTenantBrand({ id: "t1", name: "Org One" });
      }).not.toThrow();
    });
  });

  describe("in the browser", () => {
    beforeEach(() => vi.stubGlobal("window", fakeWindow()));

    it("round-trips the volunteer id and name", () => {
      setVolunteerId("u1");
      expect(getVolunteerId()).toBe("u1");
      setVolunteerName("Ada");
      expect(getVolunteerName()).toBe("Ada");
    });

    it("round-trips the tenant brand including the logo", () => {
      setTenantBrand({ id: "t1", name: "Org One", logoUrl: "wide.png" });
      expect(getTenantBrand()).toEqual({ id: "t1", name: "Org One", logoUrl: "wide.png" });
    });

    it("keeps a brand with no logo", () => {
      setTenantBrand({ id: "t2", name: "Org Two" });
      expect(getTenantBrand()).toEqual({ id: "t2", name: "Org Two" });
    });

    it("returns null when no brand is stored", () => {
      expect(getTenantBrand()).toBeNull();
    });

    it("returns null on corrupt stored JSON", () => {
      window.localStorage.setItem("uprise.volunteerTenant", "{not json");
      expect(getTenantBrand()).toBeNull();
    });
  });

  it("newLocalId returns a stable-looking unique id", () => {
    const a = newLocalId();
    const b = newLocalId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
