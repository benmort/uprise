'use client';

import * as React from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";

export interface FormInputWithIconProps extends Omit<React.ComponentProps<'input'>, 'className'> {
  label: string;
  id?: string;
  icon: React.ReactNode;
  iconPosition?: 'left' | 'right';
  inputPadding?: string;
  required?: boolean;
  className?: string;
}

export function FormInputWithIcon({
  label,
  id,
  icon,
  iconPosition = 'left',
  inputPadding,
  required,
  className,
  ...props
}: FormInputWithIconProps) {
  const inputId = id ?? `input-icon-${Math.random().toString(36).slice(2)}`;
  const padding = inputPadding ?? (iconPosition === 'left' ? 'pl-[62px]' : 'pr-[62px]');

  const iconWrapper =
    iconPosition === 'left' ? (
      <span className="absolute top-1/2 left-0 -translate-y-1/2 border-r border-gray-200 px-3.5 py-3 text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {icon}
      </span>
    ) : (
      <span className="absolute top-1/2 right-0 -translate-y-1/2 border-l border-gray-200 py-3 pr-3 pl-3.5 text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {icon}
      </span>
    );

  return (
    <FormField label={label} htmlFor={inputId} required={required}>
      <div className="relative">
        <input
          id={inputId}
          className={cn(inputBaseClasses, padding, className)}
          {...props}
        />
        {iconWrapper}
      </div>
    </FormField>
  );
}
