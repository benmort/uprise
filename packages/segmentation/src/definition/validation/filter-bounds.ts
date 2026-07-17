/**
 * Filter-tree depth / size bound (ported verbatim from slingshot SEG-0005).
 *
 * Storage is recursive (any depth), but **authoring is bounded to two levels** —
 * an outer `all|any` of conditions where one child may be a nested
 * `all|any|none` group. Enforcing the bound server-side stops a deeply-nested
 * payload from stack-overflowing the recursive parse (→ 500). This guard is
 * **iterative** (explicit stack) and runs on the **raw** input *before* the
 * (already finite-depth) Zod schema, giving a precise error and defence in depth
 * for in-process callers.
 */

/** Max group-nesting levels (the two-level authoring bound). */
export const MAX_FILTER_DEPTH = 2;

/**
 * The **structural** nesting ceiling the `FilterNode` schema accepts — decoupled
 * from and comfortably above the authoring bound. The schema is recursive up to
 * this generous ceiling (so a 3-level tree parses as a valid `FilterNode`),
 * while `validateAuthoredFilter` enforces the real authoring bound
 * (`MAX_FILTER_DEPTH`). Kept finite (not `z.lazy`-unbounded) so the structural
 * parse cannot stack-overflow on an adversarial payload at the untrusted
 * contract boundary.
 */
export const MAX_STRUCTURAL_FILTER_DEPTH = 10;

/** Max total nodes (groups + conditions) in one filter tree. */
export const MAX_FILTER_NODES = 200;

/** Max children in any one group (caps a single oversized array). */
export const MAX_FILTER_GROUP_CHILDREN = MAX_FILTER_NODES;

export interface FilterBoundsResult {
  ok: boolean;
  reason?: "too-deep" | "too-large";
  /** Deepest group-nesting level observed. */
  depth: number;
  /** Total nodes counted (may stop early once a cap is exceeded). */
  nodeCount: number;
}

const GROUP_KINDS = new Set(["all", "any", "none"]);

const isGroupLike = (node: unknown): node is { children: unknown[] } =>
  typeof node === "object" &&
  node !== null &&
  GROUP_KINDS.has((node as { kind?: unknown }).kind as string) &&
  Array.isArray((node as { children?: unknown }).children);

/**
 * Walk the raw tree iteratively, counting nodes and tracking group depth. Safe
 * on any input (malformed nodes count as a single leaf and fall to the schema).
 */
export function checkFilterBounds(filter: unknown): FilterBoundsResult {
  let nodeCount = 0;
  let maxDepth = 0;
  // groupDepth = how many groups enclose this node.
  const stack: { node: unknown; groupDepth: number }[] = [{ node: filter, groupDepth: 0 }];

  while (stack.length > 0) {
    const { node, groupDepth } = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > MAX_FILTER_NODES) {
      return { ok: false, reason: "too-large", depth: maxDepth, nodeCount };
    }

    if (isGroupLike(node)) {
      const depth = groupDepth + 1;
      if (depth > maxDepth) maxDepth = depth;
      if (depth > MAX_FILTER_DEPTH) {
        return { ok: false, reason: "too-deep", depth, nodeCount };
      }
      for (const child of node.children) stack.push({ node: child, groupDepth: depth });
    }
  }

  return { ok: true, depth: maxDepth, nodeCount };
}
