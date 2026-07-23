'use client';

import * as React from 'react';
import { useState } from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";
import { Copy } from 'lucide-react';

export interface FormCopyInputProps extends Omit<React.ComponentProps<'input'>, 'className'> {
  label: string;
  id?: string;
  copyButtonText?: string;
  className?: string;
}

export function FormCopyInput({
  label,
  id,
  copyButtonText = 'Copy',
  value,
  className,
  ...props
}: FormCopyInputProps) {
  const [copied, setCopied] = useState(false);
  const inputId = id ?? `copy-${Math.random().toString(36).slice(2)}`;

  const handleCopy = async () => {
    const val = typeof value === 'string' ? value : (props.defaultValue as string) ?? '';
    try {
      await navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <FormField label={label} htmlFor={inputId}>
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-1/2 right-0 inline-flex -translate-y-1/2 cursor-pointer items-center gap-1 border-l border-gray-200 py-3 pr-3 pl-3.5 text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-400"
        >
          <Copy className="h-5 w-5 fill-current" />
          <span>{copied ? 'Copied!' : copyButtonText}</span>
        </button>
        <input
          id={inputId}
          type="url"
          value={value}
          className={cn(inputBaseClasses, 'py-3 pr-[90px] pl-4', className)}
          readOnly
          {...props}
        />
      </div>
    </FormField>
  );
}
