import { describe, it, expect } from "vitest";
import { readPaginationParams, paginationSearch } from "./pagination-params";

const sp = (q: string) => new URLSearchParams(q);

describe("readPaginationParams", () => {
  it("defaults to page 0 + default size when absent", () => {
    expect(readPaginationParams(sp(""))).toEqual({ page: 0, pageSize: 10 });
  });

  it("maps 1-based URL page to 0-based", () => {
    expect(readPaginationParams(sp("page=1")).page).toBe(0);
    expect(readPaginationParams(sp("page=3")).page).toBe(2);
  });

  it("reads per as the page size", () => {
    expect(readPaginationParams(sp("per=25")).pageSize).toBe(25);
  });

  it("falls back on junk / out-of-range values", () => {
    expect(readPaginationParams(sp("page=0&per=0"))).toEqual({ page: 0, pageSize: 10 });
    expect(readPaginationParams(sp("page=-2&per=-5"))).toEqual({ page: 0, pageSize: 10 });
    expect(readPaginationParams(sp("page=abc&per=xyz"))).toEqual({ page: 0, pageSize: 10 });
    expect(readPaginationParams(sp("page=2.5"))).toEqual({ page: 0, pageSize: 10 });
  });

  it("honours a custom defaultPageSize + keys", () => {
    expect(readPaginationParams(sp("p=2&n=50"), { pageKey: "p", perKey: "n", defaultPageSize: 20 })).toEqual({
      page: 1,
      pageSize: 50,
    });
    expect(readPaginationParams(sp(""), { defaultPageSize: 20 }).pageSize).toBe(20);
  });
});

describe("paginationSearch", () => {
  it("writes a 0-based page as 1-based, dropping page 0", () => {
    expect(paginationSearch(sp(""), { page: 2 })).toBe("page=3");
    expect(paginationSearch(sp("page=3"), { page: 0 })).toBe("");
  });

  it("writes per, dropping it at the default", () => {
    expect(paginationSearch(sp(""), { per: 25 })).toBe("per=25");
    expect(paginationSearch(sp("per=25"), { per: 10 })).toBe("");
  });

  it("preserves unrelated params", () => {
    expect(paginationSearch(sp("q=abc"), { page: 1 })).toBe("q=abc&page=2");
  });

  it("applies page + per together", () => {
    expect(paginationSearch(sp(""), { page: 1, per: 50 })).toBe("page=2&per=50");
  });

  it("respects custom keys + default size", () => {
    expect(paginationSearch(sp(""), { per: 20 }, { perKey: "n", defaultPageSize: 20 })).toBe("");
    expect(paginationSearch(sp(""), { page: 1, per: 50 }, { pageKey: "p", perKey: "n" })).toBe("p=2&n=50");
  });
});
