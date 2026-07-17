/**
 * Deterministic plain-English summary of a `FilterNode` (ported from the
 * slingshot prototype's describe) — the builder's "who this reaches" line and
 * the AI flow's echo-back. Uses catalogue labels; safe on any valid tree.
 */
import type { Condition } from "../definition/types/condition.types";
import type { FilterNode } from "../definition/types/filter.types";
import { findCatalogueEntry } from "../catalogue/uprise-catalogue";

const OP_WORDS: Record<string, string> = {
  in: "is",
  notIn: "is not",
  is: "is",
  isNot: "is not",
  eq: "is",
  contains: "contains",
  within: "in the last",
  before: "before",
  after: "after",
  between: "between",
  gt: "over",
  lt: "under",
};

const list = (values: string[], max = 3): string =>
  values.length <= max
    ? values.join(", ")
    : `${values.slice(0, max).join(", ")} +${values.length - max} more`;

const describeCondition = (condition: Condition): string => {
  const entry = findCatalogueEntry(condition.type);
  const label = entry?.label ?? condition.type;
  const c = condition as Record<string, unknown>;
  const op = OP_WORDS[String(c.op ?? "")] ?? String(c.op ?? "");

  if (Array.isArray(c.values)) return `${label} ${op} ${list(c.values.map(String))}`;
  if (typeof c.days === "number") return `${label} in the last ${c.days} days`;
  if (typeof c.date === "string") return `${label} ${op} ${c.date}`;
  if (typeof c.from === "string" && typeof c.to === "string")
    return `${label} between ${c.from} and ${c.to}`;
  if (typeof c.value === "boolean") return c.value ? label : `not ${label.toLowerCase()}`;
  if (typeof c.value === "string") return `${label} ${op} "${c.value}"`;
  if (typeof c.value === "number") return `${label} ${op} ${c.value}`;
  return label;
};

const JOINERS: Record<"all" | "any" | "none", string> = {
  all: " and ",
  any: " or ",
  none: " and not ",
};

/** Summarise a filter tree in plain English (deterministic; no I/O). */
export const describeTree = (node: FilterNode): string => {
  if (node.kind === "condition") return describeCondition(node.condition);
  if (node.children.length === 0) return node.kind === "any" ? "no one" : "everyone";
  const parts = node.children.map((child) =>
    child.kind === "condition" ? describeTree(child) : `(${describeTree(child)})`,
  );
  if (node.kind === "none") return `not (${parts.join(" or ")})`;
  return parts.join(JOINERS[node.kind]);
};
