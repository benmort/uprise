/**
 * Pure helpers for URL-driven list pagination. The React glue that reads these off the router
 * lives in `@/hooks/use-pagination-params`; keeping the logic here makes it unit-testable without
 * a DOM. The URL is 1-based (`?page=1` is the first page, human-friendly) while the app works
 * 0-based; defaults (`page 1`, `per = defaultPageSize`) are omitted from the query for clean URLs.
 */
export type PaginationOpts = {
  /** Rows per page when `per` is absent. Default 10 — the shared admin list default. */
  defaultPageSize?: number;
  pageKey?: string;
  perKey?: string;
};

const DEFAULTS = { defaultPageSize: 10, pageKey: "page", perKey: "per" } as const;

/** Current 0-based page + page size parsed from the query. Junk/negative values fall back to defaults. */
export function readPaginationParams(
  search: URLSearchParams,
  opts: PaginationOpts = {},
): { page: number; pageSize: number } {
  const { defaultPageSize, pageKey, perKey } = { ...DEFAULTS, ...opts };
  const rawPage = Number(search.get(pageKey));
  const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage - 1 : 0;
  const rawPer = Number(search.get(perKey));
  const pageSize = Number.isInteger(rawPer) && rawPer > 0 ? rawPer : defaultPageSize;
  return { page, pageSize };
}

/**
 * The query string (no leading `?`) after applying a page/per patch to `search`. `page` is the
 * 0-based app page; both keys are dropped when they equal their default so the first page / default
 * size produce a bare URL. Other existing query params are preserved.
 */
export function paginationSearch(
  search: URLSearchParams,
  patch: { page?: number; per?: number },
  opts: PaginationOpts = {},
): string {
  const { defaultPageSize, pageKey, perKey } = { ...DEFAULTS, ...opts };
  const sp = new URLSearchParams(search.toString());
  if (patch.page !== undefined) {
    if (patch.page <= 0) sp.delete(pageKey);
    else sp.set(pageKey, String(patch.page + 1));
  }
  if (patch.per !== undefined) {
    if (patch.per === defaultPageSize) sp.delete(perKey);
    else sp.set(perKey, String(patch.per));
  }
  return sp.toString();
}
