'use client';

import * as React from 'react';
import { cn } from "@uprise/ui";

export interface FormRadioProps {
  id: string;
  label: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function FormRadio({
  id,
  label,
  name,
  checked = false,
  disabled = false,
  onChange,
  className,
}: FormRadioProps) {
  const labelClasses = disabled
    ? 'flex cursor-pointer items-center text-sm font-medium text-gray-300 select-none dark:text-gray-700'
    : 'flex cursor-pointer items-center text-sm font-medium text-gray-700 select-none dark:text-gray-400';

  return (
    <label htmlFor={id} className={cn(labelClasses, className)}>
      <div className="relative">
        <input
          type="radio"
          id={id}
          name={name ?? id}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="sr-only"
        />
        <div
          className={cn(
            'mr-3 flex h-5 w-5 items-center justify-center rounded-full border-[1.25px]',
            checked
              ? 'border-brand-500 bg-brand-500'
              : 'bg-transparent border-gray-300 dark:border-gray-700',
            !disabled && 'hover:border-brand-500 dark:hover:border-brand-500',
            disabled && 'border-gray-200 dark:border-gray-800 bg-transparent'
          )}
        >
          {checked && (
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                disabled ? 'bg-gray-200 dark:bg-[#171f2e]' : 'bg-white dark:bg-[#171f2e]'
              )}
            />
          )}
        </div>
      </div>
      {label}
    </label>
  );
}
