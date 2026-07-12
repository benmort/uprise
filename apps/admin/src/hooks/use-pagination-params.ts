"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readPaginationParams, paginationSearch, type PaginationOpts } from "@/lib/pagination-params";

export type PaginationState = {
  /** 0-based current page. */
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  /** Changing the size returns to the first page. */
  setPageSize: (pageSize: number) => void;
};

/**
 * Two-way binds a list's pagination to the URL query (`?page=` 1-based, `?per=`). Drop it into any
 * admin list and feed its values to `PaginationControls` / `DataTable` so the page + rows-per-page
 * are shareable, bookmarkable, and survive a reload. Writes with `replace` (no history spam) and no
 * scroll jump. Pure parse/serialise logic lives in `@/lib/pagination-params` (unit-tested).
 */
export function usePaginationParams(opts?: PaginationOpts): PaginationState {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { page, pageSize } = readPaginationParams(search, opts);

  const go = useCallback(
    (patch: { page?: number; per?: number }) => {
      const qs = paginationSearch(search, patch, opts);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [search, router, pathname, opts],
  );

  return {
    page,
    pageSize,
    setPage: useCallback((p: number) => go({ page: p }), [go]),
    setPageSize: useCallback((per: number) => go({ per, page: 0 }), [go]),
  };
}
