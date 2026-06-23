"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface FormInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  error?: boolean;
  success?: boolean;
  hint?: string;
  className?: string;
}

const baseClasses =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-none focus:ring-3";

/** Marketing form text input with error/success state styling + hint. */
export function FormInput({
  error = false,
  success = false,
  hint,
  className,
  disabled,
  ...props
}: FormInputProps) {
  const stateClasses = disabled
    ? "text-gray-500 border-gray-300 cursor-not-allowed"
    : error
      ? "text-error-800 border-error-500 focus:ring-error-500/10 focus:border-error-300"
      : success
        ? "text-success-500 border-success-400 focus:ring-success-500/10 focus:border-success-300"
        : "bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/10";

  return (
    <div className="relative">
      <input {...props} disabled={disabled} className={cn(baseClasses, stateClasses, className)} />
      {hint && (
        <p
          className={cn(
            "mt-1.5 text-xs",
            error && "text-error-500",
            success && !error && "text-success-500",
            !error && !success && "text-gray-500",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
