"use client";

import * as React from "react";
import { cn } from "../lib/utils";

/** Group raw AU mobile digits as `04xx xxx xxx` (4-3-3). */
export function formatAuMobile(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  const parts = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 10)].filter(Boolean);
  return parts.join(" ");
}

/** National AU digits → E.164 (drop a leading 0, prefix +61). */
export function toE164(national: string): string {
  const d = national.replace(/\D/g, "");
  return "+61" + (d.startsWith("0") ? d.slice(1) : d);
}

export interface PhoneNumberFieldProps {
  /** Raw national digits (e.g. "0481565866"); driven by the Keypad. */
  value: string;
  prefix?: string;
  placeholder?: string;
  className?: string;
  /**
   * When provided, the field also accepts TYPED/pasted/autofilled digits from a
   * hardware keyboard, alongside any on-screen Keypad. Emits sanitised national
   * digits (≤10). A transparent overlay `<input inputMode="none">` captures the
   * keystrokes — `inputMode="none"` keeps the mobile soft keyboard from popping
   * up (so it never fights the Keypad), while a desktop keyboard types normally.
   */
  onValueChange?: (digits: string) => void;
  /** Autofocus the field so a desktop user can start typing immediately. */
  autoFocus?: boolean;
}

/**
 * Large read-out of a mobile number being entered via the on-screen Keypad —
 * `+61` prefix + grouped digits over an underline (the onboarding phone step).
 * Display-only by default; pass `onValueChange` to also allow keyboard typing.
 */
export function PhoneNumberField({
  value,
  prefix = "+61",
  placeholder = "04xx xxx xxx",
  className,
  onValueChange,
  autoFocus,
}: PhoneNumberFieldProps) {
  const formatted = formatAuMobile(value);
  return (
    <div className={cn("relative flex items-baseline gap-3 border-b-2 border-primary pb-2", className)}>
      <span className="text-3xl font-bold text-muted-foreground">{prefix}</span>
      {formatted ? (
        <span className="text-3xl font-bold tabular-nums text-foreground">{formatted}</span>
      ) : (
        <span className="text-3xl font-bold tabular-nums text-muted-foreground/40">{placeholder}</span>
      )}
      {onValueChange ? (
        <input
          type="tel"
          inputMode="none"
          autoComplete="tel-national"
          aria-label="Mobile number"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
        />
      ) : null}
    </div>
  );
}
