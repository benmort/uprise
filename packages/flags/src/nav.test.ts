import { describe, it, expect } from "vitest";
import { NAV_FLAGS } from "./nav";
import { FLAG_META, FLAG_DEFAULTS, flagControllableBy } from "./index";

describe("NAV_FLAGS registry", () => {
  it("keys are unique and all start with FEATURE_NAV_", () => {
    const keys = NAV_FLAGS.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) {
      expect(k.startsWith("FEATURE_NAV_")).toBe(true);
    }
  });

  it("every entry has a label and a level of 1 or 2", () => {
    for (const n of NAV_FLAGS) {
      expect(n.label.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(n.level);
    }
  });

  it("groups second-level items under a first-level section that exists", () => {
    const firstLevelSections = new Set(
      NAV_FLAGS.filter((n) => n.level === 1).map((n) => n.section),
    );
    // Every level-2 item's section must be represented by a level-1 flag.
    for (const n of NAV_FLAGS.filter((n) => n.level === 2)) {
      expect(firstLevelSections.has(n.section)).toBe(true);
    }
  });
});

describe("nav flags projected into the catalogue", () => {
  it("generates one plan-driven, default-ON navigation flag per nav item", () => {
    for (const n of NAV_FLAGS) {
      const meta = FLAG_META[n.key];
      expect(meta).toBeDefined();
      expect(meta.kind).toBe("navigation");
      expect(meta.default).toBe(true);
      expect(FLAG_DEFAULTS[n.key]).toBe(true);
      // Plan-driven: tenant/plan/global control it, never env.
      expect(flagControllableBy(n.key, "plan")).toBe(true);
      expect(flagControllableBy(n.key, "tenant")).toBe(true);
      expect(flagControllableBy(n.key, "global")).toBe(true);
      expect(flagControllableBy(n.key, "env")).toBe(false);
    }
  });

  it("builds the description from the label, marking sub-items", () => {
    const inbox = NAV_FLAGS.find((n) => n.key === "FEATURE_NAV_INBOX")!;
    expect(FLAG_META.FEATURE_NAV_INBOX.description).toBe(`Show the "${inbox.label}" menu item.`);

    const text = NAV_FLAGS.find((n) => n.key === "FEATURE_NAV_CHANNELS_TEXT")!;
    expect(text.level).toBe(2);
    expect(FLAG_META.FEATURE_NAV_CHANNELS_TEXT.description).toBe(
      `Show the "${text.label}" menu item (sub-item).`,
    );
  });
});
