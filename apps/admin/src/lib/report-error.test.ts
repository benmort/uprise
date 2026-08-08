// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { reportClientError } from "./report-error";

// Pinned to the `node` environment by the pragma above. The suite's whole point is the SSR
// branch — `reportClientError` no-ops when there is no `window` — and the runner default moved
// to jsdom so hooks in src/lib could be tested at all. Under jsdom a real `window` exists, the
// SSR branch becomes unreachable, and "no-ops on the server" starts POSTing. The reporter only
// ever touches `window.location`, so a stub is enough here, and leaving the stub off is what
// exercises the server path.
const stubWindow = () =>
  vi.stubGlobal("window", { location: { pathname: "/dashboard", search: "?tab=live" } });

describe("reportClientError", () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/api/v1";
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    stubWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  });

  const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it("posts the error to the ops intake with credentials and keepalive", () => {
    const error = Object.assign(new Error("server-side exception"), { digest: "3401234567" });
    reportClientError("admin", error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/ops/client-error");
    expect(init).toMatchObject({
      method: "POST",
      // Survives the reload the user is about to do on a broken page.
      keepalive: true,
      // Lets the API attribute the row to the session when there is one.
      credentials: "include",
    });
    expect(bodyOf()).toMatchObject({
      source: "admin",
      message: "server-side exception",
      digest: "3401234567",
      path: "/dashboard?tab=live",
    });
  });

  it("includes the stack and falls back to the current location for path", () => {
    reportClientError("admin", new Error("boom"));
    const body = bodyOf();
    expect(body.stack).toContain("boom");
    expect(body.path).toBe("/dashboard?tab=live");
  });

  it("prefers an explicit path over the current location", () => {
    reportClientError("admin", new Error("boom"), { path: "/getting-started" });
    expect(bodyOf().path).toBe("/getting-started");
  });

  it("still reports when there is no error object", () => {
    reportClientError("admin", null);
    expect(bodyOf().message).toBe("Unknown client error");
  });

  it("truncates an oversized message and stack", () => {
    const error = new Error("x".repeat(5_000));
    error.stack = "y".repeat(50_000);
    reportClientError("admin", error);
    const body = bodyOf();
    expect(body.message).toHaveLength(2_000);
    expect(body.stack).toHaveLength(20_000);
  });

  // Error boundaries are rendered during SSR too, where there is nothing to report from.
  it("no-ops on the server", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    reportClientError("admin", new Error("boom"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Without a configured API base there is nowhere to send it; staying silent beats
  // throwing inside an error boundary.
  it("no-ops when NEXT_PUBLIC_API_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    reportClientError("admin", new Error("boom"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws, even when fetch itself blows up", () => {
    fetchMock.mockImplementation(() => {
      throw new Error("network stack gone");
    });
    expect(() => reportClientError("admin", new Error("boom"))).not.toThrow();
  });

  it("swallows a rejected request", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(() => reportClientError("admin", new Error("boom"))).not.toThrow();
    await Promise.resolve();
  });
});
