import { PublicInsightsController } from "./public-insights.controller";
import type { InsightsService } from "./insights.service";
import type { GeoService } from "../geo/geo.service";

function mockRes() {
  const res = {} as {
    status: jest.Mock;
    setHeader: jest.Mock;
    send: jest.Mock;
    end: jest.Mock;
  };
  res.status = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe("PublicInsightsController public tiles", () => {
  const make = (tile = jest.fn().mockResolvedValue(Buffer.from([1, 2, 3]))) => {
    const ctrl = new PublicInsightsController({} as InsightsService, { tile } as unknown as GeoService);
    return { ctrl, tile };
  };

  it("404s a non-allowlisted layer without touching geo (never opens /geo/tiles)", async () => {
    const { ctrl, tile } = make();
    const res = mockRes();
    await ctrl.tile("gnaf", "5", "1", "1", res as never);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalled();
    expect(tile).not.toHaveBeenCalled();
  });

  it("serves an allowlisted sed_upper tile as long-cached MVT", async () => {
    const { ctrl, tile } = make();
    const res = mockRes();
    await ctrl.tile("sed_upper", "8", "2", "3", res as never);
    expect(tile).toHaveBeenCalledWith("sed_upper", 8, 2, 3);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/x-protobuf");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=86400");
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it("204s an empty tile (no features in the bbox)", async () => {
    const { ctrl } = make(jest.fn().mockResolvedValue(Buffer.alloc(0)));
    const res = mockRes();
    await ctrl.tile("sed_upper", "8", "2", "3", res as never);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).not.toHaveBeenCalled();
  });
});
