/**
 * Row ↔ Condition mapping — the builder edits a flat row model
 * `{ type, operator, param?, values }` per condition; this module converts it
 * to/from the closed `Condition` union for the API. Pure; unit-tested.
 *
 * `param` carries the entity-picker operand for bespoke verbs (surveyId /
 * questionId / eventId / blastId / journeyId / geo areaType); `values` carries
 * the value set (enum selections, statuses, day windows, free text).
 */
import type { CatalogueEntry, Condition, FilterNode } from "@uprise/segmentation";

export interface ConditionRowModel {
  /** Client-only row id for list rendering. */
  id: string;
  type: string;
  operator: string;
  param?: string;
  values: string[];
}

let rowCounter = 0;
export const nextRowId = (): string => `row_${(rowCounter += 1)}`;

/** A fresh row for a catalogue entry (its first operator, empty operands). */
export function rowForEntry(entry: CatalogueEntry): ConditionRowModel {
  return {
    id: nextRowId(),
    type: entry.type,
    operator: entry.operators[0] ?? "is",
    values: entry.dataType === "date" ? ["90"] : [],
  };
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};

/**
 * Build the closed-union Condition from a row (null when the row is incomplete
 * — the builder shows it as a draft and excludes it from previews/saves).
 */
export function rowToCondition(row: ConditionRowModel): Condition | null {
  const { type, operator, param, values } = row;
  switch (type) {
    // enum families
    case "contact.state":
    case "contact.locality":
    case "contact.turf":
    case "contact.supportLevel":
    case "tag.tagged":
    case "consent.sms":
    case "consent.whatsapp":
    case "source.system":
    case "canvass.dispositionCode": {
      if (values.length === 0) return null;
      const op = operator === "notIn" ? "notIn" : "in";
      return { type, op, values } as Condition;
    }
    case "contact.postcode": {
      if (values.length === 0) return null;
      if (operator === "eq") return { type, op: "eq", value: values[0] } as Condition;
      return { type, op: operator === "notIn" ? "notIn" : "in", values } as Condition;
    }
    case "contact.hasEmail":
    case "contact.hasPhone":
    case "contact.consented":
      return { type, op: operator === "isNot" ? "isNot" : "is", value: true } as Condition;
    case "contact.emailDomain": {
      const value = values[0]?.trim();
      if (!value) return null;
      return { type, op: operator === "eq" ? "eq" : "contains", value } as Condition;
    }
    // date families
    case "contact.createdAt":
    case "activity.lastActiveWithin":
    case "canvass.doorKnockedAt":
    case "email.openedAt":
    case "email.clickedAt": {
      if (operator === "before" || operator === "after") {
        if (!values[0]) return null;
        return { type, op: operator, date: values[0] } as Condition;
      }
      if (operator === "between") {
        if (!values[0] || !values[1]) return null;
        return { type, op: "between", from: values[0], to: values[1] } as Condition;
      }
      return { type, op: "within", days: num(values[0], 90) } as Condition;
    }
    // bespoke verbs
    case "survey.responded":
      if (!param) return null;
      return { type, op: operator === "isNot" ? "isNot" : "is", surveyId: param } as Condition;
    case "survey.answered":
      if (!param || values.length === 0) return null;
      return {
        type,
        questionId: param,
        op: operator === "notIn" ? "notIn" : "in",
        values,
      } as Condition;
    case "event.rsvped":
      return {
        type,
        op: operator === "isNot" ? "isNot" : "is",
        ...(param ? { eventId: param } : {}),
        ...(values.length ? { statuses: values } : {}),
      } as Condition;
    case "blast.received":
    case "blast.replied":
      return {
        type,
        op: operator === "isNot" ? "isNot" : "is",
        ...(param ? { blastId: param } : {}),
        ...(values[0] ? { withinDays: num(values[0], 30) } : {}),
      } as Condition;
    case "journey.enrolled":
      return {
        type,
        op: operator === "isNot" ? "isNot" : "is",
        ...(param ? { journeyId: param } : {}),
        ...(values.length ? { states: values } : {}),
      } as Condition;
    case "geo.area": {
      if (!param || values.length === 0) return null;
      return {
        type,
        areaType: param,
        op: operator === "notIn" ? "notIn" : "in",
        values,
      } as Condition;
    }
    case "custom.clause":
      if (!param) return null;
      return { type, clauseRef: param } as Condition;
    default:
      return null;
  }
}

/** Reconstruct the editable row from a stored Condition. */
export function conditionToRow(condition: Condition): ConditionRowModel {
  const c = condition as Record<string, unknown>;
  const base = { id: nextRowId(), type: condition.type, operator: String(c.op ?? "is") };
  if (Array.isArray(c.values)) {
    const param =
      (c.questionId as string) ?? (c.areaType as string) ?? undefined;
    return { ...base, param, values: c.values.map(String) };
  }
  if (typeof c.days === "number") return { ...base, values: [String(c.days)] };
  if (typeof c.date === "string") return { ...base, values: [c.date] };
  if (typeof c.from === "string") return { ...base, values: [String(c.from), String(c.to)] };
  const param =
    (c.surveyId as string) ??
    (c.eventId as string) ??
    (c.blastId as string) ??
    (c.journeyId as string) ??
    (c.clauseRef as string) ??
    undefined;
  const values: string[] = Array.isArray(c.statuses)
    ? c.statuses.map(String)
    : Array.isArray(c.states)
      ? c.states.map(String)
      : typeof c.withinDays === "number"
        ? [String(c.withinDays)]
        : typeof c.value === "string"
          ? [c.value]
          : [];
  return { ...base, param, values };
}

// ── the builder's two-level tree model ↔ FilterNode ─────────────────────────

/** The builder's editable shape: a root group of rows + one level of subgroups. */
export interface BuilderGroup {
  match: "all" | "any" | "none";
  rows: ConditionRowModel[];
  groups: Array<{ match: "all" | "any" | "none"; rows: ConditionRowModel[] }>;
}

/** Builder state → FilterNode (draft/incomplete rows are skipped). */
export function builderToFilter(builder: BuilderGroup): FilterNode {
  const rowNodes = (rows: ConditionRowModel[]): FilterNode[] =>
    rows
      .map(rowToCondition)
      .filter((c): c is Condition => c != null)
      .map((condition) => ({ kind: "condition", condition }) as FilterNode);
  return {
    kind: builder.match,
    children: [
      ...rowNodes(builder.rows),
      ...builder.groups
        .map((g) => ({ kind: g.match, children: rowNodes(g.rows) }) as FilterNode)
        .filter((g) => g.kind === "condition" || g.children.length > 0),
    ],
  };
}

/** FilterNode → builder state (nested groups flatten to one subgroup level). */
export function filterToBuilder(filter: FilterNode): BuilderGroup {
  if (filter.kind === "condition") {
    return { match: "all", rows: [conditionToRow(filter.condition)], groups: [] };
  }
  const rows: ConditionRowModel[] = [];
  const groups: BuilderGroup["groups"] = [];
  for (const child of filter.children) {
    if (child.kind === "condition") {
      rows.push(conditionToRow(child.condition));
    } else {
      groups.push({
        match: child.kind,
        rows: child.children
          .filter((n): n is Extract<FilterNode, { kind: "condition" }> => n.kind === "condition")
          .map((n) => conditionToRow(n.condition)),
      });
    }
  }
  return { match: filter.kind, rows, groups };
}
