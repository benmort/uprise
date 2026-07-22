"use client";

import { List, Map as MapIcon, Navigation } from "lucide-react";
import { cn } from "@uprise/ui";

export type WalkMode = "list" | "map" | "street";

const SEGMENTS: Record<WalkMode, { label: string; Icon: typeof List }> = {
  list: { label: "List", Icon: List },
  map: { label: "Map", Icon: MapIcon },
  street: { label: "Street", Icon: Navigation },
};

/** List ⇄ map (⇄ street) switch. List is the low-power default; the parent persists the
 *  choice (e.g. via useLocalStorage). Segmented control — the active segment is
 *  raised (surface + shadow), the inactive one muted. `modes` defaults to the original
 *  two so existing surfaces (the admin geo explorers) are untouched; the walk view opts
 *  into the street (nav-camera) third state. */
export function WalkModeToggle({
  value,
  onChange,
  modes = ["list", "map"],
}: {
  value: WalkMode;
  onChange: (mode: WalkMode) => void;
  modes?: WalkMode[];
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-2xl border border-border bg-surface-variant p-1">
      {modes.map((mode) => {
        const { label, Icon } = SEGMENTS[mode];
        return (
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
        );
      })}
    </div>
  );
}
