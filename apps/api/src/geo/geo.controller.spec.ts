import { GeoController } from "./geo.controller";
import type { GeoService } from "./geo.service";

describe("GeoController", () => {
  const makeSvc = () =>
    ({
      status: jest.fn().mockResolvedValue({ ok: true }),
      listDivisions: jest.fn().mockResolvedValue([]),
      divisionDetail: jest.fn().mockResolvedValue({}),
      listStates: jest.fn().mockResolvedValue([]),
      stateDetail: jest.fn().mockResolvedValue({}),
      regionHierarchy: jest.fn().mockResolvedValue({}),
      searchAreas: jest.fn().mockResolvedValue([]),
      browseAreas: jest.fn().mockResolvedValue({}),
      area: jest.fn().mockResolvedValue({}),
      areaDetail: jest.fn().mockResolvedValue({}),
      areas: jest.fn().mockResolvedValue([]),
      areaAddressCount: jest.fn().mockResolvedValue(0),
      tile: jest.fn().mockResolvedValue(Buffer.alloc(0)),
      nearbyAddresses: jest.fn().mockResolvedValue([]),
      addresses: jest.fn().mockResolvedValue([]),
      listChambers: jest.fn().mockResolvedValue([]),
      listChamberElectorates: jest.fn().mockResolvedValue([]),
      chamberElectorateDetail: jest.fn().mockResolvedValue({}),
      listFirstNations: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      firstNationsDetail: jest.fn().mockResolvedValue({}),
    }) as unknown as jest.Mocked<GeoService>;

  it("listFirstNations delegates, defaults to ireg, and coerces paging to numbers", async () => {
    const svc = makeSvc();
    await new GeoController(svc).listFirstNations("iloc", "dub", "1", "10", "20");
    expect(svc.listFirstNations).toHaveBeenCalledWith("iloc", { q: "dub", state: "1", limit: 10, offset: 20 });

    const svc2 = makeSvc();
    await new GeoController(svc2).listFirstNations();
    expect(svc2.listFirstNations).toHaveBeenCalledWith("ireg", { q: "", state: undefined, limit: undefined, offset: undefined });
  });

  it("firstNationsDetail delegates with the tenant, level and code", async () => {
    const svc = makeSvc();
    await new GeoController(svc).firstNationsDetail("tenant-1", "iloc", "10100101");
    expect(svc.firstNationsDetail).toHaveBeenCalledWith("tenant-1", "iloc", "10100101");
  });

  it("listChambers delegates", async () => {
    const svc = makeSvc();
    await new GeoController(svc).listChambers();
    expect(svc.listChambers).toHaveBeenCalledWith();
  });

  it("listChamberElectorates delegates", async () => {
    const svc = makeSvc();
    await new GeoController(svc).listChamberElectorates();
    expect(svc.listChamberElectorates).toHaveBeenCalledWith();
  });

  it("chamberElectorateDetail delegates with the tenant + code", async () => {
    const svc = makeSvc();
    await new GeoController(svc).chamberElectorateDetail("tenant-1", "SENATE-VIC");
    expect(svc.chamberElectorateDetail).toHaveBeenCalledWith("tenant-1", "SENATE-VIC");
  });

  it("status delegates", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.status();
    expect(svc.status).toHaveBeenCalledWith();
  });

  it("listDivisions delegates + defaults type to ced", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.listDivisions();
    expect(svc.listDivisions).toHaveBeenCalledWith("ced");
  });

  it("divisionDetail delegates with tenantId, type + code", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.divisionDetail("t1", "ced", "101");
    expect(svc.divisionDetail).toHaveBeenCalledWith("t1", "ced", "101");
  });

  it("listStates delegates", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.listStates();
    expect(svc.listStates).toHaveBeenCalledWith();
  });

  it("stateDetail delegates with tenantId + code", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.stateDetail("t1", "NSW");
    expect(svc.stateDetail).toHaveBeenCalledWith("t1", "NSW");
  });

  it("regionHierarchy delegates + defaults kind/code to empty", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.regionHierarchy();
    expect(svc.regionHierarchy).toHaveBeenCalledWith("", "");
  });

  it("searchAreas delegates + parses limit", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.searchAreas("sa2", "syd", "5", "NSW");
    expect(svc.searchAreas).toHaveBeenCalledWith("sa2", "syd", 5, "NSW");
  });

  it("searchAreas passes undefined limit when omitted", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.searchAreas("sa2", "syd");
    expect(svc.searchAreas).toHaveBeenCalledWith("sa2", "syd", undefined, undefined);
  });

  it("browseAreas delegates + parses numeric opts", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.browseAreas("sa2", "syd", "NSW", "10", "20");
    expect(svc.browseAreas).toHaveBeenCalledWith("sa2", {
      q: "syd",
      state: "NSW",
      limit: 10,
      offset: 20,
    });
  });

  it("area delegates with layer + code", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.area("sa2", "101");
    expect(svc.area).toHaveBeenCalledWith("sa2", "101");
  });

  it("areaDetail delegates with tenantId, layer + code", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.areaDetail("t1", "sa2", "101");
    expect(svc.areaDetail).toHaveBeenCalledWith("t1", "sa2", "101");
  });

  it("listAreas delegates + parses limit", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.listAreas("sa2", "1,2,3,4", "50");
    expect(svc.areas).toHaveBeenCalledWith({ layer: "sa2", bbox: "1,2,3,4", limit: 50 });
  });

  it("addressesNear delegates with tenantId + parsed coords", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.addressesNear("t1", "-33.8", "151.2", "10");
    expect(svc.nearbyAddresses).toHaveBeenCalledWith("t1", { lat: -33.8, lng: 151.2, limit: 10 });
  });

  it("addresses delegates with tenantId + filters", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.addresses("t1", "turf1", "ced", "101", "true", "25");
    expect(svc.addresses).toHaveBeenCalledWith("t1", {
      turfId: "turf1",
      divisionType: "ced",
      divisionCode: "101",
      withoutContacts: true,
      limit: 25,
    });
  });

  it("areaAddressCount parses the codes string into {level,code} pairs, dropping blanks", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await c.areaAddressCount("sa2:101,sa1:2020,,badformat");
    expect(svc.areaAddressCount).toHaveBeenCalledWith([
      { level: "sa2", code: "101" },
      { level: "sa1", code: "2020" },
      // no ":" separator → both parts empty (the service ignores it)
      { level: "", code: "" },
    ]);
  });

  it("areaAddressCount defaults to an empty set when no codes are given", async () => {
    const svc = makeSvc();
    await new GeoController(svc).areaAddressCount();
    expect(svc.areaAddressCount).toHaveBeenCalledWith([]);
  });

  it("ingest returns queued intent (ignores tenantId)", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await expect(c.ingest("t1")).resolves.toMatchObject({ queued: true });
  });

  const makeRes = () =>
    ({
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
      send: jest.fn(),
    }) as unknown as import("express").Response & {
      setHeader: jest.Mock;
      status: jest.Mock;
      end: jest.Mock;
      send: jest.Mock;
    };

  it("tile parses coords, sets binary + cache headers, and sends the buffer", async () => {
    const svc = makeSvc();
    (svc.tile as jest.Mock).mockResolvedValue(Buffer.from([1, 2, 3]));
    const c = new GeoController(svc);
    const res = makeRes();
    await c.tile("sa2", "9", "462", "314", res);
    expect(svc.tile).toHaveBeenCalledWith("sa2", 9, 462, 314);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/x-protobuf");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=86400");
    expect(res.send).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
    expect(res.status).not.toHaveBeenCalled();
  });

  it("tile answers 204 for an empty tile without sending a body", async () => {
    const svc = makeSvc();
    (svc.tile as jest.Mock).mockResolvedValue(Buffer.alloc(0));
    const c = new GeoController(svc);
    const res = makeRes();
    await c.tile("mb", "5", "3", "3", res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});
