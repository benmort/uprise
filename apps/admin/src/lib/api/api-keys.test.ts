import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import { listApiKeys, issueApiKey, revokeApiKey } from "./api-keys";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("api-keys api client", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listApiKeys GETs /api-keys", async () => {
    await listApiKeys();
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/api-keys");
    expect(opts).toBeUndefined();
  });

  it("issueApiKey POSTs the name", async () => {
    await issueApiKey("CI token");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/api-keys");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "CI token" });
  });

  it("revokeApiKey DELETEs the encoded key id", async () => {
    await revokeApiKey("k/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/api-keys/k%2F1");
    expect(opts?.method).toBe("DELETE");
  });
});
