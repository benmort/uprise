import { Chamber, House } from "@uprise/db";
import {
  CivicSyncService,
  buildPoliticianFields,
  parseAgreement,
  parseHouse,
  resolveSenateCode,
} from "./civic-sync.service";

describe("civic-sync pure helpers", () => {
  it("parseHouse maps TVFY house strings, else null", () => {
    expect(parseHouse("representatives")).toBe(House.REPS);
    expect(parseHouse("Senate")).toBe(House.SENATE);
    expect(parseHouse("lords")).toBeNull();
    expect(parseHouse(null)).toBeNull();
  });

  it("resolveSenateCode handles abbreviations and full names, else null", () => {
    expect(resolveSenateCode("Victoria")).toBe("SENATE-VIC");
    expect(resolveSenateCode("nsw")).toBe("SENATE-NSW");
    expect(resolveSenateCode("Queensland")).toBe("SENATE-QLD");
    expect(resolveSenateCode("ACT")).toBe("SENATE-ACT");
    expect(resolveSenateCode("Narnia")).toBeNull();
    expect(resolveSenateCode(null)).toBeNull();
  });

  it("parseAgreement coerces strings to numbers, else null", () => {
    expect(parseAgreement("100")).toBe(100);
    expect(parseAgreement(50)).toBe(50);
    expect(parseAgreement("")).toBeNull();
    expect(parseAgreement("nope")).toBeNull();
    expect(parseAgreement(null)).toBeNull();
  });

  const resolveCed = (name: string) => (name === "Grayndler" ? "cedX" : null);

  it("buildPoliticianFields resolves a Rep to (ced, code)", () => {
    const f = buildPoliticianFields(
      { id: 1, latest_member: { name: { first: "A", last: "B" }, electorate: "Grayndler", house: "representatives", party: "ALP" } },
      resolveCed,
    );
    expect(f).toMatchObject({ name: "A B", party: "ALP", jurisdiction: "FEDERAL", chamber: Chamber.LOWER, house: House.REPS, geoKind: "ced", geoCode: "cedX" });
  });

  it("buildPoliticianFields leaves geoCode null for an unresolved Rep electorate", () => {
    const f = buildPoliticianFields(
      { id: 2, latest_member: { name: { first: "C", last: "D" }, electorate: "Nowhere", house: "representatives" } },
      resolveCed,
    );
    expect(f).toMatchObject({ house: House.REPS, geoKind: "ced", geoCode: null });
  });

  it("buildPoliticianFields resolves a Senator to (chamber_electorate, SENATE-<STATE>)", () => {
    const f = buildPoliticianFields(
      { id: 3, latest_member: { name: { first: "E", last: "F" }, electorate: "Victoria", house: "senate" } },
      resolveCed,
    );
    expect(f).toMatchObject({ house: House.SENATE, geoKind: "chamber_electorate", geoCode: "SENATE-VIC" });
  });

  it("buildPoliticianFields returns null without a usable membership", () => {
    expect(buildPoliticianFields({ id: 4 }, resolveCed)).toBeNull();
    expect(buildPoliticianFields({ id: 5, latest_member: { house: "unknown" } }, resolveCed)).toBeNull();
  });
});

describe("CivicSyncService.run", () => {
  const prismaMock = () => ({
    civicSyncRun: { create: jest.fn(async () => ({ id: "run1" })), update: jest.fn(async () => ({})) },
    politician: {
      upsert: jest.fn(async ({ where }: { where: { tvfyId: number } }) => ({ id: `pol-${where.tvfyId}` })),
      update: jest.fn(async () => ({})),
    },
    policy: { upsert: jest.fn(async ({ where }: { where: { tvfyId: number } }) => ({ id: `pcy-${where.tvfyId}` })) },
    policyPosition: { upsert: jest.fn(async () => ({})) },
    $queryRawUnsafe: jest.fn(async () => [{ code: "cedX", name: "Grayndler" }]),
  });

  const tvfyMock = () => ({
    listPeople: jest.fn(async () => [
      { id: 1, latest_member: { name: { first: "A", last: "B" }, electorate: "Grayndler", house: "representatives", party: "ALP" } },
      { id: 2, latest_member: { name: { first: "C", last: "D" }, electorate: "Victoria", house: "senate", party: "Greens" } },
      { id: 3, latest_member: { name: { first: "E", last: "F" }, electorate: "Nowhere", house: "representatives" } },
    ]),
    listPolicies: jest.fn(async () => [{ id: 10, name: "P10", description: "d", provisional: false, last_edited_at: "2022-01-01T00:00:00Z" }]),
    getPerson: jest.fn(async (id: number) => ({
      id,
      rebellions: 1,
      votes_attended: 2,
      votes_possible: 3,
      offices: [],
      policy_comparisons: [{ policy: { id: 10, name: "P10" }, agreement: "80", voted: true }],
    })),
  });

  it("upserts politicians/policies/positions, counts unmatched, and stamps the run succeeded", async () => {
    const prisma = prismaMock();
    const tvfy = tvfyMock();
    const summary = await new CivicSyncService(prisma as never, tvfy as never).run();

    expect(summary).toEqual({ politicians: 3, policies: 1, positions: 3, unmatched: 1 });
    expect(prisma.politician.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.policyPosition.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled(); // ced resolver
    expect(prisma.civicSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "succeeded", positions: 3 }) }),
    );
  });

  it("marks the run failed and rethrows when the sync throws", async () => {
    const prisma = prismaMock();
    const tvfy = { ...tvfyMock(), listPeople: jest.fn(async () => { throw new Error("boom"); }) };
    await expect(new CivicSyncService(prisma as never, tvfy as never).run()).rejects.toThrow("boom");
    expect(prisma.civicSyncRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }),
    );
  });
});
