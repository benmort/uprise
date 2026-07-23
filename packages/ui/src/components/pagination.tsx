import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

/** The page numbers to show around `page`, with `"…"` gaps. Always shows first + last. */
export function paginationRange(page: number, pageCount: number, siblings = 1): (number | "gap")[] {
  const total = siblings * 2 + 5; // first, last, current, 2 gaps, + siblings each side
  if (pageCount <= total) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, pageCount);
  const showLeftGap = left > 2;
  const showRightGap = right < pageCount - 1;
  const out: (number | "gap")[] = [1];
  if (showLeftGap) out.push("gap");
  for (let p = showLeftGap ? left : 2; p <= (showRightGap ? right : pageCount - 1); p++) out.push(p);
  if (showRightGap) out.push("gap");
  out.push(pageCount);
  return out;
}

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

/**
 * Numbered pager (first · … · siblings · … · last) with prev/next. For cursor / rows-per-page
 * controls use `PaginationControls`. Renders nothing for a single page.
 */
const cell =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  ({ page, pageCount, onPageChange, siblingCount = 1, className, ...props }, ref) => {
    if (pageCount <= 1) return null;
    const items = paginationRange(page, pageCount, siblingCount);
    return (
      <nav
        ref={ref}
        role="navigation"
        aria-label="Pagination"
        className={cn("flex items-center gap-1", className)}
        {...props}
      >
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={cn(cell, "text-foreground hover:bg-surface-variant disabled:pointer-events-none disabled:opacity-40")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {items.map((it, i) =>
          it === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              aria-current={it === page ? "page" : undefined}
              className={cn(
                cell,
                it === page
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-surface-variant",
              )}
            >
              {it}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={cn(cell, "text-foreground hover:bg-surface-variant disabled:pointer-events-none disabled:opacity-40")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    );
  },
);
Pagination.displayName = "Pagination";

export { Pagination };
