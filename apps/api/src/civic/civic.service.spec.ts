import { CivicService } from "./civic.service";
import { ApiHttpException } from "../common/http/api-response";

const svc = (prisma: Record<string, unknown>) => new CivicService(prisma as never);

const POLITICIAN = {
  id: "p1",
  tvfyId: 1,
  name: "Alice",
  firstName: "Alice",
  lastName: "A",
  party: "ALP",
  house: "REPS",
  electorate: "Grayndler",
  geoKind: "ced",
  geoCode: "c1",
  rebellions: 0,
  votesAttended: 10,
  votesPossible: 12,
};

describe("CivicService", () => {
  describe("listPoliticians", () => {
    it("builds a filtered where (valid house, insensitive party/name, geo)", async () => {
      const findMany = jest.fn(async () => [POLITICIAN]);
      const res = await svc({ politician: { findMany } }).listPoliticians({
        house: "REPS",
        party: "ALP",
        geoKind: "ced",
        geoCode: "c1",
        q: "ali",
      });
      expect(res[0]).toMatchObject({ id: "p1", house: "REPS", geoCode: "c1" });
      expect((findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        house: "REPS",
        party: { equals: "ALP", mode: "insensitive" },
        geoKind: "ced",
        geoCode: "c1",
        name: { contains: "ali", mode: "insensitive" },
      });
    });

    it("ignores an invalid house value (no house filter applied)", async () => {
      const findMany = jest.fn(async () => []);
      await svc({ politician: { findMany } }).listPoliticians({ house: "bogus" });
      expect((findMany as jest.Mock).mock.calls[0][0].where).toEqual({});
    });
  });

  describe("getPolitician", () => {
    it("404s a missing politician", async () => {
      const prisma = { politician: { findUnique: jest.fn(async () => null) } };
      await expect(svc(prisma).getPolitician("nope")).rejects.toBeInstanceOf(ApiHttpException);
    });

    it("maps detail incl. positions (Decimal agreement → number)", async () => {
      const prisma = {
        politician: {
          findUnique: jest.fn(async () => ({
            ...POLITICIAN,
            offices: [{ position: "Minister" }],
            lastSyncedAt: null,
            positions: [
              { agreement: 80, voted: true, category: "for3", policy: { id: "pc1", tvfyId: 10, name: "SSM", provisional: false } },
            ],
          })),
        },
      };
      const res = await svc(prisma).getPolitician("p1");
      expect(res.positions[0]).toMatchObject({ policyId: "pc1", policyName: "SSM", agreement: 80, voted: true, category: "for3" });
      expect(res.offices).toEqual([{ position: "Minister" }]);
    });
  });

  describe("policies", () => {
    it("listPolicies applies q + provisional filters and maps rows", async () => {
      const findMany = jest.fn(async () => [{ id: "pc1", tvfyId: 10, name: "SSM", description: "d", provisional: false, lastEditedAt: null }]);
      const res = await svc({ policy: { findMany } }).listPolicies({ q: "ssm", provisional: false });
      expect(res[0]).toMatchObject({ id: "pc1", name: "SSM" });
      expect((findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        name: { contains: "ssm", mode: "insensitive" },
        provisional: false,
      });
    });

    it("getPolicy 404s when missing and maps positions when present", async () => {
      await expect(svc({ policy: { findUnique: jest.fn(async () => null) } }).getPolicy("no")).rejects.toBeInstanceOf(ApiHttpException);
      const prisma = {
        policy: {
          findUnique: jest.fn(async () => ({
            id: "pc1",
            tvfyId: 10,
            name: "SSM",
            description: "d",
            provisional: false,
            lastEditedAt: null,
            positions: [
              { agreement: 100, voted: true, category: "for3", politician: { id: "p1", tvfyId: 1, name: "Alice", party: "ALP", house: "REPS", electorate: "Grayndler" } },
            ],
          })),
        },
      };
      const res = await svc(prisma).getPolicy("pc1");
      expect(res.positions[0]).toMatchObject({ politicianId: "p1", politicianName: "Alice", agreement: 100, voted: true });
    });
  });
});
