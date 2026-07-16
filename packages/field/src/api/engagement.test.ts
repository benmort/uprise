import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true, data: null })),
  getApiUrl: () => "http://api.test",
}));

import { request } from "@uprise/api-client";
import {
  createScript,
  createSurvey,
  deleteScript,
  deleteSurvey,
  getScript,
  getSurvey,
  listScripts,
  listSurveys,
  updateScript,
  updateSurvey,
} from "./engagement";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;
const body = (opts: unknown) => JSON.parse((opts as { body: string }).body);

beforeEach(() => {
  mockReq.mockClear();
  mockReq.mockResolvedValue({ ok: true, data: null });
});

describe("engagement api client — surveys", () => {
  it("listSurveys GETs the surveys collection", async () => {
    await listSurveys();
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/surveys");
    expect(mockReq.mock.calls[0][1]).toBeUndefined();
  });

  it("getSurvey GETs the encoded survey endpoint", async () => {
    await getSurvey("s/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/surveys/s%2F1");
  });

  it("createSurvey POSTs the payload", async () => {
    const input = { name: "Doorstep", entryQuestionKey: "q1" };
    await createSurvey(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual(input);
  });

  it("updateSurvey PATCHes the encoded survey endpoint", async () => {
    await updateSurvey("s1", { name: "Renamed" });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys/s1");
    expect(opts?.method).toBe("PATCH");
    expect(body(opts)).toEqual({ name: "Renamed" });
  });

  it("deleteSurvey DELETEs the encoded survey endpoint", async () => {
    await deleteSurvey("s1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/surveys/s1");
    expect(opts?.method).toBe("DELETE");
  });
});

describe("engagement api client — scripts", () => {
  it("listScripts GETs the scripts collection", async () => {
    await listScripts();
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/scripts");
  });

  it("getScript GETs the encoded script endpoint", async () => {
    await getScript("sc/1");
    expect(mockReq.mock.calls[0][0]).toBe("/engagement/scripts/sc%2F1");
  });

  it("createScript POSTs the payload", async () => {
    const input = { name: "Call script", channel: "SMS" };
    await createScript(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual(input);
  });

  it("updateScript PATCHes the encoded script endpoint", async () => {
    await updateScript("sc1", { name: "Renamed" });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts/sc1");
    expect(opts?.method).toBe("PATCH");
    expect(body(opts)).toEqual({ name: "Renamed" });
  });

  it("deleteScript DELETEs the encoded script endpoint", async () => {
    await deleteScript("sc1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/scripts/sc1");
    expect(opts?.method).toBe("DELETE");
  });
});
