'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@uprise/ui';
import { cn } from '@/components/prog/cn';

export interface PaginationProps {
  /** Current page (1-based) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when user selects a page (1-based) */
  onPageChange: (page: number) => void;
  /** Optional class for the root container */
  className?: string;
}

/**
 * Builds an array of page numbers and 'ellipsis' for the pagination strip.
 * e.g. [1, 2, 3, 'ellipsis', 8, 9, 10]
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  const showLeftEllipsis = currentPage > 3;
  const showRightEllipsis = currentPage < totalPages - 2;

  if (showLeftEllipsis) pages.push('ellipsis');

  const midStart = Math.max(2, currentPage - 1);
  const midEnd = Math.min(totalPages - 1, currentPage + 1);
  for (let i = midStart; i <= midEnd; i++) {
    pages.push(i);
  }

  if (showRightEllipsis) pages.push('ellipsis');
  pages.push(totalPages);

  return pages;
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages < 1) return null;

  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div
      className={cn(
        'flex items-center justify-between border-t border-gray-200 px-6 py-4 dark:border-gray-800',
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        disabled={!canPrev}
        onClick={() => onPageChange(currentPage - 1)}
        className="flex h-10 items-center gap-2 rounded-lg border-gray-300 bg-white px-2 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50 sm:px-3.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
      >
        <ChevronLeft className="h-5 w-5 fill-current" />
        <span className="hidden sm:inline">Previous</span>
      </Button>

      <span className="block text-sm font-medium text-gray-700 sm:hidden dark:text-gray-400">
        Page {currentPage} of {totalPages}
      </span>

      <ul className="hidden items-center gap-0.5 sm:flex">
        {pageNumbers.map((item, idx) =>
          item === 'ellipsis' ? (
            <li key={`ellipsis-${idx}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium text-gray-700 dark:text-gray-400">
                ...
              </span>
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                onClick={() => onPageChange(item)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  item === currentPage
                    ? 'bg-brand-500/10 text-brand-500 dark:bg-brand-500/10 dark:text-brand-500'
                    : 'text-gray-700 hover:bg-brand-500/10 hover:text-brand-500 dark:text-gray-400 dark:hover:bg-brand-500/10 dark:hover:text-brand-500',
                )}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ul>

      <Button
        type="button"
        variant="outline"
        disabled={!canNext}
        onClick={() => onPageChange(currentPage + 1)}
        className="flex h-10 items-center gap-2 rounded-lg border-gray-300 bg-white px-2 py-2 font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50 sm:px-3.5 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-5 w-5 fill-current" />
      </Button>
    </div>
  );
}
