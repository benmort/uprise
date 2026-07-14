import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ request: vi.fn(async () => ({ ok: true, data: null })) }));

import { request } from "@/lib/api";
import {
  listIndicators,
  getChoropleth,
  getRegionProfile,
  getDemographicsStatus,
} from "./demographics";

const mockReq = request as unknown as ReturnType<typeof vi.fn>;

describe("demographics api client", () => {
  beforeEach(() => {
    mockReq.mockClear();
    mockReq.mockResolvedValue({ ok: true, data: null });
  });

  it("listIndicators GETs the catalogue", async () => {
    await listIndicators();
    expect(mockReq.mock.calls[0][0]).toBe("/demographics/indicators");
  });

  it("getChoropleth encodes level + indicator", async () => {
    await getChoropleth("sa2", "median age");
    expect(mockReq.mock.calls[0][0]).toBe("/demographics/choropleth?level=sa2&indicator=median%20age");
  });

  it("getRegionProfile encodes level + code into the path", async () => {
    await getRegionProfile("mb", "206 04");
    expect(mockReq.mock.calls[0][0]).toBe("/demographics/regions/mb/206%2004");
  });

  it("getDemographicsStatus GETs the status", async () => {
    await getDemographicsStatus();
    expect(mockReq.mock.calls[0][0]).toBe("/demographics/status");
  });
});
