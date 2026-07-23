'use client';

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { FormField } from './form-field';
import { cn } from "@uprise/ui";
import { ChevronDown, X } from 'lucide-react';

export interface FormMultiSelectOption {
  id: number;
  name: string;
}

export interface FormMultiSelectProps {
  label: string;
  id?: string;
  options: FormMultiSelectOption[];
  value?: number[];
  onChange?: (value: number[]) => void;
  placeholder?: string;
  className?: string;
}

export function FormMultiSelect({
  label,
  id,
  options,
  value = [],
  onChange,
  placeholder = 'Select options...',
  className,
}: FormMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (optionId: number) => {
    const next = selected.includes(optionId)
      ? selected.filter((i) => i !== optionId)
      : [...selected, optionId];
    setSelected(next);
    onChange?.(next);
  };

  const inputId = id ?? `multiselect-${Math.random().toString(36).slice(2)}`;

  return (
    <FormField label={label} htmlFor={inputId}>
      <div ref={containerRef} className={cn('relative', className)}>
        <input type="hidden" name="selected_options" value={selected.join(',')} />
        <div
          onClick={() => setOpen(!open)}
          className="shadow-theme-xs flex min-h-11 cursor-pointer gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 transition dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {selected.length === 0 ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</span>
            ) : (
              selected.map((id) => {
                const opt = options.find((o) => o.id === id);
                return (
                  <div
                    key={id}
                    className="group flex items-center justify-center rounded-full border-[0.7px] border-transparent bg-gray-100 py-1 pr-2 pl-2.5 text-sm text-gray-800 hover:border-gray-200 dark:bg-gray-800 dark:text-white/90 dark:hover:border-gray-800"
                  >
                    <span>{opt?.name ?? id}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOption(id);
                      }}
                      className="ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      <X className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-start pt-1.5">
            <ChevronDown
              className={cn(
                'h-5 w-5 shrink-0 text-gray-500 transition-transform dark:text-gray-400',
                open && 'rotate-180'
              )}
            />
          </div>
        </div>
        {open && (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div className="max-h-64 overflow-y-auto">
              {options.map((option) => (
                <div
                  key={option.id}
                  onClick={() => toggleOption(option.id)}
                  className="cursor-pointer border-b border-gray-200 px-4 py-3 text-sm transition last:border-b-0 dark:border-gray-800"
                >
                  <span className="text-gray-800 dark:text-white/90">{option.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </FormField>
  );
}
