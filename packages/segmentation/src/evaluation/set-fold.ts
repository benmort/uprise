/**
 * The set-algebra fold (ported verbatim from slingshot SEG-0007) — the heart of
 * the evaluator.
 *
 * Take the composed **effective tree** (`all( L1 intent, L2 policy, L3
 * compliance )`), a per-leaf resolver that maps each leaf to the set of
 * `contactId`s it matches, and the contact `universe`; fold the tree to a
 * single eligible `contactId` set by set-algebra:
 *
 * - `all`  → **∩** of its children (an empty group = `universe`, no constraint);
 * - `any`  → **∪** of its children (an empty group = `∅`);
 * - `none` → `universe` **∖** (∪ of its children) — NOT.
 *
 * The fold is **pure** — it never touches data. The caller (the api evaluator)
 * resolves every leaf against its data source *first*, builds the resolver, and
 * only then folds. This keeps the I/O at the edge and the combinatorial logic
 * unit-testable in isolation.
 *
 * Traversal is **iterative** (explicit stack, processed children-before-parents),
 * so a deep tree can never stack-overflow the fold — the save-time depth guard
 * (`checkFilterBounds`) is the first line; this is the second.
 */
import type {
  EffectiveConditionNode,
  EffectiveGroupNode,
  EffectiveMechanicNode,
  EffectiveNode,
} from "../composition/effective-tree";
import { isEffectiveGroup } from "../composition/effective-tree";
import { difference, intersectAll, unionAll } from "./contact-set";

/** A resolvable leaf of the effective tree — a catalogue condition or a mechanic. */
export type EffectiveLeaf = EffectiveConditionNode | EffectiveMechanicNode;

/** True for the two leaf variants (condition / mechanic). */
export const isEffectiveLeaf = (node: EffectiveNode): node is EffectiveLeaf =>
  node.kind === "condition" || node.kind === "mechanic";

/**
 * Maps a leaf to the set of `contactId`s it matches. The api backs this with a
 * precomputed map (every leaf resolved via its data source).
 *
 * **Fail-closed contract.** A resolver MUST return the **empty set (∅)** for any
 * leaf it cannot resolve — an unrouted, unknown, or unresolved leaf — and MUST
 * NEVER fall back to the `universe`. ∅ can only *restrict* an intersection (and
 * contributes nothing to a union); a `universe` fallback would silently *widen*
 * the audience and, worse, let a missing compliance leaf pass the opted-out /
 * suppressed through. The fold itself does not enforce this (it simply calls
 * `resolve(node)`); the resolver is the guard. A legitimate pass-through
 * mechanic (e.g. a disabled fatigue stub) still returns `universe`
 * **deliberately** — that is an explicit no-op, not an unresolved leaf.
 */
export type LeafResolver = (leaf: EffectiveLeaf) => ReadonlySet<string>;

/** Collect every leaf of an effective tree (iterative; conditions + mechanics). */
export const collectEffectiveLeaves = (root: EffectiveNode): EffectiveLeaf[] => {
  const leaves: EffectiveLeaf[] = [];
  const stack: EffectiveNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isEffectiveGroup(node)) {
      for (const child of node.children) stack.push(child);
    } else {
      leaves.push(node);
    }
  }
  return leaves;
};

/** Combine resolved child sets for a group node per its boolean kind. */
const combineGroup = (
  node: EffectiveGroupNode,
  childSets: ReadonlySet<string>[],
  universe: ReadonlySet<string>,
): Set<string> => {
  switch (node.kind) {
    case "all":
      return intersectAll(childSets, universe);
    case "any":
      return unionAll(childSets);
    case "none":
      return difference(universe, unionAll(childSets));
  }
};

/**
 * Fold an effective tree to the set of `contactId`s it selects.
 *
 * @param root      the composed effective tree (or any subtree).
 * @param resolve   maps each leaf to its matching `contactId` set.
 * @param universe  the full contact population — the base for `none`/`all`-empty.
 */
export const foldEffectiveTree = (
  root: EffectiveNode,
  resolve: LeafResolver,
  universe: ReadonlySet<string>,
): Set<string> => {
  // Reverse-preorder gives a post-order: every descendant precedes its parent,
  // so a group's children are already computed when we reach it.
  const preorder: EffectiveNode[] = [];
  const stack: EffectiveNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    preorder.push(node);
    if (isEffectiveGroup(node)) {
      for (const child of node.children) stack.push(child);
    }
  }

  const results = new Map<EffectiveNode, Set<string>>();
  for (let i = preorder.length - 1; i >= 0; i--) {
    const node = preorder[i];
    if (isEffectiveGroup(node)) {
      const childSets = node.children.map((child) => results.get(child)!);
      results.set(node, combineGroup(node, childSets, universe));
    } else {
      results.set(node, new Set(resolve(node)));
    }
  }
  return results.get(root)!;
};
