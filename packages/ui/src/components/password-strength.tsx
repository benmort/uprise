"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";

export type PasswordChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  number: boolean;
  special: boolean;
};

const RULES: { key: keyof PasswordChecks; label: string; test: (v: string) => boolean }[] = [
  { key: "length", label: "At least 8 characters", test: (v) => v.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "number", label: "A number", test: (v) => /\d/.test(v) },
  { key: "special", label: "A special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function passwordChecks(value: string): PasswordChecks {
  return RULES.reduce((acc, r) => ({ ...acc, [r.key]: r.test(value) }), {} as PasswordChecks);
}

export function isPasswordStrong(value: string): boolean {
  const c = passwordChecks(value);
  return c.length && c.upper && c.lower && c.number && c.special;
}

const METER = [
  { label: "Weak", bar: "bg-error-500", width: "w-1/4" },
  { label: "Fair", bar: "bg-amber-500", width: "w-2/4" },
  { label: "Good", bar: "bg-amber-400", width: "w-3/4" },
  { label: "Strong", bar: "bg-success-500", width: "w-full" },
];

/** Password strength meter + requirements checklist (prog parity). */
export function PasswordStrength({ value, className }: { value: string; className?: string }) {
  const checks = passwordChecks(value);
  const met = Object.values(checks).filter(Boolean).length;
  if (!value) return null;
  // 5 rules → 4 meter levels; clamp the index.
  const level = METER[Math.min(METER.length - 1, Math.max(0, met - 2))];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", level.bar, level.width)} />
        </div>
        <span className="text-xs text-muted-foreground">{level.label}</span>
      </div>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {RULES.map((r) => {
          const ok = checks[r.key];
          return (
            <li
              key={r.key}
              className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success-600" : "text-muted-foreground")}
            >
              {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
