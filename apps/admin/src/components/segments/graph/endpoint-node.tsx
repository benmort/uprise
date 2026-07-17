"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { EndpointFlowNode } from "./graph-layout";

const compact = new Intl.NumberFormat("en-AU", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function Count({
  value,
  caption,
  emphasis,
}: {
  value: number | null;
  caption: string;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "font-mono text-[15px] font-semibold",
          emphasis ? "text-primary" : "text-foreground",
        )}
      >
        {value === null ? "–" : compact.format(value)}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {caption}
      </span>
    </span>
  );
}

/** The flow terminal — a ringed dot joined to the audience label/count pill. */
export function EndpointNode({ data }: NodeProps<EndpointFlowNode>) {
  return (
    <div className="relative flex items-center">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="seg-handle--hidden"
      />
      <span
        aria-hidden
        className="grid h-7 w-7 flex-none place-items-center rounded-full border-[3px] border-primary bg-background shadow-sm"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <div className="ml-4 flex flex-col gap-0.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 shadow-sm">
        <span className="text-sm font-bold leading-tight text-foreground">Audience</span>
        <div className="flex items-baseline gap-3">
          <Count value={data.matched} caption="matched" emphasis />
          <Count value={data.sendable} caption="sendable" />
        </div>
      </div>
    </div>
  );
}
