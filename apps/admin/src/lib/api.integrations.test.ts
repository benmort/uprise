import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path/verb each wrapper builds.
vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true, data: [] })),
  getApiUrl: () => "http://api.test",
}));

import { request as cookieRequest } from "@uprise/api-client";
import {
  getSyncJobs,
  getAudienceSegments,
  syncIntegrationList,
  rebuildTurfWalkList,
  rebuildWalkLists,
} from "./api";

const mockReq = cookieRequest as unknown as ReturnType<typeof vi.fn>;

describe("integration/segment api wrappers", () => {
  beforeEach(() => mockReq.mockClear());

  it("getSyncJobs requests the sync-jobs feed with the encoded limit", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: [] });
    await getSyncJobs(25);
    expect(mockReq).toHaveBeenCalledWith("/integrations/sync-jobs?limit=25", undefined);
  });

  it("getSyncJobs defaults the limit to 50", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: [] });
    await getSyncJobs();
    expect(mockReq).toHaveBeenCalledWith("/integrations/sync-jobs?limit=50", undefined);
  });

  it("getAudienceSegments requests the segments endpoint", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: [] });
    await getAudienceSegments();
    expect(mockReq).toHaveBeenCalledWith("/audiences/segments", undefined);
  });

  it("syncIntegrationList POSTs the list payload as JSON", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: { syncJobId: "s1", audienceId: "a1" } });
    const res = await syncIntegrationList({
      type: "ACTION_NETWORK",
      listId: "list1",
      audienceName: "Action Network: List 1",
    });
    expect(mockReq).toHaveBeenCalledWith(
      "/integrations/lists/sync",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ACTION_NETWORK",
          listId: "list1",
          audienceName: "Action Network: List 1",
        }),
      }),
    );
    expect(res.ok && res.data.audienceId).toBe("a1");
  });
});

describe("walk-list rebuild api wrappers", () => {
  beforeEach(() => mockReq.mockClear());

  it("rebuildTurfWalkList POSTs to the turf rebuild endpoint (id encoded)", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: { turfId: "t/1", items: 3 } });
    await rebuildTurfWalkList("t/1");
    expect(mockReq).toHaveBeenCalledWith("/canvass/turfs/t%2F1/rebuild-walk-list", { method: "POST" });
  });

  it("rebuildWalkLists POSTs the selected turfIds as JSON", async () => {
    mockReq.mockResolvedValueOnce({ ok: true, data: { results: [] } });
    await rebuildWalkLists(["t1", "t2"]);
    expect(mockReq).toHaveBeenCalledWith(
      "/canvass/walk-lists/rebuild",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turfIds: ["t1", "t2"] }),
      }),
    );
  });
});
