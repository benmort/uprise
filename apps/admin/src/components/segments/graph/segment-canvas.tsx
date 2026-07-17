"use client";

/**
 * The segment graph builder — a react-flow port of slingshot's orphaned
 * segment-canvas prototype, re-cut for uprise's `FilterNode` tree.
 *
 * Left-to-right flow: sub-groups feed the root match group, the root feeds the
 * terminal audience endpoint. Structure edits (match-kind chips, removals, the
 * add buttons) go through `onChange` / the host callbacks — nodes are laid out
 * from the tree, not freely draggable.
 */
import { useCallback, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
} from "@xyflow/react";
import { Plus } from "lucide-react";
import type { CatalogueEntry, FilterNode } from "@uprise/segmentation";
import { Button } from "@/components/ui/button";
import { buildGraph } from "./graph-layout";
import { ConditionCardNode } from "./condition-card-node";
import { EndpointNode } from "./endpoint-node";
import { ExclusionsNode } from "./exclusions-node";
import { MatchGroupNode } from "./match-group-node";
import {
  appendChildAtPath,
  emptyGroup,
  getNodeAtPath,
  isGroup,
  nextGroupKind,
  removeNodeAtPath,
  setGroupKind,
} from "./tree-ops";

import "@xyflow/react/dist/style.css";
import "./segment-canvas.css";

const nodeTypes = {
  matchGroup: MatchGroupNode,
  conditionCard: ConditionCardNode,
  exclusions: ExclusionsNode,
  endpoint: EndpointNode,
};

export interface SegmentCanvasProps {
  /** The root filter tree (root is always a group node). */
  tree: FilterNode;
  /** type → catalogue entry, for labels/accents/descriptions. */
  catalogueByType: Record<string, CatalogueEntry>;
  /** Human labels for condition operand values (e.g. tag ids → names). */
  formatCondition: (condition: unknown) => string;
  /** Replace the whole tree (the canvas edits structure: match kinds, removals, reorder). */
  onChange: (tree: FilterNode) => void;
  /** Ask the host to open the condition editor for the node at this path (child indices from the root). */
  onEditCondition: (path: number[]) => void;
  /** Ask the host to open the add-condition dialog targeting the group at this path. */
  onAddCondition: (path: number[]) => void;
  /** Live count hints (optional): matched/sendable totals for the endpoint node. */
  counts?: { matched: number; sendable: number } | null;
}

export function SegmentCanvas({
  tree,
  catalogueByType,
  formatCondition,
  onChange,
  onEditCondition,
  onAddCondition,
  counts,
}: SegmentCanvasProps): JSX.Element {
  const handleCycleKind = useCallback(
    (path: number[]) => {
      const node = getNodeAtPath(tree, path);
      if (!node || !isGroup(node)) return;
      onChange(setGroupKind(tree, path, nextGroupKind(node.kind)));
    },
    [tree, onChange],
  );

  const handleRemoveNode = useCallback(
    (path: number[]) => onChange(removeNodeAtPath(tree, path)),
    [tree, onChange],
  );

  const handleAddGroup = useCallback(
    () => onChange(appendChildAtPath(tree, [], emptyGroup())),
    [tree, onChange],
  );

  const { nodes, edges } = useMemo(
    () =>
      buildGraph({
        tree,
        catalogueByType,
        formatCondition,
        counts,
        callbacks: {
          onCycleKind: handleCycleKind,
          onRemoveNode: handleRemoveNode,
          onEditCondition,
          onAddCondition,
        },
      }),
    [
      tree,
      catalogueByType,
      formatCondition,
      counts,
      handleCycleKind,
      handleRemoveNode,
      onEditCondition,
      onAddCondition,
    ],
  );

  return (
    <div className="seg-canvas h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.4}
          color="hsl(var(--muted-foreground) / 0.35)"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <Panel position="top-left">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background/85 px-3 py-1.5 shadow-sm backdrop-blur">
            <span className="text-xs font-bold tracking-wide text-foreground">Segment graph</span>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                aria-hidden
                className="w-5 rounded-sm border-t-[3px] border-muted-foreground/50"
              />
              flow &amp; combine logic
            </span>
            {isGroup(tree) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={handleAddGroup}
              >
                <Plus className="h-3.5 w-3.5" /> Match group
              </Button>
            ) : null}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
