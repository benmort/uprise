/**
 * Layer-1 filter validation (ported from slingshot SEG-0013).
 *
 * Two concerns, deliberately separated:
 *
 * - **`FilterNodeSchema`** — the *structural* tree shape only: a group
 *   (`all`/`any`/`none` + `children`) or an **always-wrapped** condition leaf
 *   (`{ kind:'condition', condition }`), never a bare condition. The leaf's
 *   `condition` is validated **loosely** here (just a `type` discriminator) — the
 *   closed `Condition` union is enforced separately by `validateAuthoredFilter`,
 *   so an unknown / mis-shaped leaf gets a precise reason (unknown-type vs shape)
 *   rather than a generic union mismatch. The schema is recursive up to a
 *   generous structural ceiling (`MAX_STRUCTURAL_FILTER_DEPTH`) — decoupled from
 *   the 2-level authoring bound — but finite, so an adversarial payload cannot
 *   stack-overflow the parse at the untrusted contract boundary.
 *
 * - **`validateAuthoredFilter`** — the save-time L1 authority: depth/size bound +
 *   the closed-union parse of every leaf + the **layer-authority** refusal — only
 *   L1 conditions are authorable, so a `policy.*` (L2) or `compliance.*` (L3)
 *   leaf is rejected. Returns a discriminated result the caller maps to domain
 *   errors.
 */
import { z } from "zod";
import { CONDITION_TYPES } from "../types/condition.types";
import { conditionLayer } from "../types/condition-layer";
import type { FilterNode } from "../types/filter.types";
import { ConditionSchema } from "./condition.schema";
import {
  checkFilterBounds,
  MAX_FILTER_GROUP_CHILDREN,
  MAX_STRUCTURAL_FILTER_DEPTH,
} from "./filter-bounds";

const GROUP_KINDS = ["all", "any", "none"] as const;

/** The loose structural leaf — a wrapped condition with (only) a `type` discriminator. */
const ConditionLeafSchema = z
  .object({
    kind: z.literal("condition"),
    condition: z.object({ type: z.string().min(1) }).passthrough(),
  })
  .strict();

/**
 * Build the recursive structural `FilterNode` schema up to `maxDepth` group
 * levels. Finite (no `z.lazy`) so the parse is stack-bounded; `maxDepth` is well
 * above the authoring bound so a legitimately-nested tree still parses.
 */
const buildFilterNodeSchema = (maxDepth: number): z.ZodType<FilterNode> => {
  let node: z.ZodTypeAny = ConditionLeafSchema;
  for (let level = 0; level < maxDepth; level += 1) {
    const child = node;
    node = z.union([
      ConditionLeafSchema,
      z
        .object({
          kind: z.enum(GROUP_KINDS),
          children: z.array(child).max(MAX_FILTER_GROUP_CHILDREN),
        })
        .strict(),
    ]);
  }
  return node as unknown as z.ZodType<FilterNode>;
};

/** The structural filter-tree schema (recursive to the structural ceiling). */
export const FilterNodeSchema = buildFilterNodeSchema(MAX_STRUCTURAL_FILTER_DEPTH);

/** Why an authored filter was rejected (the caller maps each to a domain error). */
export type AuthoredFilterRejectionReason =
  /** Deeper than the authoring bound, or over the node cap. */
  | "depth-bound"
  /** Structural shape, or a known type with wrong / missing / extra params. */
  | "shape"
  /** A leaf `type` outside the closed union roster. */
  | "unknown-type"
  /** A `policy.*` L2 leaf authored in an L1 filter. */
  | "l2-in-l1"
  /** A `compliance.*` L3 leaf authored in an L1 filter. */
  | "l3-in-l1"
  /** A `custom.clause` leaf referencing no clause on the envelope. */
  | "dangling-clause";

export interface AuthoredFilterRejection {
  ok: false;
  reason: AuthoredFilterRejectionReason;
  /** The offending condition `type`, when the rejection is condition-scoped. */
  type?: string;
  /** Human-readable detail (bound reason / Zod message / structural detail). */
  detail: string;
}

export type AuthoredFilterResult = { ok: true } | AuthoredFilterRejection;

/** Iteratively collect every leaf `condition` value from a validated tree (stack-safe). */
export const collectLeafConditions = (filter: FilterNode): unknown[] => {
  const conditions: unknown[] = [];
  const stack: FilterNode[] = [filter];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.kind === "condition") {
      conditions.push(node.condition);
    } else {
      for (const child of node.children) stack.push(child);
    }
  }
  return conditions;
};

const CONDITION_TYPE_SET = new Set<string>(CONDITION_TYPES);

const leafType = (condition: unknown): string =>
  typeof condition === "object" &&
  condition !== null &&
  typeof (condition as { type?: unknown }).type === "string"
    ? (condition as { type: string }).type
    : "";

/** Options for {@link validateAuthoredFilter}. */
export interface ValidateAuthoredFilterOptions {
  /**
   * The `id`s of the envelope's custom clauses — a `custom.clause` leaf whose
   * `clauseRef` is not in this set is rejected (`dangling-clause`). Omit to skip
   * the reference check (e.g. validating a bare tree with no envelope context).
   */
  customClauseIds?: ReadonlySet<string>;
}

/**
 * The save-time L1 guard — the shape / closure / authority check for an authored
 * segment filter.
 *
 * Order (each stack-safe before any recursive parse):
 *  1. depth/size bound on the **raw** input (iterative) — `depth-bound`;
 *  2. structural `FilterNode` parse (bare-condition child, unknown kind, missing
 *     `type` → `shape`);
 *  3. per leaf: the **layer authority** — only L1 is authorable, so refuse a
 *     `policy.*` (`l2-in-l1`) or `compliance.*` (`l3-in-l1`) leaf — then the
 *     closed `Condition` union (`unknown-type` for an off-roster `type`, else
 *     `shape`), then the custom-clause reference check (`dangling-clause`).
 *
 * Pure (no I/O); returns a discriminated result rather than throwing, so the
 * caller owns its error vocabulary + observability.
 */
export const validateAuthoredFilter = (
  filter: unknown,
  options: ValidateAuthoredFilterOptions = {},
): AuthoredFilterResult => {
  // 1. Depth / size bound (iterative, safe on any input) — before any recursive parse.
  const bounds = checkFilterBounds(filter);
  if (!bounds.ok) {
    return { ok: false, reason: "depth-bound", detail: bounds.reason ?? "too-large" };
  }

  // 2. Structural shape.
  const structural = FilterNodeSchema.safeParse(filter);
  if (!structural.success) {
    return { ok: false, reason: "shape", detail: structural.error.message };
  }

  // 3. Layer authority + closed-union, per leaf. Only L1 (intent) is authorable:
  //    a policy- or compliance-owned clause can never be smuggled into an L1 filter.
  for (const condition of collectLeafConditions(structural.data)) {
    const type = leafType(condition);

    const layer = conditionLayer(type);
    if (layer === "L2") {
      return {
        ok: false,
        reason: "l2-in-l1",
        type,
        detail: `"${type}" is an L2-only policy reference and cannot be authored in an L1 filter`,
      };
    }
    if (layer === "L3") {
      return {
        ok: false,
        reason: "l3-in-l1",
        type,
        detail: `"${type}" is an L3 compliance condition – the system applies it as the sending floor and it cannot be authored in an L1 intent filter`,
      };
    }

    const parsed = ConditionSchema.safeParse(condition);
    if (!parsed.success) {
      if (CONDITION_TYPE_SET.has(type)) {
        return { ok: false, reason: "shape", type, detail: parsed.error.message };
      }
      return {
        ok: false,
        reason: "unknown-type",
        type,
        detail: `"${type}" is not a known condition type`,
      };
    }

    // 4. Custom-clause references must resolve to an envelope clause — a dangling
    //    ref would otherwise be stored and silently evaluate to ∅ forever.
    if (type === "custom.clause" && options.customClauseIds) {
      const ref = (parsed.data as { clauseRef: string }).clauseRef;
      if (!options.customClauseIds.has(ref)) {
        return {
          ok: false,
          reason: "dangling-clause",
          type,
          detail: `custom.clause references "${ref}" but the definition carries no such clause`,
        };
      }
    }
  }

  return { ok: true };
};
