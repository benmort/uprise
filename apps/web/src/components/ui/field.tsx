import * as React from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label?: string;
  /** id of the control this labels (for htmlFor). */
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Label + control + message wrapper. Shows `error` (red) when present, else `hint`.
 * The label style matches the app's existing field labels.
 */
export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
        >
          {label}
          {required ? <span className="text-error"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
