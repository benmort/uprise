"use client";

import * as React from "react";
import { Switch } from "./switch";
import { Spinner } from "./spinner";
import { cn } from "../lib/utils";

export interface ToggleRowProps extends Omit<React.HTMLAttributes<HTMLLabelElement>, "onChange"> {
  /** The visible row label (left side). */
  label: React.ReactNode;
  /** Optional second line under the label. */
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Save in flight — disables the switch and shows a spinner beside it. */
  busy?: boolean;
  /** Forwarded VERBATIM to the Switch — e2e finds toggles by this accessible name. */
  "aria-label"?: string;
}

/**
 * A labelled settings toggle: label (+ optional description) on the left, Switch on
 * the right — the row every settings/stream surface hand-rolled. The whole row is a
 * `<label>`, so clicking the text flips the switch.
 */
export const ToggleRow = React.forwardRef<HTMLLabelElement, ToggleRowProps>(
  (
    { label, description, checked, onCheckedChange, disabled, busy, className, "aria-label": ariaLabel, ...rest },
    ref,
  ) => (
    <label
      ref={ref}
      className={cn("flex items-center justify-between gap-3 text-sm", className)}
      {...rest}
    >
      <span className={cn("min-w-0", disabled && "text-muted-foreground")}>
        <span className="block">{label}</span>
        {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
        <Switch
          checked={checked}
          disabled={disabled || busy}
          onCheckedChange={(v) => onCheckedChange(Boolean(v))}
          aria-label={ariaLabel}
        />
      </span>
    </label>
  ),
);
ToggleRow.displayName = "ToggleRow";
