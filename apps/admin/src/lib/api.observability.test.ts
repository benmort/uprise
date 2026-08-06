import { beforeEach, describe, expect, it, vi } from "vitest";

// api.ts re-exports the field-facing canvass helpers; stub them so importing the module under
// test doesn't drag in @uprise/field's runtime.
vi.mock("@uprise/field", () => ({
  getCanvassAssignments: vi.fn(),
  submitDoorKnock: vi.fn(),
  releaseTurf: vi.fn(),
  createDoorContact: vi.fn(),
  uploadDoorPhoto: vi.fn(),
  listDispositions: vi.fn(),
  getPushConfig: vi.fn(),
  subscribePush: vi.fn(),
}));

vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true as const, data: {} })),
  getApiUrl: () => "http://api.test",
}));

import { request as apiClientRequest } from "@uprise/api-client";
import { getObservabilityLogs, getObservabilityQueueJobs } from "./api";

const mockRequest = vi.mocked(apiClientRequest);
const pathOf = () => mockRequest.mock.calls[0][0];

beforeEach(() => mockRequest.mockClear());

describe("getObservabilityLogs", () => {
  it("GETs the bare path when no filters are given", async () => {
    await getObservabilityLogs();
    expect(pathOf()).toBe("/observability/logs");
  });

  it("appends the filters it was given", async () => {
    await getObservabilityLogs({ source: "stored", level: "error", since: "24h", limit: 200 });
    const path = pathOf();
    expect(path).toContain("source=stored");
    expect(path).toContain("level=error");
    expect(path).toContain("since=24h");
    expect(path).toContain("limit=200");
  });

  // An empty search box must not become `q=` — the API would read that as "match empty string".
  it("omits undefined and empty values rather than sending blanks", async () => {
    await getObservabilityLogs({ source: "stored", q: "", domain: undefined });
    const path = pathOf();
    expect(path).toContain("source=stored");
    expect(path).not.toContain("q=");
    expect(path).not.toContain("domain=");
  });

  it("encodes a search term with URL-significant characters", async () => {
    await getObservabilityLogs({ q: "a&b c" });
    expect(pathOf()).toContain("q=a%26b+c");
  });
});

describe("getObservabilityQueueJobs", () => {
  it("GETs the bare path when unfiltered", async () => {
    await getObservabilityQueueJobs();
    expect(pathOf()).toBe("/observability/queue/jobs");
  });

  it("passes queue and state through", async () => {
    await getObservabilityQueueJobs({ queue: "integration-sync", state: "delayed,failed", limit: 50 });
    const path = pathOf();
    expect(path).toContain("queue=integration-sync");
    expect(path).toContain("state=delayed%2Cfailed");
    expect(path).toContain("limit=50");
  });
});
