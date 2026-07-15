"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Radix Select styled to the design system. Convenience wrapper: pass `value` /
 * `onValueChange` and SelectItem children (no Trigger/Content boilerplate at the
 * call site). For full control use the exported primitives directly.
 *
 * Note: Radix forbids an empty-string item value — use a sentinel (e.g. "__none__")
 * for a "none" option and map it at the call site.
 */
type SelectProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  title?: string;
  /** Optional capitalised label rendered INSIDE the trigger, before the value — mirrors
   *  the canvass campaign switcher's "Campaign" title so a bare selector reads as "Label value ⌄". */
  label?: string;
  "aria-label"?: string;
  children: React.ReactNode;
};

const Select = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, SelectProps>(
  (
    {
      value,
      onValueChange,
      defaultValue,
      placeholder,
      id,
      name,
      disabled,
      required,
      className,
      title,
      label,
      "aria-label": ariaLabel,
      children,
    },
    ref,
  ) => (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      defaultValue={defaultValue}
      name={name}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        title={title}
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        {label ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
        ) : (
          <SelectPrimitive.Value placeholder={placeholder} />
        )}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-[--radix-select-content-available-height] min-w-[--radix-select-trigger-width] overflow-hidden rounded-md border border-border bg-background shadow-elevated data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
Select.displayName = "Select";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-variant data-[highlighted]:outline-none",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

export { Select, SelectItem };
