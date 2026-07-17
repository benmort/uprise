"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, Panel, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CatalogueEntry, Condition, FilterNode } from "@uprise/segmentation";
import { Button } from "@/components/ui/button";
import { List, Plus } from "lucide-react";

type Props = {
  tree: FilterNode;
  catalogueByType: Record<string, CatalogueEntry>;
  formatCondition: (condition: Condition) => string;
  /** Reserved for future in-canvas edits; edits currently flow through the list view. */
  onChange?: (tree: FilterNode) => void;
  onEditCondition: () => void;
  onAddCondition: (path: number[]) => void;
  counts: { matched: number; sendable: number } | null;
};

const GROUP_LABEL: Record<string, string> = { all: "ALL of", any: "ANY of", none: "NONE of" };
const COL = 260;
const ROW = 120;

/**
 * A read-only react-flow view of a segment's filter tree — boolean-group nodes (ALL/ANY/NONE)
 * over condition leaves — with a toolbar that routes back to the list builder for edits. A
 * visual companion to the list view; authoring itself still happens there (SEG-0005 keeps the
 * canvas non-authoritative for now).
 */
function toGraph(tree: FilterNode, formatCondition: (c: Condition) => string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let nextId = 0;
  let leafCol = 0;

  const groupStyle = {
    background: "var(--brand-primary, #465fff)",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 12,
    padding: "8px 14px",
  } as const;
  const leafStyle = {
    background: "#ffffff",
    color: "#1f2937",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 12,
    padding: "8px 12px",
    maxWidth: 220,
  } as const;

  // Post-order: children first (so a group can centre over them).
  const walk = (node: FilterNode, depth: number, parentId: string | null): string => {
    const id = String(nextId++);
    if (node.kind === "condition") {
      const x = leafCol * COL;
      leafCol += 1;
      nodes.push({ id, position: { x, y: depth * ROW }, data: { label: formatCondition(node.condition) }, style: leafStyle });
    } else {
      const childIds = node.children.map((child) => walk(child, depth + 1, id));
      const xs = childIds.map((cid) => nodes.find((n) => n.id === cid)?.position.x ?? 0);
      const x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : leafCol * COL;
      if (!node.children.length) leafCol += 1;
      nodes.push({ id, position: { x, y: depth * ROW }, data: { label: GROUP_LABEL[node.kind] ?? node.kind }, style: groupStyle });
    }
    if (parentId !== null) edges.push({ id: `${parentId}-${id}`, source: parentId, target: id, animated: false });
    return id;
  };
  walk(tree, 0, null);
  return { nodes, edges };
}

export function SegmentCanvas({ tree, formatCondition, onEditCondition, onAddCondition, counts }: Props) {
  const { nodes, edges } = useMemo(() => toGraph(tree, formatCondition), [tree, formatCondition]);

  return (
    <div className="h-[480px] w-full overflow-hidden rounded-lg border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={() => onEditCondition()}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
        <Panel position="top-left" className="flex items-center gap-2 rounded-lg border border-border bg-surface/95 px-2 py-1.5 shadow-card">
          <Button size="sm" variant="outline" onClick={() => onAddCondition([])}>
            <Plus className="mr-1 h-4 w-4" />
            Add condition
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onEditCondition()}>
            <List className="mr-1 h-4 w-4" />
            Edit as list
          </Button>
          {counts ? (
            <span className="ml-1 text-xs tabular-nums text-muted-foreground">
              {counts.matched.toLocaleString()} matched · {counts.sendable.toLocaleString()} sendable
            </span>
          ) : null}
        </Panel>
      </ReactFlow>
    </div>
  );
}
