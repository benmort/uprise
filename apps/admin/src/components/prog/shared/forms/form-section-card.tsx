'use client';

import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/components/prog/cn';

export interface FormSectionCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When true, card body is collapsible with a toggle. */
  collapsible?: boolean;
  /** When collapsible, start collapsed. */
  defaultCollapsed?: boolean;
  /** When true, show green check in header (e.g. step complete). */
  completed?: boolean;
}

export function FormSectionCard({
  title,
  description,
  icon,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
  completed = false,
}: FormSectionCardProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const header = (
    <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800 sm:px-6">
      <h3 className="text-lg font-medium text-gray-800 dark:text-white/90 flex items-center gap-2">
        {!completed && icon}
        {title}
        <span className="ml-auto flex items-center gap-2">
          {completed && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/20">
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          )}
          {collapsible && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-expanded={!collapsed}
          >
            <ChevronDown
              className={cn('h-4 w-4 text-gray-500 transition-transform dark:text-gray-400', !collapsed && 'rotate-180')}
            />
          </button>
          )}
        </span>
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
    </div>
  );

  const body = (
    <div className="space-y-6 border-t border-gray-100 p-5 sm:p-6 dark:border-gray-800">
      {children}
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]',
        className
      )}
    >
      {collapsible ? (
        <>
          <div
            role="button"
            tabIndex={0}
            className={cn('flex items-start', collapsed && 'cursor-pointer')}
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            onKeyDown={collapsed ? (e) => e.key === 'Enter' && setCollapsed(false) : undefined}
          >
            {header}
          </div>
          {!collapsed && body}
        </>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </div>
  );
}
