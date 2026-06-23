'use client';

import * as React from 'react';
import { useState } from 'react';
import { FormField, inputBaseClasses } from './form-field';
import { cn } from '@/components/prog/cn';

const countryCodes: Record<string, string> = {
  US: '+1',
  GB: '+44',
  CA: '+1',
  AU: '+61',
};

const countryPlaceholders: Record<string, string> = {
  US: '+1 (555) 000-0000',
  GB: '+44 7700 900000',
  CA: '+1 (555) 000-0000',
  AU: '+61 400 000 000',
};

/** Validates and filters input to only allow digits and + */
function sanitizePhoneInput(value: string): string {
  return value.replace(/[^0-9+]/g, '');
}

function ChevronDownIcon() {
  return (
    <svg
      className="stroke-current"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.79175 7.396L10.0001 12.6043L15.2084 7.396"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface FormPhoneInputProps {
  label: string;
  id?: string;
  countrySelectPosition?: 'left' | 'right';
  defaultCountry?: keyof typeof countryCodes;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  error?: string;
  state?: 'default' | 'error' | 'success' | 'disabled';
  className?: string;
}

const inputStateClasses = {
  default: '',
  error:
    'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-700 dark:focus:border-error-800',
  success:
    'border-success-300 focus:border-success-300 focus:ring-success-500/10 dark:border-success-700 dark:focus:border-success-800',
  disabled: '',
};

export function FormPhoneInput({
  label,
  id,
  countrySelectPosition = 'left',
  defaultCountry = 'AU',
  value: controlledValue,
  onChange,
  required,
  error,
  state = 'default',
  className,
}: FormPhoneInputProps) {
  const [internalCountry, setInternalCountry] = useState(defaultCountry);
  const [internalValue, setInternalValue] = useState('');
  const isControlled = controlledValue !== undefined;
  const selectedCountry = internalCountry;
  const phoneNumber = isControlled ? controlledValue : internalValue;
  const inputId = id ?? `phone-${Math.random().toString(36).slice(2)}`;

  const updateValue = React.useCallback(
    (newValue: string) => {
      const sanitized = sanitizePhoneInput(newValue);
      if (isControlled) {
        onChange?.(sanitized);
      } else {
        setInternalValue(sanitized);
      }
    },
    [isControlled, onChange]
  );

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const country = e.target.value as keyof typeof countryCodes;
    setInternalCountry(country);
    const code = countryCodes[country] ?? '';
    if (isControlled) {
      onChange?.(code);
    } else {
      setInternalValue(code);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateValue(e.target.value);
  };

  const selectClasses =
    'focus:border-brand-300 focus:ring-brand-500/10 appearance-none rounded-l-lg border-0 border-r border-gray-200 bg-transparent bg-none py-3 pr-8 pl-3.5 leading-tight text-gray-700 focus:ring-3 focus:outline-none dark:border-gray-800 dark:text-gray-400';
  const selectClassesRight =
    'focus:border-brand-300 focus:ring-brand-500/10 appearance-none rounded-r-lg border-0 border-l border-gray-200 bg-transparent bg-none py-3 pr-8 pl-3.5 leading-tight text-gray-700 focus:ring-3 focus:outline-none dark:border-gray-800 dark:text-gray-400';

  const inputPadding =
    countrySelectPosition === 'left' ? 'pl-[84px]' : 'pr-[84px]';
  const placeholder = countryPlaceholders[selectedCountry] ?? countryPlaceholders.AU;

  const resolvedState = error ? 'error' : state;

  return (
    <FormField label={label} htmlFor={inputId} required={required} error={error}>
      <div className="relative">
        {countrySelectPosition === 'left' ? (
          <>
            <div className="absolute">
              <select
                value={selectedCountry}
                onChange={handleCountryChange}
                className={selectClasses}
              >
                {Object.keys(countryCodes).map((code) => (
                  <option key={code} value={code} className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">
                    {code}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-700 dark:text-gray-400">
                <ChevronDownIcon />
              </div>
            </div>
            <input
              id={inputId}
              type="tel"
              value={phoneNumber}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={cn(inputBaseClasses, inputPadding, inputStateClasses[resolvedState], className)}
            />
          </>
        ) : (
          <>
            <div className="absolute right-0">
              <select
                value={selectedCountry}
                onChange={handleCountryChange}
                className={selectClassesRight}
              >
                {Object.keys(countryCodes).map((code) => (
                  <option key={code} value={code} className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">
                    {code}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-700 dark:text-gray-400">
                <ChevronDownIcon />
              </div>
            </div>
            <input
              id={inputId}
              type="tel"
              value={phoneNumber}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={cn(inputBaseClasses, 'pr-[84px]', inputStateClasses[resolvedState], className)}
            />
          </>
        )}
      </div>
    </FormField>
  );
}
