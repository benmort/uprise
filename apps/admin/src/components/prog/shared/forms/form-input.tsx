'use client';

import * as React from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";

export interface FormInputProps extends Omit<React.ComponentProps<'input'>, 'className'> {
  label: string;
  id?: string;
  error?: string;
  required?: boolean;
  state?: 'default' | 'error' | 'success' | 'disabled';
  className?: string;
}

export function FormInput({
  label,
  id,
  error,
  required,
  state = 'default',
  className,
  disabled,
  ...props
}: FormInputProps) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`;

  const stateClasses = {
    default: '',
    error:
      'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-700 dark:focus:border-error-800',
    success:
      'border-success-300 focus:border-success-300 focus:ring-success-500/10 dark:border-success-700 dark:focus:border-success-800',
    disabled:
      'disabled:border-gray-100 disabled:bg-gray-50 disabled:placeholder:text-gray-300 dark:disabled:border-gray-800 dark:disabled:bg-white/[0.03] dark:disabled:placeholder:text-white/15 focus:ring-0 focus:outline-none',
  };

  return (
    <FormField label={label} htmlFor={inputId} error={error} required={required} disabled={state === 'disabled'}>
      <input
        id={inputId}
        className={cn(inputBaseClasses, stateClasses[state], className)}
        disabled={state === 'disabled' || disabled}
        {...props}
      />
    </FormField>
  );
}
