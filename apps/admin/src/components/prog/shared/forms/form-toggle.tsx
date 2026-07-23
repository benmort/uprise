'use client';

import * as React from 'react';
import { cn } from "@uprise/ui";

export interface FormToggleProps {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  variant?: 'brand' | 'gray';
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function FormToggle({
  id,
  label,
  checked = false,
  disabled = false,
  variant = 'brand',
  onChange,
  className,
}: FormToggleProps) {
  const labelClasses = disabled
    ? 'flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-400 select-none'
    : 'flex cursor-pointer items-center gap-3 text-sm font-medium text-gray-700 select-none dark:text-gray-400';

  const trackClasses =
    variant === 'brand'
      ? checked
        ? 'bg-brand-500 dark:bg-brand-500'
        : 'bg-gray-200 dark:bg-white/10'
      : checked
        ? 'bg-gray-700 dark:bg-white/10'
        : 'bg-gray-200 dark:bg-gray-800';

  const thumbClasses = disabled ? 'bg-gray-50' : 'bg-white';

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
            'block h-6 w-11 rounded-full duration-300 ease-linear',
            disabled ? 'bg-gray-100 dark:bg-gray-800' : trackClasses
          )}
        />
        <div
          className={cn(
            'shadow-theme-sm absolute top-0.5 left-0.5 h-5 w-5 rounded-full duration-300 ease-linear',
            thumbClasses,
            checked ? 'translate-x-full' : 'translate-x-0'
          )}
        />
      </div>
      {label}
    </label>
  );
}
