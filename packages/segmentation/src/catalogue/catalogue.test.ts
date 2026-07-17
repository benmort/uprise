import { describe, expect, it } from "vitest";
import { CONDITION_TYPES } from "../definition/types/condition.types";
import { conditionLayer } from "../definition/types/condition-layer";
import { describeConditions } from "./describe";
import { getConditionSupport, listUnsupportedConditions } from "./condition-support";
import { findCatalogueEntry, UPRISE_CATALOGUE } from "./uprise-catalogue";

describe("catalogue ↔ closed-union coverage invariants", () => {
  it("every authorable (L1) union type has exactly one catalogue entry", () => {
    const authorable = CONDITION_TYPES.filter((t) => conditionLayer(t) === "L1");
    for (const type of authorable) {
      const entries = UPRISE_CATALOGUE.filter((e) => e.type === type);
      expect(entries, `missing/duplicated catalogue entry for ${type}`).toHaveLength(1);
    }
  });

  it("every now/pending entry's type is a closed-union member", () => {
    const roster = new Set<string>(CONDITION_TYPES);
    for (const entry of UPRISE_CATALOGUE) {
      if (entry.capability === "gated") continue;
      expect(roster.has(entry.type), `catalogue entry "${entry.type}" is off-roster`).toBe(true);
    }
  });

  it("entry layers agree with the classifier (single source)", () => {
    for (const entry of UPRISE_CATALOGUE) {
      expect(entry.layer).toBe(conditionLayer(entry.type));
    }
  });

  it("enum entries carry options or a feed (the builder needs operands)", () => {
    for (const entry of UPRISE_CATALOGUE) {
      if (entry.dataType !== "enum" || entry.capability !== "now") continue;
      if (entry.type === "contact.postcode" || entry.type === "contact.locality") continue; // free-entry sets
      expect(
        Boolean(entry.options?.length || entry.optionsFeed),
        `enum entry ${entry.type} has no options/feed`,
      ).toBe(true);
    }
  });
});

describe("capability gate", () => {
  it("now passes; pending/gated/unknown refuse", () => {
    expect(getConditionSupport("tag.tagged").supported).toBe(true);
    expect(getConditionSupport("contact.ageBand").supported).toBe(false);
    expect(getConditionSupport("no.such.type")).toMatchObject({
      supported: false,
      capability: "unknown",
    });
  });

  it("lists unsupported conditions in a filter, deduped", () => {
    const unsupported = listUnsupportedConditions({
      kind: "all",
      children: [
        { kind: "condition", condition: { type: "contact.ageBand", op: "in", values: ["18-24"] } as never },
        { kind: "condition", condition: { type: "contact.ageBand", op: "in", values: ["65+"] } as never },
        { kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t"] } },
      ],
    });
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatchObject({ type: "contact.ageBand", capability: "gated" });
  });
});

describe("describeConditions", () => {
  it("publishes only L1 entries, grouped, with the context status", () => {
    const result = describeConditions("blast");
    expect(result.contextStatus).toBe("active");
    const types = result.sections.flatMap((s) => s.entries.map((e) => e.type));
    expect(types).toContain("tag.tagged");
    expect(types).toContain("contact.ageBand"); // gated but advertised
    expect(types).not.toContain("compliance.channelConsent");
    expect(types).not.toContain("policy.isActive");
  });

  it("marks the list context gated", () => {
    expect(describeConditions("list").contextStatus).toBe("gated");
  });
});

describe("findCatalogueEntry", () => {
  it("resolves known types and misses cleanly", () => {
    expect(findCatalogueEntry("geo.area")?.kind).toBe("geo");
    expect(findCatalogueEntry("nope")).toBeUndefined();
  });
});
