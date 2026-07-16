import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true, data: null })),
  getApiUrl: () => "http://api.test",
}));

import { request } from "@uprise/api-client";
import { getAddressDetail } from "./geo";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockReq.mockClear();
  mockReq.mockResolvedValue({ ok: true, data: null });
});

describe("geo api client", () => {
  it("getAddressDetail GETs the encoded G-NAF address endpoint", async () => {
    await getAddressDetail("GANSW/123 456");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/geo/addresses/GANSW%2F123%20456");
    expect(opts).toBeUndefined();
  });
});
