import { cn } from "@/lib/utils";
import type { DragEvent } from "react";

export function TagChip({
  label,
  onClick,
  onDragStart,
  className,
}: {
  label: string;
  onClick?: () => void;
  onDragStart?: (label: string, event: DragEvent<HTMLElement>) => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-label text-foreground",
        onClick ? "hover:bg-surface-variant" : "",
        className,
      )}
      {...(onClick ? { type: "button", onClick } : {})}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart ? (event) => onDragStart(label, event) : undefined}
      title={onDragStart ? "Drag to insert into message template" : undefined}
    >
      {label}
    </Comp>
  );
}
