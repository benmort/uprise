import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearApiCache,
  entryFor,
  invalidateApi,
  isFresh,
  peekEntry,
  revalidate,
  subscribeKey,
  writeEntry,
} from "./use-api-cache";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const fail = (error: string, status?: number) => ({ ok: false as const, error, status });

afterEach(() => {
  __clearApiCache();
  vi.useRealTimers();
});

describe("use-api cache engine", () => {
  it("caches a successful fetch and reports freshness by TTL", async () => {
    await revalidate("/k", async () => ok([1, 2]));
    expect(peekEntry("/k")?.data).toEqual([1, 2]);
    expect(isFresh("/k", 60_000)).toBe(true);
    expect(isFresh("/k", 0)).toBe(false); // ttl 0 = always revalidate
  });

  it("dedups concurrent revalidations into one in-flight fetch", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ok("v");
    });
    const p1 = revalidate("/k", fn);
    const p2 = revalidate("/k", fn); // joins the in-flight promise
    await Promise.all([p1, p2]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keeps last-good data on error and records the status (403 → noPermission)", async () => {
    await revalidate("/k", async () => ok("good"));
    await revalidate("/k", async () => fail("Forbidden", 403));
    const entry = peekEntry("/k")!;
    expect(entry.data).toBe("good"); // stale data survives the failure
    expect(entry.error).toBe("Forbidden");
    expect(entry.status).toBe(403);
  });

  it("an aborted fetch never writes error state or clobbers data", async () => {
    await revalidate("/k", async () => ok("v1"));
    const unsub = subscribeKey("/k", () => {});
    const slow = revalidate("/k", async (signal) => {
      await new Promise((r) => setTimeout(r, 30));
      // request() flattens AbortError into {ok:false} – simulate that:
      if (signal.aborted) return fail("The operation was aborted");
      return ok("v2");
    });
    unsub(); // last subscriber leaves → abort (deferred a macrotask)
    await new Promise((r) => setTimeout(r, 5)); // let the deferred abort fire
    await slow;
    const entry = peekEntry("/k")!;
    expect(entry.data).toBe("v1");
    expect(entry.error).toBeUndefined();
  });

  it("StrictMode double-mount: unsubscribe+resubscribe within a tick does NOT abort", async () => {
    const fn = vi.fn(async (signal: AbortSignal) => {
      await new Promise((r) => setTimeout(r, 20));
      return signal.aborted ? fail("aborted") : ok("mounted");
    });
    const unsub1 = subscribeKey("/k", () => {});
    const fetching = revalidate("/k", fn);
    unsub1(); // StrictMode unmount…
    subscribeKey("/k", () => {}); // …and synchronous remount, same tick
    await fetching;
    expect(peekEntry("/k")?.data).toBe("mounted"); // the fetch survived
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("invalidateApi(prefix) marks matching keys stale and refetches subscribed ones", async () => {
    // Subscribed key with a registered fetcher → refetches on invalidate.
    let version = 1;
    entryFor("/canvass/assignments?volunteerId=v1").fetcher = async () => ok(`v${version}`);
    subscribeKey("/canvass/assignments?volunteerId=v1", () => {});
    await revalidate("/canvass/assignments?volunteerId=v1");
    expect(peekEntry("/canvass/assignments?volunteerId=v1")?.data).toBe("v1");

    // Unsubscribed key just goes stale.
    await revalidate("/engagement/dispositions", async () => ok("dispositions"));

    version = 2;
    invalidateApi("/canvass");
    await new Promise((r) => setTimeout(r, 5));
    expect(peekEntry("/canvass/assignments?volunteerId=v1")?.data).toBe("v2"); // refetched
    expect(isFresh("/engagement/dispositions", 60_000)).toBe(true); // untouched prefix
  });

  it("writeEntry (mutate) is an optimistic write that notifies subscribers", async () => {
    const listener = vi.fn();
    subscribeKey("/k", listener);
    writeEntry("/k", { n: 1 });
    expect(peekEntry("/k")?.data).toEqual({ n: 1 });
    expect(listener).toHaveBeenCalled();
  });
});
