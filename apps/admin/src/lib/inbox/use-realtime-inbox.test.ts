import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock at the module boundary: the real "@/lib/api" drags in the cookie transport and
// @uprise/field, and would put a live fetch behind every render of this hook.
vi.mock("@/lib/api", () => ({
  getApiUrl: () => "https://api.test",
  getRealtimeStreamToken: vi.fn(),
}));

import { getRealtimeStreamToken } from "@/lib/api";
import { useRealtimeInbox } from "./use-realtime-inbox";

/**
 * The shared inbox's lifeline. Every failure mode in here is invisible on screen — a stream
 * that never reopens looks exactly like a quiet afternoon, and one that reopens too eagerly
 * silently hammers the API (and burns through the browser's ~6 connections per host). So the
 * behaviour worth pinning is the lifecycle: when it opens, what it delivers, how it backs off,
 * and that it always lets go on the way out.
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  closed = false;
  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const sources = () => FakeEventSource.instances;
const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1];
const emit = (data: string) => latest().onmessage?.({ data });

const tokenMock = getRealtimeStreamToken as unknown as ReturnType<typeof vi.fn>;
const okToken = (expiresInMs = 600_000, token = "tok-1") => ({
  ok: true as const,
  data: { token, expiresAt: new Date(Date.now() + expiresInMs).toISOString() },
});

// The connect path awaits the token before it touches EventSource, so every assertion needs
// the microtask queue flushed as well as the clock moved.
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-08T00:00:00Z"));
  FakeEventSource.instances = [];
  tokenMock.mockReset();
  tokenMock.mockImplementation(async () => okToken());
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRealtimeInbox — opening the stream", () => {
  /**
   * EventSource cannot send an Authorization header, which is the whole reason the hook fetches
   * a short-lived stream token first. If the token stops riding in the query string the stream
   * is simply unauthenticated, and the failure surfaces as an empty inbox rather than an error.
   */
  it("opens /analytics/stream with the token in the query string", async () => {
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();

    expect(sources()).toHaveLength(1);
    const url = new URL(latest().url);
    expect(url.origin + url.pathname).toBe("https://api.test/analytics/stream");
    expect(url.searchParams.get("token")).toBe("tok-1");
    // Cookies are deliberately off: the token is the credential, and withCredentials would
    // make the stream a cross-origin request the API's CORS config does not allow.
    expect(latest().init).toEqual({ withCredentials: false });
  });

  // Callers mount this hook on surfaces where realtime is switched off. Opening anyway would
  // hold a connection (and a token refresh loop) for a page that never reads it.
  it("does nothing at all while disabled", async () => {
    renderHook(() => useRealtimeInbox(vi.fn(), false));
    await tick(600_000);

    expect(tokenMock).not.toHaveBeenCalled();
    expect(sources()).toHaveLength(0);
  });

  // Navigating away mid-request is the common case (the token round trip is real network time).
  // Without the cancelled guard the reply would open a stream nobody can ever close.
  it("does not open a stream when the caller unmounted while the token was in flight", async () => {
    let release!: (value: ReturnType<typeof okToken>) => void;
    tokenMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const { unmount } = renderHook(() => useRealtimeInbox(vi.fn()));
    unmount();
    release(okToken());
    await tick();

    expect(sources()).toHaveLength(0);
  });
});

describe("useRealtimeInbox — delivering events", () => {
  it("hands the parsed frame to the callback", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeInbox(onEvent));
    await tick();

    emit(JSON.stringify({ type: "inbox.inbound", payload: { conversationId: "c1" } }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "inbox.inbound",
      payload: { conversationId: "c1" },
    });
  });

  /**
   * The stream is a shared firehose — keep-alives, half-flushed frames and events from other
   * subsystems all arrive here. An unguarded JSON.parse would throw inside the EventSource
   * handler and the inbox would go quiet until the next reload.
   */
  it("survives a malformed frame and keeps delivering the next good one", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeInbox(onEvent));
    await tick();

    expect(() => emit("{not json")).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();

    emit(JSON.stringify({ type: "inbox.reply", payload: {} }));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  // Heartbeat/comment frames arrive with an empty or typeless body; refetching the inbox for
  // each of them would turn a keep-alive into a polling loop.
  it("ignores a frame with no type", async () => {
    const onEvent = vi.fn();
    renderHook(() => useRealtimeInbox(onEvent));
    await tick();

    emit("");
    emit(JSON.stringify({ payload: { a: 1 } }));

    expect(onEvent).not.toHaveBeenCalled();
  });

  /**
   * Callers pass an inline arrow (`useRealtimeInbox((e) => refetch(e))`), so a new callback
   * identity arrives on every render. The hook keeps it in a ref precisely so the effect can
   * depend on `enabled` alone — if it depended on the callback, each render would tear the
   * socket down and open a fresh one, and the inbox would reconnect faster than it can refetch.
   */
  it("calls the latest callback without reopening the stream", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useRealtimeInbox(cb), {
      initialProps: { cb: first },
    });
    await tick();
    rerender({ cb: second });

    emit(JSON.stringify({ type: "inbox.inbound", payload: {} }));

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(sources()).toHaveLength(1);
    expect(tokenMock).toHaveBeenCalledTimes(1);
  });
});

describe("useRealtimeInbox — reconnecting", () => {
  /**
   * A failing token request is the persistent failure mode (e.g. STREAM_TOKEN_SECRET unset on
   * the API): it fails identically every time. Retrying on a fixed short delay would re-log a
   * browser network error every few seconds forever, so the delay has to grow.
   */
  it("retries a failed token request on the exponential ladder", async () => {
    tokenMock.mockResolvedValue({ ok: false, error: "no secret" });
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();

    expect(tokenMock).toHaveBeenCalledTimes(1);
    expect(sources()).toHaveLength(0);

    await tick(1_999);
    expect(tokenMock).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(tokenMock).toHaveBeenCalledTimes(2);

    // Second attempt waits twice as long, not another 2s.
    await tick(3_999);
    expect(tokenMock).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(tokenMock).toHaveBeenCalledTimes(3);
  });

  /**
   * The hook takes over the browser's own SSE retry by closing the source in onerror, so it
   * owns the reconnect entirely. The dead source must actually be closed first — otherwise a
   * flapping stream stacks up open connections until the browser's per-host cap starves the
   * rest of the app of requests.
   */
  it("closes a dropped stream and opens a fresh one after the backoff", async () => {
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();
    const dropped = latest();

    dropped.onerror?.();
    expect(dropped.closed).toBe(true);
    expect(sources()).toHaveLength(1);

    await tick(2_000);
    expect(sources()).toHaveLength(2);
    expect(latest().closed).toBe(false);
  });

  /**
   * Without the onopen reset, a stream that reconnects successfully once an hour would still
   * be carrying the attempt count from every earlier blip, so the next genuine drop would sit
   * out the full 60s cap before retrying — a minute of silently missed replies.
   */
  it("resets the ladder once a stream opens successfully", async () => {
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();

    latest().onopen?.();
    latest().onerror?.();
    await tick(2_000);
    expect(sources()).toHaveLength(2);

    latest().onopen?.();
    latest().onerror?.();
    await tick(1_999);
    expect(sources()).toHaveLength(2);
    await tick(1);
    expect(sources()).toHaveLength(3);
  });
});

describe("useRealtimeInbox — token refresh", () => {
  /**
   * The stream token is short-lived, so the hook reconnects 30s before expiry rather than
   * waiting for the API to hang up. Drifting past the expiry means a dropped stream and a
   * backoff wait before the inbox is live again.
   */
  it("reconnects 30s before the token expires", async () => {
    tokenMock.mockImplementation(async () => okToken(600_000));
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();
    const first = latest();

    await tick(569_999);
    expect(first.closed).toBe(false);
    expect(sources()).toHaveLength(1);

    await tick(1);
    expect(first.closed).toBe(true);
    expect(tokenMock).toHaveBeenCalledTimes(2);
    expect(sources()).toHaveLength(2);
  });

  /**
   * A token minted with less than 30s of life left (clock skew, or an API that issues short
   * tokens) gives a negative refresh delay. setTimeout would fire it immediately, and since
   * every refresh mints another such token that is an unthrottled connect loop against the
   * API. The 5s floor is what stops it.
   */
  it("floors the refresh at 5s for an all-but-expired token", async () => {
    tokenMock.mockImplementation(async () => okToken(10_000));
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();

    await tick(4_999);
    expect(tokenMock).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(tokenMock).toHaveBeenCalledTimes(2);
  });

  /**
   * An unparseable expiresAt yields NaN, and setTimeout(fn, NaN) fires on the next tick — which
   * would be the same connect loop at full speed. Skipping the timer leaves the stream running
   * on its own error handling instead, which is the safe degradation.
   */
  it("schedules no refresh at all when expiresAt is unparseable", async () => {
    tokenMock.mockImplementation(async () => ({
      ok: true as const,
      data: { token: "tok-1", expiresAt: "never" },
    }));
    renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();

    await tick(600_000);
    expect(tokenMock).toHaveBeenCalledTimes(1);
    expect(sources()).toHaveLength(1);
    expect(latest().closed).toBe(false);
  });
});

describe("useRealtimeInbox — letting go", () => {
  it("closes the stream on unmount", async () => {
    const { unmount } = renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();
    const source = latest();

    unmount();
    expect(source.closed).toBe(true);
  });

  /**
   * Disabling has to be as complete as unmounting: the pending refresh and reconnect timers
   * are the ones that would otherwise resurrect a stream for a surface the organiser has
   * switched off, long after the effect that created it is gone.
   */
  it("closes the stream and cancels its timers when disabled", async () => {
    const { rerender } = renderHook(({ on }: { on: boolean }) => useRealtimeInbox(vi.fn(), on), {
      initialProps: { on: true },
    });
    await tick();
    const source = latest();

    rerender({ on: false });
    expect(source.closed).toBe(true);

    await tick(600_000);
    expect(tokenMock).toHaveBeenCalledTimes(1);
    expect(sources()).toHaveLength(1);
  });

  // A drop that happens after teardown must not resurrect the stream — the scheduled retry
  // fires from a timer the cleanup cleared, but the cancelled guard is the real backstop.
  it("does not reconnect after unmount", async () => {
    const { unmount } = renderHook(() => useRealtimeInbox(vi.fn()));
    await tick();
    const source = latest();

    source.onerror?.();
    unmount();

    await tick(60_000);
    expect(sources()).toHaveLength(1);
    expect(tokenMock).toHaveBeenCalledTimes(1);
  });
});
