/**
 * The describe view (ported from slingshot's describe.ts) — project the
 * catalogue into the builder's grouped sections. Publishes `now` + `pending` +
 * `gated` L1 entries (flagged by capability so the builder can advertise
 * coming-soon attributes); L2/L3 entries are excluded (they are transparency
 * labels, not authorable attributes).
 */
import type { SegmentationContext } from "../composition/context-model";
import { getContextLayerStack } from "../composition/context-model";
import type { CatalogueEntry } from "./catalogue.types";
import { UPRISE_CATALOGUE } from "./uprise-catalogue";

/** Bump when the catalogue's shape/roster changes (clients cache by this). */
export const CATALOGUE_VERSION = 1;

export interface CatalogueSection {
  group: string;
  entries: CatalogueEntry[];
}

export interface DescribeConditionsResult {
  version: number;
  context: SegmentationContext;
  /** Whether this context is servable (`blast` in v1). */
  contextStatus: "active" | "gated";
  sections: CatalogueSection[];
}

/**
 * The authorable attribute catalogue for a context, grouped by IA section in
 * catalogue order. Only L1 entries — the builder never offers policy/compliance
 * leaves (the authoring guard would refuse them anyway).
 */
export const describeConditions = (context: SegmentationContext): DescribeConditionsResult => {
  const stack = getContextLayerStack(context);
  const sections = new Map<string, CatalogueEntry[]>();
  for (const entry of UPRISE_CATALOGUE) {
    if (entry.layer !== "L1") continue;
    const bucket = sections.get(entry.group);
    if (bucket) bucket.push(entry);
    else sections.set(entry.group, [entry]);
  }
  return {
    version: CATALOGUE_VERSION,
    context,
    contextStatus: stack.status,
    sections: [...sections.entries()].map(([group, entries]) => ({ group, entries })),
  };
};
