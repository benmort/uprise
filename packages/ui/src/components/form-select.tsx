"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  success?: boolean;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const baseClasses =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs focus:outline-none focus:ring-3";

/** Native marketing form select with error/success styling (distinct from the Radix `Select`). */
export function FormSelect({
  error = false,
  success = false,
  hint,
  options,
  placeholder = "Select...",
  disabled,
  className,
  ...props
}: FormSelectProps) {
  const stateClasses = disabled
    ? "text-gray-500 border-gray-300 cursor-not-allowed"
    : error
      ? "text-error-800 border-error-500 focus:ring-error-500/10 focus:border-error-300"
      : success
        ? "text-success-500 border-success-400 focus:ring-success-500/10 focus:border-success-300"
        : "bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/10";

  return (
    <div className="relative">
      <select {...props} disabled={disabled} className={cn(baseClasses, stateClasses, className)}>
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
