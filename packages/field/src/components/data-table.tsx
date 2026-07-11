import * as React from "react";
import { cn, PaginationControls } from "@uprise/ui";

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
   * Pass `0` to disable pagination (the caller already paginates its own data, e.g. server-side).
   */
  pageSize?: number;
};

/** Light, hairline-ruled table with tabular numerals, and built-in pagination (10 rows/page). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  className,
  pageSize = 10,
}: DataTableProps<T>) {
  const [page, setPage] = React.useState(0);
  const paginated = pageSize > 0 && rows.length > pageSize;
  const totalPages = paginated ? Math.ceil(rows.length / pageSize) : 1;
  // A filter/search that changes the result count returns you to the first page.
  React.useEffect(() => setPage(0), [rows.length]);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = paginated ? rows.slice(safePage * pageSize, safePage * pageSize + pageSize) : rows;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-muted-foreground",
                  col.numeric && "text-right",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                {empty ?? "No records."}
              </td>
            </tr>
          ) : (
            pageRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-[hsl(var(--muted))] last:border-0",
                  onRowClick && "cursor-pointer hover:bg-surface",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-foreground",
                      col.numeric && "text-right tabular-nums",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
      {paginated ? (
        <div className="flex items-center justify-end">
          <PaginationControls
            page={safePage}
            pageSize={pageSize}
            total={rows.length}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          />
        </div>
      ) : null}
    </div>
  );
}
