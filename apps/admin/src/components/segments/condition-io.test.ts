import { describe, expect, it } from "vitest";
import { validateAuthoredFilter, type FilterNode } from "@uprise/segmentation";
import {
  builderToFilter,
  conditionToRow,
  filterToBuilder,
  nextRowId,
  rowToCondition,
  type BuilderGroup,
} from "./condition-io";

const row = (partial: Partial<ReturnType<typeof conditionToRow>> & { type: string }) => ({
  id: nextRowId(),
  operator: "in",
  values: [] as string[],
  ...partial,
});

describe("rowToCondition", () => {
  it("builds enum / postcode / bool / string / date conditions", () => {
    expect(rowToCondition(row({ type: "contact.state", values: ["NSW", "QLD"] }))).toEqual({
      type: "contact.state",
      op: "in",
      values: ["NSW", "QLD"],
    });
    expect(
      rowToCondition(row({ type: "contact.postcode", operator: "eq", values: ["2000"] })),
    ).toEqual({ type: "contact.postcode", op: "eq", value: "2000" });
    expect(rowToCondition(row({ type: "contact.hasPhone", operator: "is" }))).toEqual({
      type: "contact.hasPhone",
      op: "is",
      value: true,
    });
    expect(
      rowToCondition(row({ type: "contact.emailDomain", operator: "contains", values: ["getup"] })),
    ).toEqual({ type: "contact.emailDomain", op: "contains", value: "getup" });
    expect(
      rowToCondition(row({ type: "activity.lastActiveWithin", operator: "within", values: ["30"] })),
    ).toEqual({ type: "activity.lastActiveWithin", op: "within", days: 30 });
  });

  it("builds bespoke verbs from param + values", () => {
    expect(
      rowToCondition(row({ type: "survey.responded", operator: "is", param: "s1" })),
    ).toEqual({ type: "survey.responded", op: "is", surveyId: "s1" });
    expect(
      rowToCondition(row({ type: "survey.answered", param: "q1", values: ["yes"] })),
    ).toEqual({ type: "survey.answered", questionId: "q1", op: "in", values: ["yes"] });
    expect(
      rowToCondition(row({ type: "event.rsvped", operator: "is", param: "e1", values: ["ATTENDED"] })),
    ).toEqual({ type: "event.rsvped", op: "is", eventId: "e1", statuses: ["ATTENDED"] });
    expect(
      rowToCondition(row({ type: "geo.area", param: "ced", values: ["123"] })),
    ).toEqual({ type: "geo.area", areaType: "ced", op: "in", values: ["123"] });
    expect(rowToCondition(row({ type: "custom.clause", param: "cq1" }))).toEqual({
      type: "custom.clause",
      clauseRef: "cq1",
    });
  });

  it("returns null for incomplete drafts (empty operands / missing entity)", () => {
    expect(rowToCondition(row({ type: "contact.state", values: [] }))).toBeNull();
    expect(rowToCondition(row({ type: "survey.responded", operator: "is" }))).toBeNull();
    expect(rowToCondition(row({ type: "geo.area", values: ["x"] }))).toBeNull();
    expect(rowToCondition(row({ type: "not.a.type", values: ["x"] }))).toBeNull();
  });
});

describe("builder ↔ filter round-trip", () => {
  it("produces a valid authored filter and survives the round trip", () => {
    const builder: BuilderGroup = {
      match: "all",
      rows: [
        row({ type: "contact.state", values: ["NSW"] }),
        row({ type: "tag.tagged", values: ["t1"] }),
      ],
      groups: [
        {
          match: "any",
          rows: [
            row({ type: "canvass.doorKnockedAt", operator: "within", values: ["30"] }),
            row({ type: "blast.replied", operator: "is" }),
          ],
        },
      ],
    };
    const filter = builderToFilter(builder);
    expect(validateAuthoredFilter(filter)).toEqual({ ok: true });

    const back = filterToBuilder(filter);
    expect(back.match).toBe("all");
    expect(back.rows.map((r) => r.type)).toEqual(["contact.state", "tag.tagged"]);
    expect(back.groups[0].match).toBe("any");
    expect(back.groups[0].rows.map((r) => r.type)).toEqual([
      "canvass.doorKnockedAt",
      "blast.replied",
    ]);
    // Round-trip fidelity: identical FilterNode.
    expect(builderToFilter(back)).toEqual(filter);
  });

  it("skips draft rows and drops empty subgroups", () => {
    const builder: BuilderGroup = {
      match: "all",
      rows: [row({ type: "contact.state", values: [] })],
      groups: [{ match: "any", rows: [] }],
    };
    expect(builderToFilter(builder)).toEqual({ kind: "all", children: [] });
  });

  it("wraps a bare condition root when converting back", () => {
    const filter: FilterNode = {
      kind: "condition",
      condition: { type: "tag.tagged", op: "in", values: ["t1"] },
    };
    const builder = filterToBuilder(filter);
    expect(builder.rows).toHaveLength(1);
    expect(builderToFilter(builder)).toEqual({
      kind: "all",
      children: [filter],
    });
  });
});

describe("conditionToRow", () => {
  it("reconstructs rows for every stored operand shape", () => {
    expect(conditionToRow({ type: "contact.state", op: "notIn", values: ["VIC"] })).toMatchObject({
      operator: "notIn",
      values: ["VIC"],
    });
    expect(
      conditionToRow({ type: "activity.lastActiveWithin", op: "within", days: 60 }),
    ).toMatchObject({ values: ["60"] });
    expect(
      conditionToRow({ type: "event.rsvped", op: "is", eventId: "e1", statuses: ["GOING"] }),
    ).toMatchObject({ param: "e1", values: ["GOING"] });
    expect(
      conditionToRow({ type: "survey.answered", questionId: "q1", op: "in", values: ["yes"] }),
    ).toMatchObject({ param: "q1", values: ["yes"] });
    expect(conditionToRow({ type: "custom.clause", clauseRef: "cq9" })).toMatchObject({
      param: "cq9",
    });
  });
});
