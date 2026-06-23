'use client';

import * as React from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from '@/components/prog/cn';

function ChevronDownIcon() {
  return (
    <svg
      className="stroke-current"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.79175 7.396L10.0001 12.6043L15.2084 7.396"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps {
  label: string;
  id?: string;
  name?: string;
  options: FormSelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  error?: string;
  state?: 'default' | 'error' | 'success' | 'disabled';
  className?: string;
}

const selectStateClasses = {
  default: '',
  error:
    'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-700 dark:focus:border-error-800',
  success:
    'border-success-300 focus:border-success-300 focus:ring-success-500/10 dark:border-success-700 dark:focus:border-success-800',
  disabled:
    'disabled:border-gray-100 disabled:bg-gray-50 disabled:placeholder:text-gray-300 dark:disabled:border-gray-800 dark:disabled:bg-white/[0.03] dark:disabled:placeholder:text-white/15 focus:ring-0 focus:outline-none',
};

export function FormSelect({
  label,
  id,
  name,
  options,
  placeholder = 'Select Option',
  value = '',
  onChange,
  required,
  error,
  state = 'default',
  className,
}: FormSelectProps) {
  const inputId = id ?? `select-${Math.random().toString(36).slice(2)}`;
  const resolvedState = error ? 'error' : state;

  return (
    <FormField label={label} htmlFor={inputId} required={required} error={error}>
      <div className="relative z-20 bg-transparent">
        <select
          id={inputId}
          name={name}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={resolvedState === 'disabled'}
          className={cn(
            inputBaseClasses,
            'appearance-none bg-none pr-11',
            value ? 'text-gray-800 dark:text-white/90' : '',
            selectStateClasses[resolvedState],
            className
          )}
        >
          <option value="" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">
            {placeholder}
          </option>
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="text-gray-700 dark:bg-gray-900 dark:text-gray-400"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-4 z-30 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          <ChevronDownIcon />
        </span>
      </div>
    </FormField>
  );
}
