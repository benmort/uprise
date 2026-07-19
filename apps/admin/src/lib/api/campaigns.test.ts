import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the transport so we can assert the path/verb each wrapper builds.
vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  getCampaignBoundary,
  setCampaignBoundary,
  previewCampaignBoundary,
  getCampaignAreas,
  getCampaignBoundaryAddressCount,
  getCampaignResults,
  getCampaignLive,
  deleteCampaign,
  type BoundarySource,
} from "./campaigns";

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

  it("previewCampaignBoundary POSTs the sources to the preview endpoint (no save)", async () => {
    const sources: BoundarySource[] = [{ kind: "division", type: "sed_lower", code: "27103" }];
    await previewCampaignBoundary("c1", sources);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/boundary/preview");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({ sources });
  });

  it("getCampaignAreas encodes the layer into the path", async () => {
    await getCampaignAreas("c1", "sa2");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c1/areas/sa2");
  });

  it("deleteCampaign DELETEs the encoded campaign endpoint", async () => {
    await deleteCampaign("c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1");
    expect(opts?.method).toBe("DELETE");
  });

  it("getCampaignBoundaryAddressCount GETs the encoded boundary address-count endpoint", async () => {
    await getCampaignBoundaryAddressCount("c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1/boundary/address-count");
    expect(opts).toBeUndefined(); // a bare GET
  });

  it("getCampaignResults hits the campaign endpoint, or the tenant-wide aggregate when no id", async () => {
    await getCampaignResults("c/1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c%2F1/results");
    await getCampaignResults();
    expect(mockReq.mock.calls[1][0]).toBe("/canvass/campaigns/results");
  });

  it("getCampaignLive hits the campaign endpoint, or the tenant-wide aggregate when no id", async () => {
    await getCampaignLive("c/1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c%2F1/live");
    await getCampaignLive();
    expect(mockReq.mock.calls[1][0]).toBe("/canvass/campaigns/live");
  });

  it("getCampaignFieldReport GETs the encoded endpoint, appending weeks only when given", async () => {
    const { getCampaignFieldReport } = await import("./campaigns");
    await getCampaignFieldReport("c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1/field-report");
    expect(opts).toBeUndefined(); // a bare GET
    await getCampaignFieldReport("c1", { weeks: 12 });
    expect(mockReq.mock.calls[1][0]).toBe("/canvass/campaigns/c1/field-report?weeks=12");
  });
});

describe("campaigns api client — targeting heat", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("getCampaignHeat GETs the encoded heat endpoint", async () => {
    const { getCampaignHeat } = await import("./campaigns");
    await getCampaignHeat("c/1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c%2F1/heat");
    expect(opts).toBeUndefined();
  });

  it("setCampaignHeatConfig PUTs the config as the JSON body", async () => {
    const { setCampaignHeatConfig } = await import("./campaigns");
    await setCampaignHeatConfig("c1", { preset: "gotv", weights: { doors: 30 } });
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/heat-config");
    expect(opts?.method).toBe("PUT");
    expect(JSON.parse(opts?.body as string)).toEqual({ preset: "gotv", weights: { doors: 30 } });
  });

  it("refreshCampaignHeat POSTs the refresh endpoint", async () => {
    const { refreshCampaignHeat } = await import("./campaigns");
    await refreshCampaignHeat("c1");
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/campaigns/c1/heat/refresh");
    expect(opts?.method).toBe("POST");
  });

  it("previewHeat POSTs sources (+ optional config) and threads the abort signal", async () => {
    const { previewHeat } = await import("./campaigns");
    const ac = new AbortController();
    await previewHeat([{ kind: "division", type: "sed", code: "X" } as never], { preset: "coverage" }, ac.signal);
    const [url, opts] = mockReq.mock.calls[0];
    expect(url).toBe("/canvass/heat/preview");
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({
      sources: [{ kind: "division", type: "sed", code: "X" }],
      config: { preset: "coverage" },
    });
    expect(opts?.signal).toBe(ac.signal);
  });

  it("previewHeat omits the config key when none is given", async () => {
    const { previewHeat } = await import("./campaigns");
    await previewHeat([{ kind: "area", layer: "sa1", code: "20401" } as never]);
    const [, opts] = mockReq.mock.calls[0];
    expect(JSON.parse(opts?.body as string)).toEqual({ sources: [{ kind: "area", layer: "sa1", code: "20401" }] });
  });
});

describe("campaigns api client — evaluation + snapshot", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("evaluation endpoints build the right paths/verbs", async () => {
    const { getCampaignEvaluation, getEvaluationPower, enableEvaluation, disableEvaluation, snapshotCampaignHeat } =
      await import("./campaigns");
    await getCampaignEvaluation("c1");
    expect(mockReq.mock.calls[0][0]).toBe("/canvass/campaigns/c1/evaluation");
    await getEvaluationPower("c1", 0.05);
    expect(mockReq.mock.calls[1][0]).toBe("/canvass/campaigns/c1/evaluation/power?icc=0.05");
    await getEvaluationPower("c1");
    expect(mockReq.mock.calls[2][0]).toBe("/canvass/campaigns/c1/evaluation/power");
    await enableEvaluation("c1", 0.02);
    expect(mockReq.mock.calls[3][1]?.method).toBe("POST");
    expect(JSON.parse(mockReq.mock.calls[3][1]?.body as string)).toEqual({ icc: 0.02 });
    await disableEvaluation("c1");
    expect(mockReq.mock.calls[4][1]?.method).toBe("DELETE");
    await snapshotCampaignHeat("c1");
    expect(mockReq.mock.calls[5][0]).toBe("/canvass/campaigns/c1/heat/snapshot");
    expect(mockReq.mock.calls[5][1]?.method).toBe("POST");
  });
});
