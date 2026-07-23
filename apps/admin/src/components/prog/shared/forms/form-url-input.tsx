'use client';

import * as React from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";

export interface FormUrlInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'className'> {
  label: string;
  id?: string;
  prefix?: string;
  className?: string;
}

export function FormUrlInput({
  label,
  id,
  prefix = 'http://',
  className,
  ...props
}: FormUrlInputProps) {
  const inputId = id ?? `url-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId}>
      <div className="relative">
        <span className="absolute top-1/2 left-0 inline-flex h-11 -translate-y-1/2 items-center justify-center border-r border-gray-200 py-3 pr-3 pl-3.5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
          {prefix}
        </span>
        <input
          id={inputId}
          type="url"
          className={cn(inputBaseClasses, 'pl-[90px]', className)}
          {...props}
        />
      </div>
    </FormField>
  );
}
