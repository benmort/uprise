"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/** Group raw AU mobile digits as `04xx xxx xxx` (4-3-3). */
export function formatAuMobile(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 10)].filter(Boolean);
  return parts.join(" ");
}

export interface PhoneNumberFieldProps {
  /** Raw national digits (e.g. "0481565866"); driven by the Keypad. */
  value: string;
  prefix?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Large read-out of a mobile number being entered via the on-screen Keypad —
 * `+61` prefix + grouped digits over an underline (the onboarding phone step).
 * Display-only: the Keypad owns the value.
 */
export function PhoneNumberField({
  value,
  prefix = "+61",
  placeholder = "04xx xxx xxx",
  className,
}: PhoneNumberFieldProps) {
  const formatted = formatAuMobile(value);
  return (
    <div className={cn("flex items-baseline gap-3 border-b-2 border-primary pb-2", className)}>
      <span className="text-3xl font-bold text-muted-foreground">{prefix}</span>
      {formatted ? (
        <span className="text-3xl font-bold tabular-nums text-foreground">{formatted}</span>
      ) : (
        <span className="text-3xl font-bold tabular-nums text-muted-foreground/40">{placeholder}</span>
      )}
    </div>
  );
}
