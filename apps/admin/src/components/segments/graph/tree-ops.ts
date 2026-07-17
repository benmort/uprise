/**
 * Pure, path-based operations over the `FilterNode` tree — ported from the
 * slingshot prototype's `lib/tree-ops.ts`, re-expressed for uprise's shape:
 * uprise nodes carry no `nodeId`, so every op addresses a node by its **path**
 * (child indices from the root; `[]` is the root itself).
 *
 * Every op is immutable — it returns a new tree (or the same reference when
 * the op is a no-op) so React state updates stay cheap and predictable.
 */
import type { FilterConditionNode, FilterGroupNode, FilterNode } from "@uprise/segmentation";

export type GroupKind = FilterGroupNode["kind"];

/** The chip cycle order: ALL → ANY → NONE → ALL. */
export const GROUP_KIND_CYCLE: readonly GroupKind[] = ["all", "any", "none"];

export function isGroup(node: FilterNode): node is FilterGroupNode {
  return node.kind === "all" || node.kind === "any" || node.kind === "none";
}

export function isCondition(node: FilterNode): node is FilterConditionNode {
  return node.kind === "condition";
}

/** The kind the match chip cycles to next. */
export function nextGroupKind(kind: GroupKind): GroupKind {
  const index = GROUP_KIND_CYCLE.indexOf(kind);
  return GROUP_KIND_CYCLE[(index + 1) % GROUP_KIND_CYCLE.length];
}

/** The node at `path`, or `null` when the path doesn't resolve. */
export function getNodeAtPath(tree: FilterNode, path: number[]): FilterNode | null {
  let node: FilterNode = tree;
  for (const index of path) {
    if (!isGroup(node)) return null;
    const child: FilterNode | undefined = node.children[index];
    if (!child) return null;
    node = child;
  }
  return node;
}

/** Replace the node at `path` with `next`. Replacing `[]` swaps the root. */
export function replaceNodeAtPath(tree: FilterNode, path: number[], next: FilterNode): FilterNode {
  if (path.length === 0) return next;
  if (!isGroup(tree)) return tree;
  const [head, ...rest] = path;
  if (head < 0 || head >= tree.children.length) return tree;
  return {
    ...tree,
    children: tree.children.map((child, index) =>
      index === head ? replaceNodeAtPath(child, rest, next) : child,
    ),
  };
}

/** Remove the node at `path`. The root (`[]`) can never be removed. */
export function removeNodeAtPath(tree: FilterNode, path: number[]): FilterNode {
  if (path.length === 0) return tree;
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const parent = getNodeAtPath(tree, parentPath);
  if (!parent || !isGroup(parent) || index < 0 || index >= parent.children.length) return tree;
  return replaceNodeAtPath(tree, parentPath, {
    ...parent,
    children: parent.children.filter((_, i) => i !== index),
  });
}

/** Set the boolean kind of the group at `path` (no-op on conditions / bad paths). */
export function setGroupKind(tree: FilterNode, path: number[], kind: GroupKind): FilterNode {
  const node = getNodeAtPath(tree, path);
  if (!node || !isGroup(node)) return tree;
  if (node.kind === kind) return tree;
  return replaceNodeAtPath(tree, path, { ...node, kind });
}

/** Append `child` to the group at `groupPath` (no-op on conditions / bad paths). */
export function appendChildAtPath(
  tree: FilterNode,
  groupPath: number[],
  child: FilterNode,
): FilterNode {
  const node = getNodeAtPath(tree, groupPath);
  if (!node || !isGroup(node)) return tree;
  return replaceNodeAtPath(tree, groupPath, { ...node, children: [...node.children, child] });
}

/** Reorder a child within the group at `groupPath` (no-op when out of range). */
export function moveChildAtPath(
  tree: FilterNode,
  groupPath: number[],
  from: number,
  to: number,
): FilterNode {
  const node = getNodeAtPath(tree, groupPath);
  if (!node || !isGroup(node)) return tree;
  const count = node.children.length;
  if (from === to || from < 0 || from >= count || to < 0 || to >= count) return tree;
  const children = [...node.children];
  const [moved] = children.splice(from, 1);
  children.splice(to, 0, moved);
  return replaceNodeAtPath(tree, groupPath, { ...node, children });
}

/** A fresh, empty nested group — added via the canvas "+ Match group" button. */
export function emptyGroup(kind: Exclude<GroupKind, "none"> = "any"): FilterGroupNode {
  return { kind, children: [] };
}

/**
 * Deterministic react-flow node id for a tree path — `g-root`, `g-0.1`,
 * `c-0.2` — so every canvas callback maps straight back to a tree position.
 */
export function pathKey(prefix: "g" | "c", path: number[]): string {
  return path.length === 0 ? `${prefix}-root` : `${prefix}-${path.join(".")}`;
}
