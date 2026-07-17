"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupKind } from "./tree-ops";
import type { MatchGroupData, MatchGroupFlowNode } from "./graph-layout";

const KIND_META: Record<GroupKind, { chip: string; chipClass: string; blurb: string }> = {
  all: { chip: "ALL", chipClass: "text-primary", blurb: "every condition must match (AND)" },
  any: { chip: "ANY", chipClass: "text-foreground", blurb: "at least one must match (OR)" },
  none: { chip: "NONE", chipClass: "text-error", blurb: "none of these may match (NOT)" },
};

/** The MATCH ALL/ANY/NONE selector chip — click cycles the group's kind. */
export function MatchChip({ kind, onCycle }: { kind: GroupKind; onCycle: () => void }) {
  return (
    <button
      type="button"
      title="Change match logic"
      onClick={onCycle}
      className={cn(
        "nodrag absolute -top-3 left-4 z-10 inline-flex items-center gap-1.5 rounded-full",
        "border border-border bg-background px-3 py-1 shadow-sm",
        "text-[10px] font-extrabold tracking-widest transition-colors hover:bg-surface-variant",
      )}
    >
      <span className="text-muted-foreground">MATCH</span>
      <span className={KIND_META[kind].chipClass}>{KIND_META[kind].chip}</span>
      <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

/** Shared container internals for match groups and exclusion (none) groups. */
export function GroupShell({
  data,
  children,
}: {
  data: MatchGroupData;
  children?: React.ReactNode;
}) {
  return (
    <>
      <MatchChip kind={data.kind} onCycle={() => data.onCycleKind(data.path)} />

      {children}

      {!data.isRoot ? (
        <button
          type="button"
          title="Remove group"
          aria-label="Remove group"
          onClick={() => data.onRemoveGroup(data.path)}
          className={cn(
            "nodrag absolute right-2 top-2 grid h-5 w-5 place-items-center rounded",
            "border border-border bg-background text-muted-foreground transition-colors",
            "hover:border-error hover:bg-error/10 hover:text-error",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* the inner rail the condition-card elbows join onto */}
      <span aria-hidden className="seg-rail" />

      {/* ghost add-condition row, anchored to the container's foot */}
      <div className="absolute bottom-2 left-5 right-4">
        <div className="relative flex items-center">
          <span
            aria-hidden
            className="absolute -left-2.5 top-1/2 w-2.5 border-t-2 border-muted-foreground/40"
          />
          <button
            type="button"
            onClick={() => data.onAddCondition(data.path)}
            className={cn(
              "nodrag inline-flex items-center gap-2 rounded-lg border-[1.5px] border-dashed",
              "border-muted-foreground/40 bg-background px-3.5 py-1.5 text-xs text-muted-foreground",
              "transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary",
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add condition
          </button>
        </div>
      </div>

      {/* junction handles (edges attach here; styled as wiring dots in the css) */}
      {data.hasGroupInputs ? (
        <Handle type="target" position={Position.Left} isConnectable={false} />
      ) : null}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

/** Dashed match-group container — the ALL/ANY boolean group. */
export function MatchGroupNode({ data }: NodeProps<MatchGroupFlowNode>) {
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-2xl border-[1.5px] border-dashed",
        "border-muted-foreground/40 bg-surface-variant/40",
      )}
    >
      <GroupShell data={data}>
        <p className="px-4 pt-4 text-[11px] italic leading-none text-muted-foreground">
          {KIND_META[data.kind].blurb}
        </p>
      </GroupShell>
    </div>
  );
}
