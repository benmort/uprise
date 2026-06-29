"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface DayChipsProps {
  /** Selected day short-names (e.g. ["Sat","Sun"]). */
  value: string[];
  onChange: (value: string[]) => void;
  days?: readonly string[];
  className?: string;
}

/** Toggleable weekday chips — the onboarding availability picker. */
export function DayChips({ value, onChange, days = WEEKDAYS, className }: DayChipsProps) {
  const toggle = (day: string) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {days.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(day)}
            className={cn(
              "min-w-12 flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
              on
                ? "border-primary bg-primary text-white"
                : "border-border bg-surface text-foreground hover:border-primary/40",
            )}
          >
            {day}
          </button>
        );
      })}
    </div>
  );
}
