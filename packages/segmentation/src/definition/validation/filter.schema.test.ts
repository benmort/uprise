import { describe, expect, it } from "vitest";
import type { FilterNode } from "../types/filter.types";
import { checkFilterBounds, MAX_FILTER_NODES } from "./filter-bounds";
import { validateAuthoredFilter } from "./filter.schema";
import { detectDefinitionFormat, SegmentDefinitionV2Schema } from "./segment-definition.schema";
import { DEFAULT_SEGMENT_POLICY } from "../types/segment-definition.types";

const leaf = (condition: unknown): unknown => ({ kind: "condition", condition });
const tagged = leaf({ type: "tag.tagged", op: "in", values: ["t1"] });

describe("checkFilterBounds", () => {
  it("accepts the two-level authoring shape", () => {
    const tree = { kind: "all", children: [tagged, { kind: "any", children: [tagged] }] };
    expect(checkFilterBounds(tree)).toMatchObject({ ok: true, depth: 2 });
  });
  it("refuses three group levels", () => {
    const tree = {
      kind: "all",
      children: [{ kind: "any", children: [{ kind: "none", children: [tagged] }] }],
    };
    expect(checkFilterBounds(tree)).toMatchObject({ ok: false, reason: "too-deep" });
  });
  it("refuses an oversized tree", () => {
    const tree = { kind: "all", children: Array(MAX_FILTER_NODES + 1).fill(tagged) };
    expect(checkFilterBounds(tree)).toMatchObject({ ok: false, reason: "too-large" });
  });
});

describe("validateAuthoredFilter", () => {
  it("accepts a valid two-level intent tree", () => {
    const tree = {
      kind: "all",
      children: [
        tagged,
        leaf({ type: "contact.state", op: "in", values: ["NSW", "QLD"] }),
        {
          kind: "any",
          children: [
            leaf({ type: "activity.lastActiveWithin", op: "within", days: 90 }),
            leaf({ type: "canvass.doorKnockedAt", op: "within", days: 30 }),
          ],
        },
      ],
    };
    expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
  });

  it("accepts the contact.consented bool leaf and rejects a malformed one", () => {
    const ok = {
      kind: "all",
      children: [leaf({ type: "contact.consented", op: "is", value: true })],
    };
    expect(validateAuthoredFilter(ok)).toEqual({ ok: true });
    // Bool leaves carry `value: boolean` — an enum-style values set is a shape rejection.
    const bad = {
      kind: "all",
      children: [leaf({ type: "contact.consented", op: "in", values: ["true"] })],
    };
    expect(validateAuthoredFilter(bad)).toMatchObject({ ok: false, reason: "shape" });
  });

  it("rejects depth over the authoring bound (depth-bound)", () => {
    const tree = {
      kind: "all",
      children: [{ kind: "any", children: [{ kind: "none", children: [tagged] }] }],
    };
    expect(validateAuthoredFilter(tree)).toMatchObject({ ok: false, reason: "depth-bound" });
  });

  it("rejects a bare (unwrapped) condition child (shape)", () => {
    const tree = { kind: "all", children: [{ type: "tag.tagged", op: "in", values: ["t"] }] };
    expect(validateAuthoredFilter(tree)).toMatchObject({ ok: false, reason: "shape" });
  });

  it("rejects an off-roster type (unknown-type)", () => {
    const tree = { kind: "all", children: [leaf({ type: "donations.total", op: "gt", value: 1 })] };
    expect(validateAuthoredFilter(tree)).toMatchObject({
      ok: false,
      reason: "unknown-type",
      type: "donations.total",
    });
  });

  it("rejects a known type with wrong params (shape)", () => {
    const tree = { kind: "all", children: [leaf({ type: "tag.tagged", op: "in", values: [] })] };
    expect(validateAuthoredFilter(tree)).toMatchObject({ ok: false, reason: "shape" });
  });

  it("refuses an L2 policy leaf in an authored filter (l2-in-l1)", () => {
    const tree = {
      kind: "all",
      children: [leaf({ type: "policy.isActive", op: "is", policy: "org-default" })],
    };
    expect(validateAuthoredFilter(tree)).toMatchObject({ ok: false, reason: "l2-in-l1" });
  });

  it("refuses an L3 compliance leaf in an authored filter (l3-in-l1)", () => {
    const tree = {
      kind: "all",
      children: [leaf({ type: "compliance.channelConsent", channel: "SMS" })],
    };
    expect(validateAuthoredFilter(tree)).toMatchObject({
      ok: false,
      reason: "l3-in-l1",
      type: "compliance.channelConsent",
    });
  });

  it("rejects an unexpected extra key on a condition (strict)", () => {
    const tree = {
      kind: "all",
      children: [leaf({ type: "tag.tagged", op: "in", values: ["t"], sneaky: true })],
    };
    expect(validateAuthoredFilter(tree)).toMatchObject({ ok: false, reason: "shape" });
  });

  it("checks custom.clause references against the envelope clause ids", () => {
    const tree = { kind: "all", children: [leaf({ type: "custom.clause", clauseRef: "cq_1" })] };
    expect(
      validateAuthoredFilter(tree, { customClauseIds: new Set(["cq_1"]) }),
    ).toEqual({ ok: true });
    expect(
      validateAuthoredFilter(tree, { customClauseIds: new Set(["cq_other"]) }),
    ).toMatchObject({ ok: false, reason: "dangling-clause" });
  });

  it("survives adversarial junk without throwing", () => {
    for (const junk of [null, 42, "x", [], { kind: "all" }, { children: [] }, { kind: "??" }]) {
      const result = validateAuthoredFilter(junk);
      expect(result.ok).toBe(false);
    }
  });
});

describe("v2 envelope schema + format detection", () => {
  const filter: FilterNode = {
    kind: "all",
    children: [{ kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["t"] } }],
  };

  it("parses a valid v2 envelope", () => {
    const parsed = SegmentDefinitionV2Schema.safeParse({
      format: 2,
      filter,
      policy: DEFAULT_SEGMENT_POLICY,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an envelope with an extra key / bad policy", () => {
    expect(
      SegmentDefinitionV2Schema.safeParse({ format: 2, filter, policy: {}, extra: 1 }).success,
    ).toBe(false);
  });

  it("detects formats: v2 vs every legacy shape", () => {
    expect(detectDefinitionFormat({ format: 2, filter, policy: DEFAULT_SEGMENT_POLICY })).toBe("v2");
    expect(detectDefinitionFormat({ type: "hasSource", sourceSystem: "prog" })).toBe("legacy");
    expect(detectDefinitionFormat({ include: { type: "all" } })).toBe("legacy");
    expect(detectDefinitionFormat({ all: [] })).toBe("legacy");
    expect(detectDefinitionFormat(null)).toBe("legacy");
    expect(detectDefinitionFormat([1])).toBe("legacy");
  });
});
