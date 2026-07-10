"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Screen-reader names for the abbreviated chips. */
const FULL_NAME: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

export interface DayChipsProps {
  /** Selected day short-names (e.g. ["Sat","Sun"]). */
  value: string[];
  onChange: (value: string[]) => void;
  days?: readonly string[];
  className?: string;
}

/**
 * Toggleable weekday chips — the onboarding availability picker.
 *
 * An equal-width grid, not a wrapping flex row. Seven `flex-1` chips do not fit a phone's
 * width, so the last one wrapped onto a line of its own and stretched across it: Sunday
 * came out a full-width banner while the other six were buttons. A grid sized to the
 * number of days keeps every chip identical at every width, and never wraps.
 */
export function DayChips({ value, onChange, days = WEEKDAYS, className }: DayChipsProps) {
  const toggle = (day: string) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);

  return (
    <div
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map((day) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={FULL_NAME[day] ?? day}
            onClick={() => toggle(day)}
            className={cn(
              "rounded-xl border px-1 py-2.5 text-center text-[13px] font-semibold transition-colors",
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
