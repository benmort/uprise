import { Button } from "./button";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  /** When provided (with `pageSizeOptions`), renders a rows-per-page selector. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
};

export function PaginationControls({
  page,
  pageSize,
  total,
  onPrev,
  onNext,
  onPageSizeChange,
  pageSizeOptions,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;
  const showPerSelect = !!onPageSizeChange && !!pageSizeOptions?.length;

  return (
    <div className="flex items-center gap-2">
      {showPerSelect ? (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange!(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 rounded-lg border border-border bg-surface px-1.5 text-xs font-semibold text-foreground"
          >
            {pageSizeOptions!.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev}>
        Previous
      </Button>
      <span className="text-xs text-muted-foreground">
        Page {Math.min(page + 1, totalPages)} of {totalPages}
      </span>
      <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}
