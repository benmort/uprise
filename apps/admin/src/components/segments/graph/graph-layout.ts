/**
 * Tree → react-flow graph projection for the segment canvas.
 *
 * Auto-layout is tiered left-to-right: the deepest groups sit in the leftmost
 * column and feed (via edges) into their parent group one column right, with
 * the root group feeding the terminal audience endpoint. Condition cards are
 * react-flow **child nodes** positioned inside their group's container, so the
 * dashed match-group box visually contains its cards — the prototype's look.
 *
 * Nothing here is stateful: `buildGraph` is a pure projection the canvas runs
 * in a `useMemo` whenever the tree changes.
 */
import type { Edge, Node } from "@xyflow/react";
import type { CatalogueEntry, FilterGroupNode, FilterNode } from "@uprise/segmentation";
import { isCondition, isGroup, pathKey, type GroupKind } from "./tree-ops";

// ── node data contracts (consumed by the custom node components) ─────────────

export type MatchGroupData = {
  kind: GroupKind;
  path: number[];
  isRoot: boolean;
  /** Whether sub-group edges terminate on this node (shows the left junction). */
  hasGroupInputs: boolean;
  onCycleKind: (path: number[]) => void;
  onRemoveGroup: (path: number[]) => void;
  onAddCondition: (path: number[]) => void;
};

export type ConditionCardData = {
  path: number[];
  label: string;
  summary: string;
  /** Tailwind bg-* token class for the accent dot. */
  accentClass: string;
  /** True only in the degenerate root-is-a-condition case (card feeds the endpoint). */
  standalone: boolean;
  onEdit: (path: number[]) => void;
  onRemove: (path: number[]) => void;
};

export type EndpointData = {
  matched: number | null;
  sendable: number | null;
};

export type MatchGroupFlowNode = Node<MatchGroupData, "matchGroup" | "exclusions">;
export type ConditionCardFlowNode = Node<ConditionCardData, "conditionCard">;
export type EndpointFlowNode = Node<EndpointData, "endpoint">;
export type SegmentFlowNode = MatchGroupFlowNode | ConditionCardFlowNode | EndpointFlowNode;

export interface GraphCallbacks {
  onCycleKind: (path: number[]) => void;
  onRemoveNode: (path: number[]) => void;
  onEditCondition: (path: number[]) => void;
  onAddCondition: (path: number[]) => void;
}

// ── layout constants (px) ─────────────────────────────────────────────────────

export const GROUP_W = 340;
export const CARD_X = 20;
export const CARD_W = GROUP_W - CARD_X * 2;
export const CARD_H = 76;
export const ROW_GAP = 10;
export const HEADER_H = 48;
export const FOOTER_H = 44;
export const COL_GAP = 96;
export const STACK_GAP = 40;
export const ENDPOINT_H = 64;

/** Catalogue accent family → design-token dot class (no raw colours). */
const ACCENT_CLASS: Record<string, string> = {
  contact: "bg-primary",
  reach: "bg-primary-container",
  tag: "bg-success",
  consent: "bg-success",
  source: "bg-secondary-foreground",
  canvass: "bg-knock",
  activity: "bg-success",
  survey: "bg-success",
  event: "bg-warning",
  geo: "bg-warning",
  blast: "bg-primary",
  email: "bg-primary",
  journey: "bg-primary",
  insights: "bg-warning",
  custom: "bg-error",
};
const DEFAULT_ACCENT_CLASS = "bg-muted-foreground";

export function accentClassFor(entry: CatalogueEntry | undefined): string {
  return (entry?.accent && ACCENT_CLASS[entry.accent]) || DEFAULT_ACCENT_CLASS;
}

/** Container height for a group holding `cardCount` condition cards. */
export function groupHeight(cardCount: number): number {
  return HEADER_H + cardCount * (CARD_H + ROW_GAP) + FOOTER_H;
}

// ── the projection ────────────────────────────────────────────────────────────

interface GroupEntry {
  path: number[];
  node: FilterGroupNode;
  depth: number;
}

function collectGroups(root: FilterNode): GroupEntry[] {
  const out: GroupEntry[] = [];
  const walk = (node: FilterNode, path: number[], depth: number) => {
    if (!isGroup(node)) return;
    out.push({ path, node, depth });
    node.children.forEach((child, index) => walk(child, [...path, index], depth + 1));
  };
  walk(root, [], 0);
  return out;
}

export interface BuildGraphArgs {
  tree: FilterNode;
  catalogueByType: Record<string, CatalogueEntry>;
  formatCondition: (condition: unknown) => string;
  counts?: { matched: number; sendable: number } | null;
  callbacks: GraphCallbacks;
}

export function buildGraph({
  tree,
  catalogueByType,
  formatCondition,
  counts,
  callbacks,
}: BuildGraphArgs): { nodes: SegmentFlowNode[]; edges: Edge[] } {
  const nodes: SegmentFlowNode[] = [];
  const edges: Edge[] = [];

  const endpointNode = (x: number, y: number): EndpointFlowNode => ({
    id: "endpoint",
    type: "endpoint",
    position: { x, y },
    draggable: false,
    selectable: false,
    data: {
      matched: counts ? counts.matched : null,
      sendable: counts ? counts.sendable : null,
    },
  });

  const cardData = (node: FilterNode, path: number[], standalone: boolean): ConditionCardData => {
    const condition = isCondition(node) ? node.condition : undefined;
    const type = condition?.type ?? "";
    const entry = catalogueByType[type];
    return {
      path,
      label: entry?.label ?? type,
      summary: formatCondition(condition),
      accentClass: accentClassFor(entry),
      standalone,
      onEdit: callbacks.onEditCondition,
      onRemove: callbacks.onRemoveNode,
    };
  };

  // Degenerate case — the contract guarantees a group root, but stay robust.
  if (!isGroup(tree)) {
    nodes.push({
      id: pathKey("c", []),
      type: "conditionCard",
      position: { x: 0, y: 0 },
      style: { width: CARD_W, height: CARD_H },
      draggable: false,
      selectable: false,
      className: "seg-card-node seg-card-node--standalone",
      data: cardData(tree, [], true),
    });
    edges.push({
      id: "e-c-root->endpoint",
      source: pathKey("c", []),
      target: "endpoint",
      type: "smoothstep",
      className: "seg-edge seg-edge--result",
    });
    nodes.push(endpointNode(CARD_W + COL_GAP, CARD_H / 2 - ENDPOINT_H / 2));
    return { nodes, edges };
  }

  const groups = collectGroups(tree);
  const maxDepth = groups.reduce((max, g) => Math.max(max, g.depth), 0);
  const columnOf = (depth: number) => maxDepth - depth;

  // First pass — stack each column top-down in DFS order.
  const yByKey = new Map<string, number>();
  const columnHeights: number[] = [];
  for (const group of groups) {
    const column = columnOf(group.depth);
    const y = columnHeights[column] ?? 0;
    yByKey.set(pathKey("g", group.path), y);
    columnHeights[column] = y + groupHeight(group.node.children.filter(isCondition).length) + STACK_GAP;
  }
  const canvasHeight = Math.max(...columnHeights.map((h) => h - STACK_GAP), 0);

  for (const group of groups) {
    const key = pathKey("g", group.path);
    const column = columnOf(group.depth);
    const height = groupHeight(group.node.children.filter(isCondition).length);
    // Centre shorter columns against the tallest one.
    const columnOffset = (canvasHeight - (columnHeights[column] - STACK_GAP)) / 2;
    const x = column * (GROUP_W + COL_GAP);
    const y = (yByKey.get(key) ?? 0) + columnOffset;
    const isRoot = group.path.length === 0;
    const isExclusion = group.node.kind === "none";

    nodes.push({
      id: key,
      type: isExclusion ? "exclusions" : "matchGroup",
      position: { x, y },
      style: { width: GROUP_W, height },
      draggable: false,
      selectable: false,
      className: isExclusion ? "seg-group-node seg-group-node--excl" : "seg-group-node",
      data: {
        kind: group.node.kind,
        path: group.path,
        isRoot,
        hasGroupInputs: group.node.children.some(isGroup),
        onCycleKind: callbacks.onCycleKind,
        onRemoveGroup: callbacks.onRemoveNode,
        onAddCondition: callbacks.onAddCondition,
      },
    });

    // Condition cards, stacked inside the container under the header.
    let row = 0;
    group.node.children.forEach((child, index) => {
      if (!isCondition(child)) return;
      const path = [...group.path, index];
      nodes.push({
        id: pathKey("c", path),
        type: "conditionCard",
        parentId: key,
        position: { x: CARD_X, y: HEADER_H + row * (CARD_H + ROW_GAP) },
        style: { width: CARD_W, height: CARD_H },
        draggable: false,
        selectable: false,
        className: "seg-card-node",
        data: cardData(child, path, false),
      });
      row += 1;
    });

    // Wire each sub-group into its parent, one column to the right.
    if (!isRoot) {
      const parentKey = pathKey("g", group.path.slice(0, -1));
      edges.push({
        id: `e-${key}->${parentKey}`,
        source: key,
        target: parentKey,
        type: "smoothstep",
        className: isExclusion ? "seg-edge seg-edge--excl" : "seg-edge",
      });
    }
  }

  // The terminal audience endpoint, centred on the root group.
  const rootKey = pathKey("g", []);
  const rootNode = nodes.find((node) => node.id === rootKey);
  const rootHeight = typeof rootNode?.style?.height === "number" ? rootNode.style.height : 0;
  const rootY = rootNode?.position.y ?? 0;
  nodes.push(
    endpointNode(
      (maxDepth + 1) * (GROUP_W + COL_GAP),
      rootY + rootHeight / 2 - ENDPOINT_H / 2,
    ),
  );
  edges.push({
    id: `e-${rootKey}->endpoint`,
    source: rootKey,
    target: "endpoint",
    type: "smoothstep",
    className: "seg-edge seg-edge--result",
  });

  return { nodes, edges };
}
