'use client';

import * as React from 'react';
import { cn } from "@uprise/ui";
import { Check } from 'lucide-react';

export interface FormCheckboxProps {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function FormCheckbox({
  id,
  label,
  checked = false,
  disabled = false,
  onChange,
  className,
}: FormCheckboxProps) {
  const labelClasses = disabled
    ? 'flex cursor-pointer items-center text-sm font-medium text-gray-300 select-none dark:text-gray-700'
    : 'flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400';

  return (
    <label htmlFor={id} className={cn(labelClasses, className)}>
      <div className="relative">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="sr-only"
        />
        <div
          className={cn(
            'mr-3 flex h-5 w-5 items-center justify-center rounded-md border-[1.25px]',
            checked
              ? 'border-brand-500 bg-brand-500'
              : 'bg-transparent border-gray-300 dark:border-gray-700',
            !disabled && 'hover:border-brand-500 dark:hover:border-brand-500',
            disabled && 'border-gray-200 dark:border-gray-800 bg-transparent'
          )}
        >
          {checked && !disabled && (
            <Check className="h-3.5 w-3.5 stroke-white" strokeWidth={1.94} />
          )}
          {checked && disabled && (
            <Check className="h-3.5 w-3.5 stroke-gray-200 dark:stroke-gray-800" strokeWidth={2.33} />
          )}
        </div>
      </div>
      {label}
    </label>
  );
}
