/**
 * The save-time capability gate (ported from slingshot's condition-support.ts) —
 * refuses a filter that uses an attribute the engine cannot serve yet
 * (`pending` / `gated` capability, or no catalogue entry at all).
 *
 * `validateAuthoredFilter` owns shape/closure/layer; this gate owns
 * *servability*. Both run at save; only `now` entries pass.
 */
import type { FilterNode } from "../definition/types/filter.types";
import { collectLeafConditions } from "../definition/validation/filter.schema";
import type { Capability } from "./catalogue.types";
import { findCatalogueEntry } from "./uprise-catalogue";

export interface ConditionSupport {
  type: string;
  capability: Capability | "unknown";
  supported: boolean;
}

/** Classify one condition `type` against the catalogue. */
export const getConditionSupport = (type: string): ConditionSupport => {
  const entry = findCatalogueEntry(type);
  if (!entry) return { type, capability: "unknown", supported: false };
  return { type, capability: entry.capability, supported: entry.capability === "now" };
};

/**
 * Every unsupported condition in an authored filter (deduped by type). Empty
 * means the filter is fully servable today.
 */
export const listUnsupportedConditions = (filter: FilterNode): ConditionSupport[] => {
  const seen = new Set<string>();
  const unsupported: ConditionSupport[] = [];
  for (const condition of collectLeafConditions(filter)) {
    const type =
      typeof condition === "object" &&
      condition !== null &&
      typeof (condition as { type?: unknown }).type === "string"
        ? (condition as { type: string }).type
        : "";
    if (seen.has(type)) continue;
    seen.add(type);
    const support = getConditionSupport(type);
    if (!support.supported) unsupported.push(support);
  }
  return unsupported;
};
