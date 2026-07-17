"use client";

import { Minus } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { GroupShell } from "./match-group-node";
import type { MatchGroupFlowNode } from "./graph-layout";

/**
 * A `none` group rendered as the exclusions stage — the prototype's
 * red-tinted, dashed exclusion node. Same structural affordances as a match
 * group (cycle kind, add/remove), distinct visual language: whatever matches
 * inside is *removed* from the audience.
 */
export function ExclusionsNode({ data }: NodeProps<MatchGroupFlowNode>) {
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-2xl border-[1.5px] border-dashed",
        "border-error/50 bg-error/5",
      )}
    >
      <GroupShell data={data}>
        <div className="flex items-center gap-2 px-4 pt-4">
          <span
            aria-hidden
            className="grid h-4 w-4 place-items-center rounded-full border-[1.5px] border-error text-error"
          >
            <Minus className="h-2.5 w-2.5" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider leading-none text-error">
            Exclusions
          </span>
          <span className="text-[10.5px] italic leading-none text-muted-foreground">
            none of these may match
          </span>
        </div>
      </GroupShell>
    </div>
  );
}
