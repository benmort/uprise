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
      nearbyAddresses: jest.fn().mockResolvedValue([]),
      addresses: jest.fn().mockResolvedValue([]),
    }) as unknown as jest.Mocked<GeoService>;

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

  it("ingest returns queued intent (ignores tenantId)", async () => {
    const svc = makeSvc();
    const c = new GeoController(svc);
    await expect(c.ingest("t1")).resolves.toMatchObject({ queued: true });
  });
});
