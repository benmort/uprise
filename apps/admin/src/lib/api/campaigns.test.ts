import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path/verb each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import { getCampaignBoundary, setCampaignBoundary, getCampaignAreas, type BoundarySource } from "./campaigns";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("campaigns api client — boundary", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("getCampaignBoundary GETs the encoded boundary endpoint", async () => {
    await getCampaignBoundary("c/1");
    expect(mockReq).toHaveBeenCalledTimes(1);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1/boundary");
    expect(opts).toBeUndefined(); // a bare GET
  });

  it("setCampaignBoundary PUTs the sources as the JSON body", async () => {
    const sources: BoundarySource[] = [{ kind: "division", type: "ced", code: "201" }];
    await setCampaignBoundary("c1", sources);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/boundary");
    expect(opts?.method).toBe("PUT");
    expect(JSON.parse(opts?.body as string)).toEqual({ sources });
  });

  it("getCampaignAreas encodes the layer into the path", async () => {
    await getCampaignAreas("c1", "sa2");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c1/areas/sa2");
  });
});
