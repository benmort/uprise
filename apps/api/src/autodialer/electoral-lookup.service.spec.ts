import { ElectoralLookupService, stateFromPostcode } from "./electoral-lookup.service";

/**
 * Electoral targeting on uprise's own civic data. The queries themselves run
 * against geo.postcode_region + civic.Politician; here we pin the routing
 * logic — kind/geoKind selection, the Senate state path, the party filter and
 * the "no dialable number → null" degradation.
 */

const wills = { code: "318", name: "Wills", address_count: 40000 };
const cooper = { code: "312", name: "Cooper", address_count: 9000 };

const mp = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Alex Example",
  party: "Australian Labor Party",
  jurisdiction: "FEDERAL",
  geoKind: "ced",
  geoCode: "318",
  electorate: "Wills",
  phone: "+61393504222",
  ...over,
});

function setup() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    politician: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ElectoralLookupService(prisma as never);
  return { service, prisma };
}

describe("stateFromPostcode", () => {
  it("maps the published ranges, including the leading-zero territories", () => {
    expect(stateFromPostcode("2000")).toBe("NSW");
    expect(stateFromPostcode("2600")).toBe("ACT");
    expect(stateFromPostcode("2900")).toBe("ACT");
    expect(stateFromPostcode("2650")).toBe("NSW");
    expect(stateFromPostcode("3058")).toBe("VIC");
    expect(stateFromPostcode("4000")).toBe("QLD");
    expect(stateFromPostcode("5000")).toBe("SA");
    expect(stateFromPostcode("6000")).toBe("WA");
    expect(stateFromPostcode("7250")).toBe("TAS");
    expect(stateFromPostcode("0800")).toBe("NT");
    expect(stateFromPostcode("0221")).toBe("ACT");
  });

  it("rejects non-postcodes", () => {
    expect(stateFromPostcode("380")).toBeNull();
    expect(stateFromPostcode("30588")).toBeNull();
    expect(stateFromPostcode("abcd")).toBeNull();
  });
});

describe("lookupPostcode", () => {
  it("returns [] for a malformed postcode without touching the database", async () => {
    const { service, prisma } = setup();
    expect(await service.lookupPostcode("30a8", null)).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("maps rows dominant-first and defaults a missing name to the code", async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([wills, { ...cooper, name: null }]);
    const options = await service.lookupPostcode("3058", null);
    expect(options).toEqual([
      { code: "318", name: "Wills", addressCount: 40000 },
      { code: "312", name: "312", addressCount: 9000 },
    ]);
  });

  it("queries ceds for FEDERAL and seds for a state jurisdiction", async () => {
    const { service, prisma } = setup();
    await service.lookupPostcode("3058", null);
    let sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(expect.arrayContaining(["ced", "FEDERAL"]));
    await service.lookupPostcode("3058", "VIC");
    sql = prisma.$queryRaw.mock.calls[1][0];
    expect(sql.values).toEqual(expect.arrayContaining(["sed", "sed_lower", "VIC"]));
  });
});

describe("resolveTarget", () => {
  it("resolves the lower-house member for the chosen electorate", async () => {
    const { service, prisma } = setup();
    prisma.politician.findMany.mockResolvedValue([mp()]);
    const target = await service.resolveTarget(
      { jurisdiction: null, officeTarget: null, partyTargets: null } as never,
      { postcode: "3058", electorate: { code: "318", name: "Wills", addressCount: 1 } },
    );
    expect(prisma.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { geoKind: "ced", geoCode: "318", jurisdiction: "FEDERAL" },
      }),
    );
    expect(target).toEqual({
      number: "+61393504222",
      name: "Alex Example",
      party: "Australian Labor Party",
      electorate: "Wills",
    });
  });

  it("filters by partyTargets case-insensitively", async () => {
    const { service, prisma } = setup();
    prisma.politician.findMany.mockResolvedValue([
      mp({ id: "p1", name: "A", party: "Liberal Party" }),
      mp({ id: "p2", name: "B", party: "Australian Greens", phone: "+61390001111" }),
    ]);
    const target = await service.resolveTarget(
      { jurisdiction: null, officeTarget: null, partyTargets: ["australian greens"] } as never,
      { postcode: "3058", electorate: { code: "318", name: "Wills", addressCount: 1 } },
    );
    expect(target?.name).toBe("B");
  });

  it("returns null when no member has a dialable number (graceful degradation)", async () => {
    const { service, prisma } = setup();
    prisma.politician.findMany.mockResolvedValue([mp({ phone: null }), mp({ id: "p2", phone: "12345" })]);
    const target = await service.resolveTarget(
      { jurisdiction: null, officeTarget: null, partyTargets: null } as never,
      { postcode: "3058", electorate: { code: "318", name: "Wills", addressCount: 1 } },
    );
    expect(target).toBeNull();
  });

  it("routes federal 'upper' to the postcode state's senators", async () => {
    const { service, prisma } = setup();
    prisma.politician.findMany.mockResolvedValue([
      mp({ geoKind: "chamber_electorate", geoCode: "SENATE-VIC", electorate: null, name: "Senator C" }),
    ]);
    const target = await service.resolveTarget(
      { jurisdiction: "FEDERAL", officeTarget: "upper", partyTargets: null } as never,
      { postcode: "3058" },
    );
    expect(prisma.politician.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { geoKind: "chamber_electorate", geoCode: "SENATE-VIC", jurisdiction: "FEDERAL" },
      }),
    );
    expect(target?.name).toBe("Senator C");
    expect(target?.electorate).toBe("SENATE-VIC");
  });

  it("state 'upper' resolves to nothing — address_region has no upper-house layer", async () => {
    const { service, prisma } = setup();
    const target = await service.resolveTarget(
      { jurisdiction: "VIC", officeTarget: "upper", partyTargets: null } as never,
      { postcode: "3058", electorate: { code: "V1", name: "Brunswick", addressCount: 1 } },
    );
    expect(target).toBeNull();
    expect(prisma.politician.findMany).not.toHaveBeenCalled();
  });

  it("without an electorate the lower-house path resolves to nothing", async () => {
    const { service } = setup();
    const target = await service.resolveTarget(
      { jurisdiction: null, officeTarget: null, partyTargets: null } as never,
      { postcode: "3058" },
    );
    expect(target).toBeNull();
  });
});
