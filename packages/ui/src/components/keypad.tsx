"use client";

import * as React from "react";
import { Delete } from "lucide-react";
import { cn } from "../lib/utils";

export interface KeypadProps {
  /** Fired with the tapped digit ("0"–"9"). */
  onKey: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * On-screen numeric keypad (1–9, 0, ⌫) for the phone + OTP onboarding steps — big
 * tap targets, glove-friendly. The empty bottom-left cell mirrors the iOS dial pad.
 */
export function Keypad({ onKey, onBackspace, disabled, className }: KeypadProps) {
  const key =
    "flex h-16 items-center justify-center rounded-2xl border border-border bg-surface text-2xl font-bold text-foreground transition-colors active:bg-surface-variant disabled:opacity-40";
  return (
    <div className={cn("grid grid-cols-3 gap-2.5", className)}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => onKey(d)} className={key}>
          {d}
        </button>
      ))}
      <span aria-hidden />
      <button type="button" disabled={disabled} onClick={() => onKey("0")} className={key}>
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onBackspace}
        aria-label="Delete"
        className={cn(key, "bg-surface-variant text-muted-foreground")}
      >
        <Delete className="h-6 w-6" />
      </button>
    </div>
  );
}
