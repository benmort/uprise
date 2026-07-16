import { describe, expect, it, vi, beforeEach } from "vitest";

// engagement.ts re-exports the shared client from @uprise/field, which calls
// request() from @uprise/api-client — so that's the transport we mock here.
vi.mock("@uprise/api-client", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@uprise/api-client";
import {
  listSurveys,
  getSurvey,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  listScripts,
  getScript,
  createScript,
  updateScript,
  deleteScript,
} from "./engagement";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("engagement api client (re-exported from @uprise/field)", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listSurveys GETs the surveys endpoint", async () => {
    await listSurveys();
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/surveys");
  });

  it("getSurvey GETs the encoded survey id", async () => {
    await getSurvey("s/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/surveys/s%2F1");
  });

  it("createSurvey POSTs the input", async () => {
    const input = { name: "Doorknock", questions: [] };
    await createSurvey(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("updateSurvey PATCHes the encoded id with the input", async () => {
    await updateSurvey("s/1", { name: "Renamed" });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys/s%2F1");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "Renamed" });
  });

  it("deleteSurvey DELETEs the encoded id", async () => {
    await deleteSurvey("s/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys/s%2F1");
    expect(opts?.method).toBe("DELETE");
  });

  it("listScripts GETs the scripts endpoint", async () => {
    await listScripts();
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/scripts");
  });

  it("getScript GETs the encoded script id", async () => {
    await getScript("sc/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/scripts/sc%2F1");
  });

  it("createScript POSTs the input", async () => {
    const input = { name: "Phone bank", channel: "SMS", steps: [] };
    await createScript(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual(input);
  });

  it("updateScript PATCHes the encoded id with the input", async () => {
    await updateScript("sc/1", { name: "Renamed" });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts/sc%2F1");
    expect(opts?.method).toBe("PATCH");
    expect(JSON.parse(opts?.body as string)).toEqual({ name: "Renamed" });
  });

  it("deleteScript DELETEs the encoded id", async () => {
    await deleteScript("sc/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts/sc%2F1");
    expect(opts?.method).toBe("DELETE");
  });
});
