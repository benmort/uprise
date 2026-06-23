'use client';

import * as React from 'react';

const inputBaseClasses =
  'shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30';

export { inputBaseClasses };

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  children,
  error,
  disabled,
  required,
  className = '',
}: FormFieldProps) {
  const labelClasses = disabled
    ? 'mb-1.5 block text-sm font-medium text-gray-300 dark:text-white/15'
    : 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400';

  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClasses}>
        {label}
        {required && <span className="text-error-500"> *</span>}
      </label>
      {children}
      {error && <p className="text-theme-xs text-error-500 mt-1.5">{error}</p>}
    </div>
  );
}
