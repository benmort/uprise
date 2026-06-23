'use client';

import * as React from 'react';
import { FormField } from './form-field';
import { cn } from '@/components/prog/cn';

export interface FormFileInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'className'> {
  label: string;
  id?: string;
  className?: string;
}

export function FormFileInput({ label, id, className, ...props }: FormFileInputProps) {
  const inputId = id ?? `file-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId}>
      <input
        id={inputId}
        type="file"
        className={cn(
          'shadow-theme-xs h-11 w-full overflow-hidden rounded-lg border border-gray-300 bg-transparent text-sm text-gray-500 transition-colors',
          'file:mr-5 file:border-collapse file:cursor-pointer file:rounded-l-lg file:border-0 file:border-r file:border-solid file:border-gray-200 file:bg-gray-50 file:py-3 file:pr-3 file:pl-3.5 file:text-sm file:text-gray-700',
          'placeholder:text-gray-400 hover:file:bg-gray-100 focus:outline-none',
          'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:text-white/90 dark:file:border-gray-800 dark:file:bg-white/[0.03] dark:file:text-gray-400 dark:placeholder:text-gray-400',
          className
        )}
        {...props}
      />
    </FormField>
  );
}
