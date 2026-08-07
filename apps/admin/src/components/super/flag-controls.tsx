"use client";

import { Check, Minus, X } from "lucide-react";
import { NAV_FLAGS } from "@uprise/flags";
import { cn } from "@/lib/utils";

// One label map for every flag admin surface (super flags, plans, tenant overrides).
const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV_FLAGS.map((n) => [n.key, n.label]));

/** Friendly label for a flag key — the nav label when it has one, else Title Case. */
export function flagLabel(flag: string): string {
  if (NAV_LABEL[flag]) return NAV_LABEL[flag];
  return flag
    .replace(/^FEATURE_/, "")
    .replace(/_ENABLED$/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tri-state override control: Inherit (clear) / Force on / Force off — the segmented
 * pill every flag-override surface renders (platform flags, tenant overrides).
 */
export function TriState({
  value,
  disabled,
  onChange,
}: {
  value: boolean | null;
  disabled?: boolean;
  onChange: (v: boolean | null) => void;
}) {
  const opts: Array<{ v: boolean | null; label: string; Icon: typeof Check }> = [
    { v: null, label: "Inherit", Icon: Minus },
    { v: true, label: "On", Icon: Check },
    { v: false, label: "Off", Icon: X },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              active && o.v === true && "bg-primary text-primary-foreground",
              active && o.v === false && "bg-error text-white",
              active && o.v === null && "bg-surface-variant font-medium text-foreground",
              !active && "text-muted-foreground hover:bg-surface-variant",
            )}
          >
            <o.Icon className="h-3 w-3" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
