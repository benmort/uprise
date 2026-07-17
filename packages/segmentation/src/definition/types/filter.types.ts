/**
 * Layer-1 filter shapes — the organiser's authored intent (ported from slingshot
 * segmentation, SEG-0005).
 *
 * The leaf is the closed, namespaced {@link Condition} union; the tree is the
 * recursive `FilterNode`. **Storage is recursive (any depth)** — the type is
 * future-proof — while **authoring is bounded to two levels**, enforced at save
 * by the depth/size guard (`validation/filter-bounds.ts`), not by this type.
 */
import type { Condition } from "./condition.types";

/** A boolean-group node: `all` → AND, `any` → OR, `none` → NOT. */
export interface FilterGroupNode {
  kind: "all" | "any" | "none";
  children: FilterNode[];
}

/** A leaf node wrapping a single closed-union {@link Condition}. */
export interface FilterConditionNode {
  kind: "condition";
  condition: Condition;
}

/**
 * The recursive Layer-1 filter tree. Storage is recursive (any depth); authoring
 * is bounded to two levels, enforced by the save-path validator.
 */
export type FilterNode = FilterGroupNode | FilterConditionNode;
