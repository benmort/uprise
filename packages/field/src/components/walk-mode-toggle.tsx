"use client";

import { List, Map as MapIcon } from "lucide-react";
import { cn } from "@uprise/ui";

export type WalkMode = "list" | "map";

/** List ⇄ map switch. List is the low-power default; the parent persists the
 *  choice (e.g. via useLocalStorage). Segmented control — the active segment is
 *  raised (surface + shadow), the inactive one muted. */
export function WalkModeToggle({
  value,
  onChange,
}: {
  value: WalkMode;
  onChange: (mode: WalkMode) => void;
}) {
  const segments = [
    { mode: "list", label: "List", Icon: List },
    { mode: "map", label: "Map", Icon: MapIcon },
  ] as const;
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-2xl border border-border bg-surface-variant p-1">
      {segments.map(({ mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors",
            value === mode
              ? "bg-surface text-foreground shadow-card"
              : "text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
