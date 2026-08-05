import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { installGlobalErrorReporting, reportClientError } from "./report-error";

/**
 * This suite runs under vitest's `node` environment (see vitest.config.ts), so there is
 * no real `window` and no real EventTarget. The stub below supplies only what the module
 * touches – `location` plus a listener registry – and the registry uses a Set so it
 * reproduces the one DOM behaviour the module leans on: registering the same function
 * reference for the same event type twice is a no-op.
 *
 * Every no-op case here is written so that DELETING the guard it covers makes it fail.
 * That means nothing the reporter touches before `fetch` may reference `window` on the
 * path under test – otherwise a removed guard just trades an early return for a
 * swallowed TypeError and the test stays green while proving nothing.
 */
type Listener = (event: Record<string, unknown>) => void;

function makeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  const win = {
    location: { pathname: "/sign-in", search: "?return_to=%2Fdashboard" },
    addEventListener(type: string, fn: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    emit(type: string, event: Record<string, unknown> = {}) {
      // `target` defaults to the window, which is what a genuine uncaught exception
      // carries; a failed resource load carries the element instead.
      for (const fn of [...(listeners.get(type) ?? [])]) fn({ target: win, ...event });
    },
  };
  return win;
}

describe("reportClientError", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  let fetchMock: ReturnType<typeof vi.fn>;
  let win: ReturnType<typeof makeWindow>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api/v1";
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    win = makeWindow();
    vi.stubGlobal("window", win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  const bodyOf = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it("posts the error to the ops intake with credentials and keepalive", () => {
    const error = Object.assign(new Error("invite accept exploded"), { digest: "3401234567" });
    reportClientError("auth", error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/ops/client-error");
    expect(init).toMatchObject({
      method: "POST",
      // Survives the reload the user is about to do on a broken page.
      keepalive: true,
      // Lets the API attribute the row to the session on the rare screen that has one.
      credentials: "include",
    });
    expect(bodyOf()).toMatchObject({
      // Must be the API's allowlisted source for this app or the row is rejected.
      source: "auth",
      message: "invite accept exploded",
      digest: "3401234567",
      path: "/sign-in?return_to=%2Fdashboard",
    });
  });

  it("includes the stack and falls back to the current location for path", () => {
    reportClientError("auth", new Error("boom"));
    const body = bodyOf();
    expect(body.stack).toContain("boom");
    expect(body.name).toBe("Error");
    expect(body.path).toBe("/sign-in?return_to=%2Fdashboard");
  });

  it("prefers an explicit path over the current location", () => {
    reportClientError("auth", new Error("boom"), { path: "/invite/tok_123" });
    expect(bodyOf().path).toBe("/invite/tok_123");
  });

  it("still reports when there is no error object", () => {
    reportClientError("auth", null);
    const body = bodyOf();
    expect(body.message).toBe("Unknown client error");
    expect(body.name).toBeUndefined();
    expect(body.stack).toBeUndefined();
    expect(body.digest).toBeUndefined();
  });

  it("truncates an oversized message and stack", () => {
    const error = new Error("x".repeat(5_000));
    error.stack = "y".repeat(50_000);
    reportClientError("auth", error);
    const body = bodyOf();
    expect(body.message).toHaveLength(2_000);
    expect(body.stack).toHaveLength(20_000);
  });

  // The root layout injects the runtime base for the api-client to read; the reporter
  // duplicates that precedence so the two can never resolve to different hosts.
  it("prefers the runtime API base over the build-time env", () => {
    vi.stubGlobal("__API_URL__", "https://runtime.example.test/api/v1");
    reportClientError("auth", new Error("boom"));
    expect(fetchMock.mock.calls[0][0]).toBe("https://runtime.example.test/api/v1/ops/client-error");
  });

  // Error boundaries are rendered during SSR too, where there is nothing to report from.
  // `path` is passed explicitly so that removing the SSR guard reaches `fetch` instead of
  // dying on `window.location` – without it this assertion holds either way.
  it("no-ops on the server", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    expect(typeof globalThis.window).toBe("undefined");
    reportClientError("auth", new Error("boom"), { path: "/invite/tok_123" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Without a configured API base there is nowhere to send it; staying silent beats
  // throwing inside an error boundary.
  it("no-ops when NEXT_PUBLIC_API_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    reportClientError("auth", new Error("boom"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, even when fetch itself blows up", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("network stack gone");
    });
    expect(() => reportClientError("auth", new Error("boom"))).not.toThrow();
  });

  // A rejection handler has to be ATTACHED, not merely "the test didn't crash". Asserting
  // the absence of a process `unhandledRejection` was tried and is inert here – vitest's
  // node environment never surfaces the floating rejection, so that assertion holds with
  // or without the `.catch`. Assert the attachment itself, and that it swallows.
  it("attaches a rejection handler to the report request", () => {
    let attached: ((reason: unknown) => unknown) | undefined;
    const catchSpy = vi.fn((fn: (reason: unknown) => unknown) => {
      attached = fn;
      return Promise.resolve();
    });
    fetchMock.mockReturnValue({ catch: catchSpy });

    expect(() => reportClientError("auth", new Error("boom"))).not.toThrow();

    expect(catchSpy).toHaveBeenCalledTimes(1);
    expect(attached?.(new Error("offline"))).toBeUndefined();
  });

});

/**
 * The listeners exist because a React error boundary structurally cannot see either
 * production failure: both lived in an async submit handler, and a boundary only ever
 * catches a throw during render.
 */
describe("installGlobalErrorReporting", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  let fetchMock: ReturnType<typeof vi.fn>;
  let win: ReturnType<typeof makeWindow>;
  let teardown: () => void;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api/v1";
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    win = makeWindow();
    vi.stubGlobal("window", win);
    // Also resets the per-page-load report budget, so each case starts from a clean one.
    teardown = installGlobalErrorReporting("auth");
  });

  afterEach(() => {
    teardown();
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  const bodyOf = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it("reports an unhandled promise rejection – the case no boundary sees", () => {
    win.emit("unhandledrejection", { reason: new TypeError("Failed to fetch") });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).toMatchObject({
      source: "auth",
      message: "Failed to fetch",
      // Tagged so ops can tell a listener report from a boundary report; the closed DTO
      // has no field of its own for it.
      name: "TypeError (unhandledrejection)",
      path: "/sign-in?return_to=%2Fdashboard",
    });
    expect(bodyOf().stack).toContain("Failed to fetch");
  });

  it("reports an uncaught error event", () => {
    win.emit("error", { error: new RangeError("out of range") });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf()).toMatchObject({
      message: "out of range",
      name: "RangeError (uncaught)",
    });
  });

  it("reports a rejection whose reason is not an Error", () => {
    win.emit("unhandledrejection", { reason: { status: 500 } });

    expect(bodyOf()).toMatchObject({
      message: '{"status":500}',
      name: "unhandledrejection",
    });
    expect(bodyOf().stack).toBeUndefined();
  });

  it("survives a reason that cannot be stringified", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => win.emit("unhandledrejection", { reason: circular })).not.toThrow();
    expect(bodyOf().message).toBe("[object Object]");
  });

  it("ignores a failed resource load", () => {
    // A blocked <script> fires `error` on window too, with the element as target and no
    // exception attached. Reporting those would burn the budget on noise.
    win.emit("error", { target: { tagName: "SCRIPT" }, error: null, message: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a repeating fault once, however often it re-fires", () => {
    const error = new TypeError("Failed to fetch");
    for (let i = 0; i < 6; i++) win.emit("unhandledrejection", { reason: error });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps a page load so a loop of distinct errors cannot flood the intake", () => {
    for (let i = 0; i < 25; i++) {
      win.emit("unhandledrejection", { reason: new Error(`attempt ${i}`) });
    }
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("registers once when mounted twice (StrictMode double-effect)", () => {
    const second = installGlobalErrorReporting("auth");
    expect(win.listenerCount("unhandledrejection")).toBe(1);
    expect(win.listenerCount("error")).toBe(1);

    win.emit("unhandledrejection", { reason: new Error("boom") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    second();
  });

  it("stops reporting after teardown", () => {
    teardown();
    win.emit("unhandledrejection", { reason: new Error("boom") });
    win.emit("error", { error: new Error("boom") });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(win.listenerCount("unhandledrejection")).toBe(0);
  });

  it("no-ops on the server", () => {
    // The teardown from beforeEach would dereference the window this test removes.
    teardown();
    teardown = () => undefined;
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    expect(typeof globalThis.window).toBe("undefined");
    // Would throw on `window.addEventListener` without the guard.
    const noop = installGlobalErrorReporting("auth");
    expect(() => noop()).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
