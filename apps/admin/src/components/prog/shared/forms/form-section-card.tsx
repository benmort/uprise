'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn, StatusBadge } from "@uprise/ui";

/** A settings card's setup state. Mirrors the getting-started chip vocabulary. */
export type FormSectionCardStatus = 'DONE' | 'TODO' | 'OPTIONAL';

const STATUS_LABELS: Record<FormSectionCardStatus, string> = {
  DONE: 'Done',
  TODO: 'To do',
  OPTIONAL: 'Optional',
};

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
  /**
   * Setup status chip in the header – the SAME `StatusBadge` the getting-started rows render
   * (see components/setup/setup-chip.tsx), so the vocabulary can't drift between surfaces.
   * Omit for a card that isn't part of setup: no chip, unchanged layout.
   */
  status?: FormSectionCardStatus;
}

export function FormSectionCard({
  title,
  description,
  icon,
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
  status,
}: FormSectionCardProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const header = (
    <div className="border-b border-gray-200 px-4 py-5 dark:border-gray-800 sm:px-6">
      <h3 className="text-lg font-medium text-gray-800 dark:text-white/90 flex items-center gap-2">
        {icon}
        {title}
        <span className="ml-auto flex items-center gap-2">
          {status && <StatusBadge status={status} label={STATUS_LABELS[status]} className="shrink-0" />}
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
