"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";

/**
 * Inline help affordance, backed by Radix Tooltip — opens on hover AND keyboard
 * focus, with a proper tooltip role. Self-contained Provider so callers need no
 * app-level wiring; `label` is the only prop, as before.
 */
export function TooltipHint({ label }: { label: string }) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center align-middle text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
            aria-label={label}
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={4}
            className="z-50 w-56 rounded border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm data-[state=delayed-open]:animate-pop-in"
          >
            {label}
            <Tooltip.Arrow className="fill-border" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
