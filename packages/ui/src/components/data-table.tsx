import * as React from "react";
import { cn } from "../lib/utils";
import { PaginationControls } from "./pagination-controls";
import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  /** Render a cell. */
  cell: (row: T) => React.ReactNode;
  /** Right-align + tabular-nums for counts. */
  numeric?: boolean;
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
  /**
   * Client-side rows per page. Defaults to 10 — the shared list default across the admin.
   * Pass `0` to disable pagination (the caller already paginates its own data, e.g. server-side —
   * compose with `ListFooter` for the summary + pager in that case).
   */
  pageSize?: number;
  /**
   * Controlled pagination. Pass `page` + `onPageChange` to drive the current page from outside
   * (e.g. `usePaginationParams`, which binds it to the URL). Omitted → the table owns its own page.
   */
  page?: number;
  onPageChange?: (page: number) => void;
  /** Provide to render a rows-per-page selector (the `per` control). */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Render skeleton rows instead of the body — the loading face of a data surface. */
  loading?: boolean;
  skeletonRows?: number;
  /** Per-row extra classes (e.g. a warning tint on a failing row). */
  rowClassName?: (row: T) => string | undefined;
  id?: string;
  "aria-label"?: string;
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * The default admin table: config-driven columns over the `Table*` primitives (one visual
 * source — headers, rules and hover all come from there), tabular numerals, built-in
 * pagination, and a loading face. For genuinely irregular layouts compose the `Table*`
 * primitives directly instead.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  pageSize = 10,
  page,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  loading = false,
  skeletonRows = 5,
  rowClassName,
  id,
  "aria-label": ariaLabel,
}: DataTableProps<T>) {
  // Controlled when the caller supplies both `page` and `onPageChange`; else internal state.
  const [internalPage, setInternalPage] = React.useState(0);
  const controlled = page !== undefined && onPageChange !== undefined;
  const currentPage = controlled ? page! : internalPage;
  const setPage = React.useCallback(
    (p: number) => (controlled ? onPageChange!(p) : setInternalPage(p)),
    [controlled, onPageChange],
  );

  const paginated = pageSize > 0 && rows.length > pageSize;
  const totalPages = paginated ? Math.ceil(rows.length / pageSize) : 1;

  // A filter/search that changes the result count returns you to the first page. Guarded via refs
  // so it skips the initial mount and never re-fires while paginating (deps stay [rows.length]).
  const resetRef = React.useRef<() => void>(() => {});
  resetRef.current = () => {
    if (currentPage !== 0) setPage(0);
  };
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    resetRef.current();
  }, [rows.length]);

  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const pageRows = paginated ? rows.slice(safePage * pageSize, safePage * pageSize + pageSize) : rows;

  return (
    <div id={id} className={cn("space-y-3", className)}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Table aria-label={ariaLabel}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn(col.numeric && "text-right", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.max(1, skeletonRows) }, (_unused, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className={cn("h-4 w-full max-w-32", col.numeric && "ml-auto")} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                  {empty ?? "No records."}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(col.numeric && "text-right tabular-nums", col.className)}
                    >
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {paginated ? (
        <div className="flex items-center justify-end">
          <PaginationControls
            page={safePage}
            pageSize={pageSize}
            total={rows.length}
            onPrev={() => setPage(Math.max(0, safePage - 1))}
            onNext={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={onPageSizeChange ? pageSizeOptions : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
