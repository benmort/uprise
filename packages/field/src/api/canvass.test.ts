import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the transport so we can assert the path/verb/body each wrapper builds.
vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true, data: null })),
  getApiUrl: () => "http://api.test",
}));

import { request } from "@uprise/api-client";
import {
  claimArea,
  claimDraw,
  claimExistingTurf,
  createDoorContact,
  getCanvassAssignments,
  getRecommendedTurf,
  getSelfServeAvailable,
  getPushConfig,
  getVolunteerMetrics,
  listDispositions,
  releaseTurf,
  submitDoorKnock,
  subscribePush,
  uploadDoorPhoto,
  type DoorKnockInput,
} from "./canvass";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;
const body = (opts: unknown) => JSON.parse((opts as { body: string }).body);

beforeEach(() => {
  mockReq.mockClear();
  mockReq.mockResolvedValue({ ok: true, data: null });
});

describe("canvass api client — reads", () => {
  it("listDispositions GETs the bare endpoint with no channel filter", async () => {
    await listDispositions();
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/dispositions");
    expect(opts).toBeUndefined();
  });

  it("listDispositions appends the channel filter and passes the signal", async () => {
    const signal = new AbortController().signal;
    await listDispositions("DOOR", signal);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/engagement/dispositions?channel=DOOR");
    expect(opts).toEqual({ signal });
  });

  it("getCanvassAssignments encodes the volunteerId into the query", async () => {
    await getCanvassAssignments("v1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/assignments?volunteerId=v1");
  });

  it("getVolunteerMetrics hits the volunteer-metrics endpoint", async () => {
    await getVolunteerMetrics("v1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/volunteer-metrics?volunteerId=v1");
  });

  it("getRecommendedTurf hits the recommended-turf endpoint", async () => {
    await getRecommendedTurf("v1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/recommended-turf?volunteerId=v1");
  });

  it("getSelfServeAvailable encodes the campaignId into the path", async () => {
    await getSelfServeAvailable("c/1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c%2F1/self-serve/available");
  });

  it("getPushConfig GETs the push config", async () => {
    await getPushConfig();
    expect(mockReq.mock.calls[0][0]).toBe("/push/config");
  });
});

describe("canvass api client — writes", () => {
  it("submitDoorKnock POSTs the input as the JSON body", async () => {
    const input: DoorKnockInput = { contactId: "c1", volunteerId: "v1", localId: "l1", dispositionCode: "HOME" };
    await submitDoorKnock(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/door-knocks");
    expect(opts?.method).toBe("POST");
    expect((opts?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(body(opts)).toEqual(input);
  });

  it("releaseTurf POSTs the volunteerId to the encoded release endpoint", async () => {
    await releaseTurf("t/1", "v1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/turfs/t%2F1/release");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual({ volunteerId: "v1" });
  });

  it("createDoorContact POSTs the contact fields", async () => {
    const input = { volunteerId: "v1", turfId: "t1", firstName: "Ada" };
    await createDoorContact(input);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/door-contacts");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual(input);
  });

  it("claimArea POSTs the areas to the encoded claim-area endpoint", async () => {
    const areas = [{ layer: "sa2", code: "201" }];
    await claimArea("c/1", areas);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1/self-serve/claim-area");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual({ areas });
  });

  it("claimDraw POSTs the polygon to the encoded claim-draw endpoint", async () => {
    const polygon = { type: "Polygon", coordinates: [] };
    await claimDraw("c1", polygon);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/self-serve/claim-draw");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual({ polygon });
  });

  it("claimExistingTurf POSTs the turfId to the encoded claim-turf endpoint", async () => {
    await claimExistingTurf("c1", "t9");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/self-serve/claim-turf");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual({ turfId: "t9" });
  });

  it("subscribePush POSTs the subscription", async () => {
    const sub = { endpoint: "https://push.test/x", keys: { p256dh: "p", auth: "a" } };
    await subscribePush(sub);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/push/subscribe");
    expect(opts?.method).toBe("POST");
    expect(body(opts)).toEqual(sub);
  });
});

describe("uploadDoorPhoto — multipart via fetch (not request)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const file = new File(["data"], "door.jpg", { type: "image/jpeg" });

  it("POSTs multipart to the door-photos endpoint with credentials and returns the url", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: { url: "https://cdn/x.jpg" } }) }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await uploadDoorPhoto(file);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/canvass/door-photos");
    expect(opts.method).toBe("POST");
    expect(opts.credentials).toBe("include");
    expect(opts.body).toBeInstanceOf(FormData);
    expect(res).toEqual({ ok: true, data: { url: "https://cdn/x.jpg" } });
  });

  it("surfaces the server error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) })),
    );
    expect(await uploadDoorPhoto(file)).toEqual({ ok: false, error: "boom" });
  });

  it("returns a failure result on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await uploadDoorPhoto(file)).toEqual({ ok: false, error: "offline" });
  });
});
