import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApi } from "./use-api";
import { __clearApiCache } from "./use-api-cache";

/**
 * The admin app's single data-fetching primitive — and, until jsdom landed, structurally
 * impossible to test: it lives in `src/lib` (inside the gated coverage scope) while the runner
 * was `environment: "node"`. It sat at 0%.
 *
 * Its pure engine (use-api-cache) is separately tested at ~91%; what is exercised here is the
 * React binding the whole app actually consumes — the state precedence every screen renders from.
 */

const ok = <T,>(data: T) => async () => ({ ok: true as const, data });
const fail = (error: string, status?: number) => async () => ({ ok: false as const, error, status });

beforeEach(() => __clearApiCache());
afterEach(() => vi.useRealTimers());

describe("useApi state precedence", () => {
  it("starts loading, then resolves to data with no error", async () => {
    const { result } = renderHook(() => useApi("/k1", ok({ hello: "world" })));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual({ hello: "world" }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  // The comment on the hook is explicit that loading must go FALSE the moment a fetch fails,
  // or the error/retry state is unreachable and the screen spins forever.
  it("leaves loading once a fetch fails, so the error state is reachable", async () => {
    const { result } = renderHook(() => useApi("/k2", fail("boom")));
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  // Four feedback states are a house invariant; no-permission is the one that must not read as
  // a generic error, because the UI renders a different surface for it.
  it("flags a 403 as noPermission, not just an error", async () => {
    const { result } = renderHook(() => useApi("/k3", fail("Missing permission", 403)));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.noPermission).toBe(true);
  });

  it("does not flag a non-403 failure as noPermission", async () => {
    const { result } = renderHook(() => useApi("/k4", fail("server exploded", 500)));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.noPermission).toBe(false);
  });

  // A null key is how a screen says "not yet" (e.g. targeting off, no id resolved). It must not
  // fetch and must not sit in a permanent loading state.
  it("a null key fetches nothing and is not loading", async () => {
    const fn = vi.fn(ok({ a: 1 }));
    const { result } = renderHook(() => useApi(null, fn));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    await new Promise((r) => setTimeout(r, 20));
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("useApi refetch + mutate", () => {
  it("refetch re-runs the fetcher and updates data", async () => {
    let n = 0;
    const { result } = renderHook(() => useApi("/k5", async () => ({ ok: true as const, data: ++n })));
    await waitFor(() => expect(result.current.data).toBe(1));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toBe(2);
  });

  it("mutate writes the value optimistically, and accepts an updater", async () => {
    const { result } = renderHook(() => useApi<number>("/k6", ok(10)));
    await waitFor(() => expect(result.current.data).toBe(10));
    act(() => result.current.mutate(42));
    expect(result.current.data).toBe(42);
    act(() => result.current.mutate((c) => (c ?? 0) + 1));
    expect(result.current.data).toBe(43);
  });

  it("mutate on a null key is a no-op rather than a throw", () => {
    const { result } = renderHook(() => useApi<number>(null, ok(1)));
    expect(() => act(() => result.current.mutate(5))).not.toThrow();
    expect(result.current.data).toBeUndefined();
  });
});

describe("useApi caching + keys", () => {
  it("two hooks on the same key share one fetch", async () => {
    const fn = vi.fn(ok({ v: 1 }));
    const a = renderHook(() => useApi("/shared", fn));
    const b = renderHook(() => useApi("/shared", fn));
    await waitFor(() => expect(a.result.current.data).toEqual({ v: 1 }));
    await waitFor(() => expect(b.result.current.data).toEqual({ v: 1 }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("changing the key fetches the new key", async () => {
    const { result, rerender } = renderHook(({ k }: { k: string }) => useApi(k, ok(k)), {
      initialProps: { k: "/one" },
    });
    await waitFor(() => expect(result.current.data).toBe("/one"));
    rerender({ k: "/two" });
    await waitFor(() => expect(result.current.data).toBe("/two"));
  });

  // ttlMs is what stops every mount re-hitting the API; a fresh entry must be served as-is.
  it("serves a fresh cached entry without refetching under ttlMs", async () => {
    const fn = vi.fn(ok({ v: 1 }));
    const first = renderHook(() => useApi("/ttl", fn, { ttlMs: 60_000 }));
    await waitFor(() => expect(first.result.current.data).toEqual({ v: 1 }));
    first.unmount();
    const second = renderHook(() => useApi("/ttl", fn, { ttlMs: 60_000 }));
    await waitFor(() => expect(second.result.current.data).toEqual({ v: 1 }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
