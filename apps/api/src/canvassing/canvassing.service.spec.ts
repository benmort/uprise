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
    engagement = { recordDisposition: jest.fn().mockResolvedValue({ id: "disp1" }) };
    service = new CanvassingService(prisma, engagement);
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
