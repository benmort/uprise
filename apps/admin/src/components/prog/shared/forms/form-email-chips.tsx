'use client';

import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
import { FormField } from './form-field';
import { cn } from "@uprise/ui";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export interface FormEmailChipsProps {
  label: string;
  id?: string;
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  className?: string;
}

export function FormEmailChips({
  label,
  id,
  value = [],
  onChange,
  placeholder = 'Enter email and press Enter, comma, or space',
  disabled = false,
  error,
  required,
  className,
}: FormEmailChipsProps) {
  const [inputValue, setInputValue] = useState('');
  const [localEmails, setLocalEmails] = useState<string[]>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setLocalEmails(value);
  }, [value]);

  const addEmail = useCallback(
    (email: string) => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed || !isValidEmail(trimmed)) return;
      if (localEmails.includes(trimmed)) return;
      const next = [...localEmails, trimmed];
      setLocalEmails(next);
      onChange?.(next);
      setInputValue('');
    },
    [localEmails, onChange]
  );

  const removeEmail = useCallback(
    (email: string) => {
      const next = localEmails.filter((e) => e !== email);
      setLocalEmails(next);
      onChange?.(next);
    },
    [localEmails, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      if (inputValue.trim()) {
        addEmail(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && localEmails.length > 0) {
      removeEmail(localEmails[localEmails.length - 1]);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addEmail(inputValue);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    const parts = pasted.split(/[\s,;]+/).filter(Boolean);
    if (parts.length > 1) {
      e.preventDefault();
      const valid = parts.filter((p) => isValidEmail(p.trim()));
      if (valid.length > 0) {
        const next = [...localEmails];
        valid.forEach((p) => {
          const t = p.trim().toLowerCase();
          if (!next.includes(t)) next.push(t);
        });
        setLocalEmails(next);
        onChange?.(next);
        setInputValue('');
      }
    }
  };

  const inputId = id ?? `email-chips-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId} error={error} required={required} disabled={disabled}>
      <div
        className={cn(
          'relative z-20 inline-block w-full',
          className
        )}
      >
        <div
          className={cn(
            'relative flex min-h-11 flex-col items-center rounded-lg border py-1.5 pl-3 pr-3 shadow-theme-xs outline-hidden transition focus-within:border-brand-300 focus-within:shadow-focus-ring dark:focus-within:border-brand-300',
            error
              ? 'border-error-300 dark:border-error-700'
              : 'border-gray-300 dark:border-gray-700 dark:bg-gray-900',
            disabled && 'cursor-not-allowed opacity-60'
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <div className="flex w-full flex-auto flex-wrap items-center gap-2">
            {localEmails.map((email) => (
              <div
                key={email}
                className="group flex items-center justify-center rounded-full border-[0.7px] border-transparent bg-gray-100 py-1 pl-2.5 pr-2 text-sm text-gray-800 hover:border-gray-200 dark:bg-gray-800 dark:text-white/90 dark:hover:border-gray-800"
              >
                <span className="max-w-full flex-initial truncate">{email}</span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeEmail(email);
                  }}
                  disabled={disabled}
                  className="pl-2 text-gray-500 cursor-pointer group-hover:text-gray-400 dark:text-gray-400 disabled:cursor-not-allowed"
                  aria-label={`Remove ${email}`}
                >
                  <svg
                    className="fill-current"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M3.40717 4.46881C3.11428 4.17591 3.11428 3.70104 3.40717 3.40815C3.70006 3.11525 4.17494 3.11525 4.46783 3.40815L6.99943 5.93975L9.53095 3.40822C9.82385 3.11533 10.2987 3.11533 10.5916 3.40822C10.8845 3.70112 10.8845 4.17599 10.5916 4.46888L8.06009 7.00041L10.5916 9.53193C10.8845 9.82482 10.8845 10.2997 10.5916 10.5926C10.2987 10.8855 9.82385 10.8855 9.53095 10.5926L6.99943 8.06107L4.46783 10.5927C4.17494 10.8856 3.70006 10.8856 3.40717 10.5927C3.11428 10.2998 3.11428 9.8249 3.40717 9.53201L5.93877 7.00041L3.40717 4.46881Z"
                    />
                  </svg>
                </button>
              </div>
            ))}
            <input
              ref={inputRef}
              id={inputId}
              type="email"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              onPaste={handlePaste}
              disabled={disabled}
              placeholder={localEmails.length === 0 ? placeholder : ''}
              className="min-w-[120px] flex-1 border-0 bg-transparent py-1 text-sm text-gray-800 placeholder:text-gray-500 focus:outline-none focus:ring-0 dark:text-white/90 dark:placeholder:text-white/30"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="sr-only">Selected emails: {localEmails.join(', ')}</p>
      </div>
    </FormField>
  );
}
