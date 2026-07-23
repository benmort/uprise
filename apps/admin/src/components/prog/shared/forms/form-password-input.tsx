'use client';

import * as React from 'react';
import { useState } from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";
import { Eye, EyeOff } from 'lucide-react';

export interface FormPasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'className'> {
  label: string;
  id?: string;
  required?: boolean;
  className?: string;
}

export function FormPasswordInput({ label, id, required, className, ...props }: FormPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id ?? `password-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId} required={required}>
      <div className="relative">
        <input
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          className={cn(inputBaseClasses, 'appearance-none bg-none pr-11 pl-4', className)}
          {...props}
        />
        <span
          onClick={() => setShowPassword(!showPassword)}
          className="absolute top-1/2 right-4 z-30 -translate-y-1/2 cursor-pointer"
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          ) : (
            <Eye className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          )}
        </span>
      </div>
    </FormField>
  );
}
