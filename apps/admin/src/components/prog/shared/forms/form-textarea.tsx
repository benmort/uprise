'use client';

import * as React from 'react';
import { FormField } from './form-field';
import { cn } from "@uprise/ui";

const textareaBaseClasses =
  'shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:ring-3 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30';

export interface FormTextareaProps extends Omit<React.ComponentProps<'textarea'>, 'className'> {
  label: string;
  id?: string;
  error?: string;
  state?: 'default' | 'error' | 'disabled';
  rows?: number;
  className?: string;
}

export function FormTextarea({
  label,
  id,
  error,
  state = 'default',
  rows = 6,
  className,
  disabled,
  ...props
}: FormTextareaProps) {
  const inputId = id ?? `textarea-${Math.random().toString(36).slice(2)}`;

  const stateClasses = {
    default: '',
    error:
      'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-700 dark:focus:border-error-800',
    disabled:
      'disabled:border-gray-100 disabled:bg-gray-50 disabled:placeholder:text-gray-300 dark:disabled:border-gray-800 dark:disabled:bg-white/[0.03] dark:disabled:placeholder:text-white/15 focus:ring-0 focus:outline-none',
  };

  return (
    <FormField label={label} htmlFor={inputId} error={error} disabled={state === 'disabled'}>
      <textarea
        id={inputId}
        rows={rows}
        className={cn(textareaBaseClasses, stateClasses[state], className)}
        disabled={state === 'disabled' || disabled}
        {...props}
      />
    </FormField>
  );
}
