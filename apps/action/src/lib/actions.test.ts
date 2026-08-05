import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPublicActionPage } from "./actions";

/**
 * This fetcher is the action app's whole read path for a public action page, and every branch in
 * it exists to keep a broken API from becoming a broken page: a non-200, an unparseable body or a
 * dead connection all have to arrive as `null` so the route renders not-found instead of throwing.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const okJson = (body: unknown) => ({ ok: true, json: async () => body });

describe("getPublicActionPage", () => {
  it("GETs the encoded slug with no caching and unwraps a {data} envelope", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: { slug: "save the bay", title: "Save the bay" } }));

    const page = await getPublicActionPage("save the bay");

    expect(page).toMatchObject({ title: "Save the bay" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/actions/public/pages/save%20the%20bay");
    expect(String(url)).not.toContain("previewToken");
    expect(init).toMatchObject({ cache: "no-store" });
  });

  it("passes an encoded preview token through as a query parameter", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ data: { slug: "draft" } }));

    await getPublicActionPage("draft", "tok/en+1");

    expect(String(fetchMock.mock.calls[0][0])).toContain("?previewToken=tok%2Fen%2B1");
  });

  it("returns a bare body as-is when there is no envelope to unwrap", async () => {
    fetchMock.mockResolvedValueOnce(okJson({ slug: "bare", title: "Bare" }));

    await expect(getPublicActionPage("bare")).resolves.toMatchObject({ slug: "bare" });
  });

  it("is null on a non-200 — an unpublished or missing page renders not-found, not an error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    await expect(getPublicActionPage("missing")).resolves.toBeNull();
  });

  it("is null when the API is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(getPublicActionPage("down")).resolves.toBeNull();
  });

  it("is null when the body is not JSON at all", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });

    await expect(getPublicActionPage("html-error-page")).resolves.toBeNull();
  });

  it("turns a null payload into null rather than passing it on", async () => {
    fetchMock.mockResolvedValueOnce(okJson(null));

    await expect(getPublicActionPage("empty")).resolves.toBeNull();
  });
});
