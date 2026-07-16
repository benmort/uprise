import * as React from "react";
import { cn } from "../lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  /** Optional leading icon (lucide element). */
  icon?: React.ReactNode;
  disabled?: boolean;
};

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  size?: "sm" | "default";
  /** Fill the container width, splitting evenly. */
  fluid?: boolean;
  "aria-label"?: string;
  className?: string;
}

/**
 * A pill segmented toggle — the recurring "two/three-way switch" used across the
 * composer channel picker, inbox filters, and the door/text preview. One primitive so
 * they stop being hand-rolled. Roving-tabindex arrow-key nav; the active segment sits
 * on a raised surface with the primary accent.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "default",
  fluid = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, dir: 1 | -1) => {
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const i = (from + dir * step + n) % n;
      if (!options[i].disabled) {
        refs.current[i]?.focus();
        onChange(options[i].value);
        return;
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label={aria["aria-label"]}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-border bg-surface-variant p-1",
        fluid && "flex w-full",
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg font-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
              fluid && "flex-1",
              active
                ? "bg-surface text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
