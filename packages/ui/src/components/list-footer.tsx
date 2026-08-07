import * as React from "react";
import { PaginationControls } from "./pagination-controls";
import { cn } from "../lib/utils";

export interface ListFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rows visible on this page. */
  shown: number;
  /** Total rows across all pages. */
  total: number;
  /** What the rows are — "audiences", "files", "deliveries". */
  noun: string;
  /** Extra text after the count (e.g. "• Updated 14:02"). */
  suffix?: React.ReactNode;
  page: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
  /** With `pageSizeOptions`, adds the rows-per-page selector. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

/**
 * The "Showing X of Y" list footer: count on the left, `PaginationControls` on the
 * right — the strip a dozen tables re-rolled. Render it under any paged list.
 */
export const ListFooter = React.forwardRef<HTMLDivElement, ListFooterProps>(
  (
    { shown, total, noun, suffix, page, pageSize, onPrev, onNext, onPageSizeChange, pageSizeOptions, className, ...rest },
    ref,
  ) => (
    <div ref={ref} className={cn("flex flex-wrap items-center justify-between gap-2", className)} {...rest}>
      <p className="text-xs text-muted-foreground">
        Showing {shown.toLocaleString()} of {total.toLocaleString()} {noun}
        {suffix}
      </p>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={pageSizeOptions}
      />
    </div>
  ),
);
ListFooter.displayName = "ListFooter";
