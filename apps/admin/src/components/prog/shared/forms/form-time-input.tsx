'use client';

import * as React from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from "@uprise/ui";

function ClockIcon() {
  return (
    <svg
      className="fill-current"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.04175 9.99984C3.04175 6.15686 6.1571 3.0415 10.0001 3.0415C13.8431 3.0415 16.9584 6.15686 16.9584 9.99984C16.9584 13.8428 13.8431 16.9582 10.0001 16.9582C6.1571 16.9582 3.04175 13.8428 3.04175 9.99984ZM10.0001 1.5415C5.32867 1.5415 1.54175 5.32843 1.54175 9.99984C1.54175 14.6712 5.32867 18.4582 10.0001 18.4582C14.6715 18.4582 18.4584 14.6712 18.4584 9.99984C18.4584 5.32843 14.6715 1.5415 10.0001 1.5415ZM9.99998 10.7498C9.58577 10.7498 9.24998 10.4141 9.24998 9.99984V5.4165C9.24998 5.00229 9.58577 4.6665 9.99998 4.6665C10.4142 4.6665 10.75 5.00229 10.75 5.4165V9.24984H13.3334C13.7476 9.24984 14.0834 9.58562 14.0834 9.99984C14.0834 10.4141 13.7476 10.7498 13.3334 10.7498H10.0001H9.99998Z"
      />
    </svg>
  );
}

export interface FormTimeInputProps extends Omit<React.ComponentProps<'input'>, 'type' | 'className'> {
  label: string;
  id?: string;
  className?: string;
}

export function FormTimeInput({ label, id, className, ...props }: FormTimeInputProps) {
  const inputId = id ?? `time-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId}>
      <div className="relative">
        <input
          id={inputId}
          type="time"
          placeholder="12:00 AM"
          className={cn(inputBaseClasses, 'appearance-none bg-none pr-11 pl-4', className)}
          {...props}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 dark:text-gray-400">
          <ClockIcon />
        </span>
      </div>
    </FormField>
  );
}
