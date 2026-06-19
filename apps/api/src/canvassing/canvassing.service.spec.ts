import { Prisma, TurfAssignmentStatus } from "../../src/generated/prisma";
import { CanvassingService } from "./canvassing.service";

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

describe("CanvassingService", () => {
  let prisma: any;
  let engagement: any;
  let geo: any;
  let service: CanvassingService;

  beforeEach(() => {
    prisma = {
      turf: { findFirst: jest.fn().mockResolvedValue({ id: "t1", organizationId: "org1" }), findMany: jest.fn() },
      turfAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      doorKnock: {
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "dk1", ...data })),
        findMany: jest.fn(),
      },
      walkListItem: { updateMany: jest.fn() },
      walkList: { findMany: jest.fn() },
      contact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "c_new", ...data })),
      },
      appUser: { create: jest.fn() },
    };
    engagement = {
      recordDisposition: jest.fn().mockResolvedValue({ id: "disp1" }),
      recordSurveyAnswer: jest.fn().mockResolvedValue({ id: "qr1" }),
    };
    geo = { addresses: jest.fn().mockResolvedValue([]) };
    service = new CanvassingService(prisma, engagement, geo);
  });

  describe("assignTurf", () => {
    it("creates an ASSIGNED lock for a free turf", async () => {
      prisma.turfAssignment.create.mockResolvedValue({ id: "a1", canvasserId: "u1" });
      const result = await service.assignTurf("org1", "t1", "u1");
      expect(result.id).toBe("a1");
    });

    it("rejects with TURF_LOCKED when another canvasser already holds the lock", async () => {
      prisma.turfAssignment.create.mockRejectedValue(p2002());
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "someone_else" });

      await expect(service.assignTurf("org1", "t1", "u1")).rejects.toThrow();
    });

    it("is idempotent when the same canvasser re-claims", async () => {
      prisma.turfAssignment.create.mockRejectedValue(p2002());
      prisma.turfAssignment.findFirst.mockResolvedValue({ id: "a1", canvasserId: "u1" });

      const result = await service.assignTurf("org1", "t1", "u1");
      expect(result.id).toBe("a1");
    });
  });

  describe("releaseTurf", () => {
    it("releases the canvasser's active lock", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1" });
      prisma.turfAssignment.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.releaseTurf("org1", "t1", "u1");
      expect(prisma.turfAssignment.updateMany).toHaveBeenCalledWith({
        where: { turfId: "t1", canvasserId: "u1", status: TurfAssignmentStatus.ASSIGNED },
        data: { status: "RELEASED", releasedAt: expect.any(Date) },
      });
      expect(res.count).toBe(1);
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.releaseTurf("org1", "missing", "u1")).rejects.toThrow();
    });
  });

  describe("recordDoorKnock", () => {
    const baseInput = {
      contactId: "c1",
      canvasserId: "u1",
      localId: "local-123",
      dispositionCode: "not_home",
    };

    it("returns the existing knock on idempotent replay without re-recording", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue({ id: "dk_existing" });

      const result = await service.recordDoorKnock("org1", baseInput);

      expect(result.id).toBe("dk_existing");
      expect(prisma.doorKnock.create).not.toHaveBeenCalled();
      expect(engagement.recordDisposition).not.toHaveBeenCalled();
    });

    it("rejects when the contact's turf is locked to another canvasser", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1" });
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "another" });

      await expect(service.recordDoorKnock("org1", baseInput)).rejects.toThrow();
      expect(prisma.doorKnock.create).not.toHaveBeenCalled();
    });

    it("records the knock and the disposition through the engagement layer", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1" });
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "u1" });

      await service.recordDoorKnock("org1", { ...baseInput, walkListItemId: "wli1" });

      expect(prisma.doorKnock.create).toHaveBeenCalled();
      expect(prisma.walkListItem.updateMany).toHaveBeenCalledWith({
        where: { id: "wli1" },
        data: { status: "VISITED" },
      });
      expect(engagement.recordDisposition).toHaveBeenCalledWith(
        "org1",
        expect.objectContaining({ contactId: "c1", code: "not_home", channel: "DOOR" }),
      );
    });

    it("persists each survey answer through the engagement layer with the campaign id", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      // One mock satisfies both the lock check (.turfId) and the campaign resolve (.turf.campaignId).
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1", turf: { campaignId: "camp1" } });
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "u1" });

      await service.recordDoorKnock("org1", {
        ...baseInput,
        dispositionCode: "spoke_to_target",
        surveyAnswers: [
          { questionId: "q1", optionId: "o1" },
          { questionId: "q2", valueText: "4" },
        ],
      });

      expect(engagement.recordSurveyAnswer).toHaveBeenCalledTimes(2);
      expect(engagement.recordSurveyAnswer).toHaveBeenNthCalledWith(
        1,
        "org1",
        expect.objectContaining({
          contactId: "c1",
          questionId: "q1",
          optionId: "o1",
          channel: "DOOR",
          campaignId: "camp1",
          recordedById: "u1",
        }),
      );
      expect(engagement.recordSurveyAnswer).toHaveBeenNthCalledWith(
        2,
        "org1",
        expect.objectContaining({ questionId: "q2", valueText: "4", campaignId: "camp1" }),
      );
    });

    it("does not record survey answers on idempotent replay", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue({ id: "dk_existing" });

      await service.recordDoorKnock("org1", {
        ...baseInput,
        surveyAnswers: [{ questionId: "q1", optionId: "o1" }],
      });

      expect(engagement.recordSurveyAnswer).not.toHaveBeenCalled();
    });

    it("allows a knock when the contact has no turf (no lock to enforce)", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: null });

      await service.recordDoorKnock("org1", { ...baseInput, dispositionCode: null });

      expect(prisma.doorKnock.create).toHaveBeenCalled();
      expect(prisma.turfAssignment.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("uploadDoorPhoto", () => {
    it("rejects when no file is provided", async () => {
      await expect(service.uploadDoorPhoto(undefined)).rejects.toThrow();
    });

    it("rejects when blob storage is not configured", async () => {
      const prev = process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_READ_WRITE_TOKEN;
      await expect(
        service.uploadDoorPhoto({ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg" }),
      ).rejects.toThrow();
      if (prev !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prev;
    });
  });

  describe("createDoorContact", () => {
    it("creates a contact in the turf when the canvasser holds the lock", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "u1" });
      const c = await service.createDoorContact("org1", {
        canvasserId: "u1",
        turfId: "t1",
        firstName: "Sam",
      });
      expect(prisma.contact.create).toHaveBeenCalled();
      expect(c.id).toBe("c_new");
    });

    it("rejects when the turf is not assigned to the canvasser", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ canvasserId: "other" });
      await expect(
        service.createDoorContact("org1", { canvasserId: "u1", turfId: "t1", firstName: "Sam" }),
      ).rejects.toThrow();
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });
  });

  describe("qaReview", () => {
    it("flags no-GPS and too-fast knocks", async () => {
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }]);
      const base = new Date("2026-06-17T10:00:00Z").getTime();
      prisma.doorKnock.findMany.mockResolvedValue([
        { id: "k1", canvasserId: "u1", lat: null, lng: null, createdAt: new Date(base), canvasser: { displayName: "Ada" } },
        { id: "k2", canvasserId: "u1", lat: 1, lng: 1, createdAt: new Date(base + 5000), canvasser: { displayName: "Ada" } },
      ]);
      const { flags } = await service.qaReview("org1", "c1");
      // k1: no GPS; k2: knocked 5s after k1
      expect(flags.some((f) => f.reason.includes("No GPS"))).toBe(true);
      expect(flags.some((f) => f.reason.includes("after previous"))).toBe(true);
    });

    it("returns no flags when the campaign has no turf", async () => {
      prisma.turf.findMany.mockResolvedValue([]);
      const { flags } = await service.qaReview("org1", "c1");
      expect(flags).toEqual([]);
    });
  });

  describe("createCanvasser", () => {
    it("hashes the password and defaults to CANVASSER", async () => {
      prisma.appUser.create.mockImplementation(async ({ data }: any) => ({
        id: "u1",
        displayName: data.displayName,
        email: data.email,
        role: data.role,
      }));
      const user = await service.createCanvasser("org1", {
        displayName: "Ada",
        email: "Ada@Example.com",
        password: "supersecret",
      });
      const arg = prisma.appUser.create.mock.calls[0][0].data;
      expect(arg.passwordHash).toBeTruthy();
      expect(arg.passwordHash).not.toBe("supersecret"); // hashed, not plaintext
      expect(arg.email).toBe("ada@example.com"); // normalised
      expect(arg.role).toBe("CANVASSER");
      expect(user.id).toBe("u1");
    });

    it("maps a duplicate email to EMAIL_TAKEN", async () => {
      prisma.appUser.create.mockRejectedValue(p2002());
      await expect(
        service.createCanvasser("org1", { displayName: "Ada", email: "a@b.c", password: "supersecret" }),
      ).rejects.toThrow();
    });
  });

  describe("rebucketTurf", () => {
    // A unit square turf (0,0)-(1,1) in GeoJSON [lng,lat] order.
    const square = {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    };

    it("claims contacts now inside and releases those now outside", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1", geometry: square });
      prisma.contact.findMany.mockResolvedValue([
        { id: "inside-new", lat: 0.5, lng: 0.5, turfId: null }, // → add
        { id: "inside-already", lat: 0.2, lng: 0.2, turfId: "t1" }, // stays
        { id: "outside-was-in", lat: 9, lng: 9, turfId: "t1" }, // → remove
      ]);
      prisma.contact.count.mockResolvedValue(2);

      const res = await service.rebucketTurf("org1", "t1");

      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["inside-new"] } },
        data: { turfId: "t1" },
      });
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["outside-was-in"] } },
        data: { turfId: null },
      });
      expect(res).toEqual({ added: 1, removed: 1, total: 2 });
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.rebucketTurf("org1", "missing")).rejects.toThrow();
    });
  });

  describe("loadUniverseIntoTurf", () => {
    const coldDoors = [
      { gnafPid: "GA1", address: "1 St", lat: 1, lng: 1 },
      { gnafPid: "GA2", address: "2 St", lat: 2, lng: 2 },
    ];

    it("is a no-op for the 'existing' universe (never queries geo)", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1" });
      prisma.contact.count.mockResolvedValue(7);

      const res = await service.loadUniverseIntoTurf("org1", "t1", { universe: "existing" });

      expect(geo.addresses).not.toHaveBeenCalled();
      expect(prisma.contact.createMany).toBeUndefined();
      expect(res).toEqual({ materialised: 0, total: 7 });
    });

    it("materialises cold doors as contacts with gnafPid + coldDoor metadata", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1" });
      prisma.contact.findMany.mockResolvedValue([]); // none seen yet
      prisma.contact.createMany = jest.fn().mockResolvedValue({ count: 2 });
      prisma.contact.count.mockResolvedValue(2);
      geo.addresses.mockResolvedValue(coldDoors);

      const res = await service.loadUniverseIntoTurf("org1", "t1", { universe: "hybrid" });

      expect(geo.addresses).toHaveBeenCalledWith("org1", {
        turfId: "t1",
        withoutContacts: true,
        limit: 2000,
      });
      const created = prisma.contact.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({
        organizationId: "org1",
        turfId: "t1",
        gnafPid: "GA1",
        metadata: { coldDoor: true },
      });
      expect(res).toEqual({ materialised: 2, total: 2 });
    });

    it("skips gnafPids already on a contact (idempotent re-run)", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1" });
      prisma.contact.findMany.mockResolvedValue([{ gnafPid: "GA1" }]); // GA1 already present
      prisma.contact.createMany = jest.fn().mockResolvedValue({ count: 1 });
      prisma.contact.count.mockResolvedValue(2);
      geo.addresses.mockResolvedValue(coldDoors);

      const res = await service.loadUniverseIntoTurf("org1", "t1", { universe: "none" });

      const created = prisma.contact.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(1);
      expect(created[0].gnafPid).toBe("GA2");
      expect(res.materialised).toBe(1);
    });

    it("degrades to 0 materialised when no geo addresses are returned", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1" });
      prisma.contact.createMany = jest.fn();
      prisma.contact.count.mockResolvedValue(0);
      geo.addresses.mockResolvedValue([]);

      const res = await service.loadUniverseIntoTurf("org1", "t1", { universe: "hybrid" });

      expect(prisma.contact.createMany).not.toHaveBeenCalled();
      expect(res).toEqual({ materialised: 0, total: 0 });
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(
        service.loadUniverseIntoTurf("org1", "missing", { universe: "hybrid" }),
      ).rejects.toThrow();
    });
  });

  describe("listWalkLists", () => {
    it("surfaces stop counts and the active lock holder", async () => {
      prisma.walkList.findMany.mockResolvedValue([
        {
          id: "w1",
          name: "List A",
          turfId: "t1",
          campaignId: "c1",
          listType: "STATIC",
          createdAt: new Date(),
          _count: { items: 32 },
          items: [{ id: "i1" }, { id: "i2" }],
          turf: {
            id: "t1",
            name: "Turf 1",
            assignments: [
              {
                canvasserId: "u1",
                assignedAt: new Date(),
                lockedUntil: null,
                canvasser: { id: "u1", displayName: "Ada" },
              },
            ],
          },
        },
      ]);
      const rows = await service.listWalkLists("org1", "t1");
      expect(rows[0].stopCount).toBe(32);
      expect(rows[0].visitedCount).toBe(2);
      expect(rows[0].assignedTo?.name).toBe("Ada");
    });
  });
});
