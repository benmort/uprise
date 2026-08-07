"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/utils";

export interface RefreshButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "children"> {
  /** In-flight — spins the icon and disables the button. */
  refreshing?: boolean;
  /** Icon-only square button; the label becomes the aria-label. */
  iconOnly?: boolean;
  /** Button text (and the icon-only aria-label). */
  label?: string;
}

/** The one Refresh button: outline + RefreshCw, spinning while `refreshing`. */
export const RefreshButton = React.forwardRef<HTMLButtonElement, RefreshButtonProps>(
  ({ refreshing = false, iconOnly = false, label = "Refresh", variant = "outline", size, disabled, ...rest }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? "icon" : "sm")}
      disabled={disabled || refreshing}
      aria-label={iconOnly ? label : undefined}
      {...rest}
    >
      <RefreshCw className={cn(iconOnly ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
      {iconOnly ? null : label}
    </Button>
  ),
);
RefreshButton.displayName = "RefreshButton";
