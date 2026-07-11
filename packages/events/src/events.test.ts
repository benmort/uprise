import { describe, expect, it } from "vitest";
import { EVENT_TYPES, loopUnsafeReactions, assertReactionsLoopSafe, type Reaction } from "./index";

describe("EVENT_TYPES catalogue", () => {
  it("names are dot-separated lowercase segments and unique", () => {
    const values = Object.values(EVENT_TYPES);
    expect(values.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(values.length); // no duplicate event names
    for (const v of values) {
      expect(v).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });
});

const rx = (trigger: string, emits?: string[]): Reaction => ({
  trigger: trigger as never,
  emits: emits as never,
  handle: async () => {},
});

describe("reaction loop-safety", () => {
  it("flags a reaction that emits its own trigger", () => {
    expect(loopUnsafeReactions([rx("a.b.c", ["a.b.c", "x.y.z"])])).toEqual([{ trigger: "a.b.c", emit: "a.b.c" }]);
  });

  it("passes when no reaction self-triggers", () => {
    expect(loopUnsafeReactions([rx("a.b.c", ["x.y.z"]), rx("d.e.f")])).toEqual([]);
    expect(() => assertReactionsLoopSafe([rx("a.b.c", ["x.y.z"])])).not.toThrow();
  });

  it("assertReactionsLoopSafe throws naming the offending pair", () => {
    expect(() => assertReactionsLoopSafe([rx("a.b.c", ["a.b.c"])])).toThrow(/a\.b\.c → a\.b\.c/);
  });
});
