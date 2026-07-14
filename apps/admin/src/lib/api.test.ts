import { beforeEach, describe, expect, it, vi } from "vitest";

// api.ts re-exports the field-facing canvass helpers; stub them so importing the
// module under test doesn't drag in @uprise/field's runtime.
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

// Every wrapper funnels through the local request(), which delegates to
// @uprise/api-client's request(). Spy on that to capture path + init.
vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true as const, data: {} })),
  getApiUrl: () => "http://api.test",
}));

import { request as apiClientRequest } from "@uprise/api-client";
import {
  deleteIntegrationConnection,
  deleteTurf,
  getTurfRoute,
  getQaReview,
  reassignTurf,
  resolveQaFlag,
  setIntegrationConnectionStatus,
  testIntegrationConnection,
  unassignTurf,
  upsertIntegrationConnection,
} from "./api";

const mockRequest = vi.mocked(apiClientRequest);

const JSON_HEADERS = { "Content-Type": "application/json" };

beforeEach(() => mockRequest.mockClear());

describe("canvass turf wrappers", () => {
  it("deleteTurf DELETEs the encoded turf path", async () => {
    await deleteTurf("t 1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t%201", { method: "DELETE" });
  });

  it("unassignTurf POSTs the unassign sub-path", async () => {
    await unassignTurf("t1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t1/unassign", { method: "POST" });
  });

  it("reassignTurf POSTs the volunteerId body to the reassign sub-path", async () => {
    await reassignTurf("t1", "v9");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t1/reassign", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ volunteerId: "v9" }),
    });
  });

  it("getTurfRoute GETs the encoded turf route path", async () => {
    await getTurfRoute("t 1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t%201/route", undefined);
  });
});

describe("canvass QA wrappers", () => {
  it("getQaReview GETs the campaign qa path (no init)", async () => {
    await getQaReview("c1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/campaigns/c1/qa", undefined);
  });

  it("resolveQaFlag POSTs the flag action body", async () => {
    const input = {
      doorKnockId: "dk1",
      kind: "NO_GPS" as const,
      state: "RESOLVED" as const,
      note: "checked",
    };
    await resolveQaFlag("c1", input);
    expect(mockRequest).toHaveBeenCalledWith("/canvass/campaigns/c1/qa/resolve", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });
});

describe("integration connection wrappers", () => {
  it("upsertIntegrationConnection POSTs the connection payload", async () => {
    const input = { type: "ACTION_NETWORK" as const, name: "AN", apiKey: "k" };
    await upsertIntegrationConnection(input);
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });

  it("testIntegrationConnection POSTs to the test endpoint", async () => {
    const input = { type: "ACTION_NETWORK" as const, apiKey: "k", baseUrl: "https://x" };
    await testIntegrationConnection(input);
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/test", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });

  it("setIntegrationConnectionStatus PATCHes the encoded id with the status body", async () => {
    await setIntegrationConnectionStatus("id 1", "INACTIVE");
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/id%201", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: "INACTIVE" }),
    });
  });

  it("deleteIntegrationConnection DELETEs the encoded id", async () => {
    await deleteIntegrationConnection("id/2");
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/id%2F2", { method: "DELETE" });
  });
});
