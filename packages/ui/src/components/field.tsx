import * as React from "react";
import { cn } from "../lib/utils";
import { Label } from "./label";

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
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
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
