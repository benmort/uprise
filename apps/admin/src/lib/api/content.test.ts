import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path/verb/body each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  listBindings,
  createBinding,
  deleteBinding,
  contentUsage,
  getContentFlow,
  recordDisposition,
  recordSurveyAnswer,
  listDispositionSets,
  listCannedSets,
  setPrimaryBinding,
  type ContentBinding,
} from "./content";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

const binding = (over: Partial<ContentBinding>): ContentBinding => ({
  id: "b1",
  tenantId: "t1",
  contentType: "SURVEY",
  contentId: "s1",
  objectType: "CANVASS_CAMPAIGN",
  objectId: "c1",
  slot: "PRIMARY",
  orderIndex: 0,
  createdAt: "2026-01-01",
  ...over,
});

describe("content api client", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listBindings GETs the bindings endpoint with encoded objectId query", async () => {
    await listBindings("CANVASS_CAMPAIGN", "c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/bindings?objectType=CANVASS_CAMPAIGN&objectId=c%2F1");
    expect(opts).toBeUndefined();
  });

  it("createBinding POSTs the input as JSON", async () => {
    const input = {
      contentType: "SCRIPT" as const,
      contentId: "sc1",
      objectType: "BLAST" as const,
      objectId: "bl1",
    };
    await createBinding(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/bindings");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("deleteBinding DELETEs the encoded binding id", async () => {
    await deleteBinding("b/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/bindings/b%2F1");
    expect(opts?.method).toBe("DELETE");
  });

  it("contentUsage GETs the encoded type/id usage endpoint", async () => {
    await contentUsage("DISPOSITION_SET", "d/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/content/DISPOSITION_SET/d%2F1/usage");
  });

  it("getContentFlow GETs the flow endpoint with encoded objectId query", async () => {
    await getContentFlow("BLAST", "b/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/flow?objectType=BLAST&objectId=b%2F1");
  });

  it("recordDisposition POSTs the disposition payload", async () => {
    const input = { contactId: "ct1", code: "SUPPORT", channel: "SMS" as const };
    await recordDisposition(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/dispositions");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("recordSurveyAnswer POSTs the answer payload", async () => {
    const input = { contactId: "ct1", questionId: "q1", channel: "DOOR" as const };
    await recordSurveyAnswer(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/survey-answers");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("listDispositionSets and listCannedSets hit their endpoints", async () => {
    await listDispositionSets();
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/disposition-sets");
    await listCannedSets();
    expect(mockReq.mock.calls[1][0]).toBe("/engagement/canned-sets");
  });

  describe("setPrimaryBinding", () => {
    it("no-ops when the chosen content id already matches the existing PRIMARY binding", async () => {
      const current = [binding({ contentType: "SURVEY", contentId: "s1", slot: "PRIMARY" })];
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", "s1", current);
      expect(res).toEqual({ ok: true });
      expect(mockReq).not.toHaveBeenCalled();
    });

    it("no-ops when clearing content that was never bound", async () => {
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", null, []);
      expect(res).toEqual({ ok: true });
      expect(mockReq).not.toHaveBeenCalled();
    });

    it("creates a binding when a new content id is chosen", async () => {
      mockReq.mockResolvedValue({ ok: true, data: binding({}) });
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", "s2", []);
      expect(res).toEqual({ ok: true });
      const [url, opts] = mockReq.mock.calls[0];
      expect(url).toBe("/engagement/bindings");
      expect(opts?.method).toBe("POST");
      expect(JSON.parse(opts?.body as string)).toEqual({
        contentType: "SURVEY",
        contentId: "s2",
        objectType: "CANVASS_CAMPAIGN",
        objectId: "c1",
      });
    });

    it("surfaces the create error", async () => {
      mockReq.mockResolvedValue({ ok: false, error: "boom" });
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", "s2", []);
      expect(res).toEqual({ ok: false, error: "boom" });
    });

    it("deletes the existing binding when content is cleared", async () => {
      mockReq.mockResolvedValue({ ok: true, data: { deleted: true } });
      const current = [binding({ id: "bx", contentType: "SURVEY", contentId: "s1", slot: "PRIMARY" })];
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", null, current);
      expect(res).toEqual({ ok: true });
      const [url, opts] = mockReq.mock.calls[0];
      expect(url).toBe("/engagement/bindings/bx");
      expect(opts?.method).toBe("DELETE");
    });

    it("surfaces the delete error", async () => {
      mockReq.mockResolvedValue({ ok: false, error: "nope" });
      const current = [binding({ id: "bx", contentType: "SURVEY", contentId: "s1", slot: "PRIMARY" })];
      const res = await setPrimaryBinding("CANVASS_CAMPAIGN", "c1", "SURVEY", null, current);
      expect(res).toEqual({ ok: false, error: "nope" });
    });
  });
});
