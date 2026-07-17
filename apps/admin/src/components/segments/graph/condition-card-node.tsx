"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConditionCardFlowNode } from "./graph-layout";

/**
 * A single condition — catalogue label, one-line operand summary, edit/remove
 * affordances. The whole card opens the host's condition editor.
 */
export function ConditionCardNode({ data }: NodeProps<ConditionCardFlowNode>) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => data.onEdit(data.path)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          data.onEdit(data.path);
        }
      }}
      className={cn(
        "nodrag group flex h-full w-full cursor-pointer flex-col justify-between",
        "rounded-lg border border-border border-l-[3px] border-l-muted-foreground/50",
        "bg-background px-3 py-2 text-left shadow-sm transition-all",
        "hover:-translate-y-px hover:border-l-primary hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn("h-2 w-2 flex-none rounded-full", data.accentClass)} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {data.label}
        </span>
        <button
          type="button"
          title="Remove condition"
          aria-label="Remove condition"
          onClick={(event) => {
            event.stopPropagation();
            data.onRemove(data.path);
          }}
          className={cn(
            "nodrag grid h-[18px] w-[18px] flex-none place-items-center rounded",
            "text-muted-foreground transition-colors hover:bg-error/10 hover:text-error",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="truncate text-xs text-foreground">{data.summary}</p>

      <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Pencil className="h-2.5 w-2.5" /> edit
      </div>

      {data.standalone ? (
        <Handle type="source" position={Position.Right} isConnectable={false} />
      ) : null}
    </div>
  );
}
