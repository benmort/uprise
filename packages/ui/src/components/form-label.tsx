"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

/** Marketing form label (plain block label; distinct from the Radix `Label`). */
export function FormLabel({ children, className, required, ...props }: FormLabelProps) {
  return (
    <label
      {...props}
      className={cn("mb-2 block text-sm font-medium text-gray-700 dark:text-gray-400", className)}
    >
      {children}
      {required && <span className="ml-0.5 text-error-500">*</span>}
    </label>
  );
}
