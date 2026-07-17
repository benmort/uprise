import { describe, expect, it } from "vitest";
import { validateAuthoredFilter } from "../definition/validation/filter.schema";
import { describeTree } from "./describe-tree";
import { matchKeywords } from "./keyword-matcher";
import { normaliseAiTree } from "./normalise";

describe("normaliseAiTree — the AI trust boundary", () => {
  it("snaps a loose tree to the closed vocabulary", () => {
    const { tree, residual } = normaliseAiTree({
      match: "all",
      conditions: [
        { field: "contact.state", op: "in", value: ["nsw", "Queensland"] },
        { field: "Tagged", op: "in", value: ["climate"] },
        { field: "Active", op: "within", value: 30 },
      ],
    });
    expect(residual).toHaveLength(0);
    expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
    expect(JSON.stringify(tree)).toContain('"NSW"');
    expect(JSON.stringify(tree)).toContain('"QLD"');
    expect(JSON.stringify(tree)).toContain('"days":30');
  });

  it("compiles a negative operator to a none wrapper (positive params stored)", () => {
    const { tree } = normaliseAiTree({
      match: "all",
      conditions: [{ field: "contact.state", op: "not in", value: ["NSW"] }],
    });
    expect(JSON.stringify(tree)).toContain('"kind":"none"');
    expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
  });

  it("unknown fields become residual clauses, never silently dropped or passed through", () => {
    const { tree, residual } = normaliseAiTree({
      match: "all",
      conditions: [
        { field: "donation.total", op: "gt", value: 100, intent: "gave over $100" },
        { field: "tag.tagged", op: "in", value: ["reef"] },
      ],
    });
    expect(residual).toEqual([{ label: "donation.total", intent: "gave over $100" }]);
    expect(JSON.stringify(tree)).not.toContain("donation.total");
    expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
  });

  it("refuses L2/L3 smuggling — a compliance field can never be snapped", () => {
    const { tree, residual } = normaliseAiTree({
      match: "all",
      conditions: [{ field: "compliance.channelConsent", op: "is", value: "SMS" }],
    });
    // not resolvable (L3 entries are never authorable) → residual + empty tree
    expect(residual).toHaveLength(1);
    expect(tree).toEqual({ kind: "all", children: [] });
  });

  it("depth is clamped and junk input yields the safe empty tree", () => {
    for (const junk of [null, "climate", 42, { match: "all", conditions: [{}] }]) {
      const { tree } = normaliseAiTree(junk);
      expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
    }
  });
});

describe("matchKeywords — deterministic fallback", () => {
  it("builds conditions from catalogue keywords + option mentions", () => {
    const loose = matchKeywords("Active climate supporters in NSW and QLD this month");
    const { tree, residual } = normaliseAiTree(loose);
    expect(residual).toHaveLength(0);
    const json = JSON.stringify(tree);
    expect(json).toContain("contact.state");
    expect(json).toContain('"NSW"');
    expect(json).toContain("activity.lastActiveWithin");
    expect(json).toContain('"days":30');
    expect(validateAuthoredFilter(tree)).toEqual({ ok: true });
  });

  it("returns an empty conditions list for an unmatchable prompt", () => {
    const loose = matchKeywords("xyzzy plugh");
    expect(loose.conditions).toHaveLength(0);
  });
});

describe("describeTree", () => {
  it("summarises a tree in plain English with catalogue labels", () => {
    const summary = describeTree({
      kind: "all",
      children: [
        { kind: "condition", condition: { type: "contact.state", op: "in", values: ["NSW"] } },
        {
          kind: "none",
          children: [
            { kind: "condition", condition: { type: "tag.tagged", op: "in", values: ["mp"] } },
          ],
        },
      ],
    });
    expect(summary).toContain("State or territory is NSW");
    expect(summary).toContain("not (");
    expect(describeTree({ kind: "all", children: [] })).toBe("everyone");
    expect(describeTree({ kind: "any", children: [] })).toBe("no one");
  });
});
