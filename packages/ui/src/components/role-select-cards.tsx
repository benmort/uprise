"use client";

import * as React from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

export interface RoleOption {
  value: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

export interface RoleSelectCardsProps {
  options: RoleOption[];
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Single-select role cards (icon + title + subtitle + radio) — the onboarding
 * "How do you want to help?" step. Selected card gets a brand ring + tint.
 */
export function RoleSelectCards({ options, value, onChange, className }: RoleSelectCardsProps) {
  return (
    <div className={cn("space-y-3", className)} role="radiogroup">
      {options.map(({ value: v, title, subtitle, icon: Icon }) => {
        const selected = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(v)}
            className={cn(
              "flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/5"
                : "border-border bg-surface hover:border-primary/40",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                selected ? "bg-primary/15 text-primary" : "bg-surface-variant text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-foreground">{title}</span>
              <span className="block text-sm text-muted-foreground">{subtitle}</span>
            </span>
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                selected ? "border-primary bg-primary text-white" : "border-muted-foreground/40",
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
