import { AppUserRole, Prisma, TurfAssignmentStatus } from "@uprise/db";
import { CanvassingService } from "./canvassing.service";
import { ImageUploadService } from "../common/storage/image-upload.service";

// uploadDoorPhoto's happy path calls into @vercel/blob; mock the SDK so it never
// touches the network and returns a deterministic public URL.
jest.mock("@vercel/blob", () => ({
  put: jest.fn(async () => ({ url: "https://blob.example/door-knocks/x.jpg" })),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { put } = require("@vercel/blob") as { put: jest.Mock };

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

function p2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Record to update not found", {
    code: "P2025",
    clientVersion: "5.22.0",
  });
}

describe("CanvassingService", () => {
  let prisma: any;
  let engagement: any;
  let geo: any;
  let service: CanvassingService;
  let queue: { enqueue: jest.Mock };
  let directions: { routeLegs: jest.Mock; routeLegsAndGeometry: jest.Mock };
  let outbox: { append: jest.Mock };

  beforeEach(() => {
    prisma = {
      turf: {
        findFirst: jest.fn().mockResolvedValue({ id: "t1", tenantId: "org1" }),
        findMany: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "turf_new", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "t1", ...data })),
        delete: jest.fn().mockResolvedValue({ id: "t1" }),
      },
      turfAssignment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
      },
      doorKnock: {
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "dk1", ...data })),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      questionResponse: { groupBy: jest.fn() },
      disposition: { groupBy: jest.fn(async () => []) },
      canvassCampaign: { findFirst: jest.fn(), findMany: jest.fn() },
      walkListItem: {
        updateMany: jest.fn(),
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
        create: jest.fn(async ({ data }: any) => ({ id: "wli_new", ...data })),
        createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      walkList: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "w_new", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "w1", ...data })),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shift: {
        findFirst: jest.fn(),
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: any) => ({ id: "s_new", ...data })),
        deleteMany: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ id: "s1", ...data })),
      },
      qaFlagResolution: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(async ({ create }: any) => ({ id: "qfr1", ...create })),
      },
      contact: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "c_new", ...data })),
      },
      user: {
        create: jest.fn(async ({ data }: any) => ({ id: "u1", displayName: data.displayName, email: data.email })),
        findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ id: where.id, displayName: "Ada", email: "ada@example.com" })),
        update: jest.fn(async ({ data }: any) => ({ id: "u1", displayName: data.displayName ?? "Ada", email: "ada@example.com" })),
      },
      tenantMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ tenantId: "org1", userId: "u1", role: data.role })),
      },
      $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    engagement = {
      recordDisposition: jest.fn().mockResolvedValue({ id: "disp1" }),
      recordSurveyAnswer: jest.fn().mockResolvedValue({ id: "qr1" }),
    };
    geo = {
      addresses: jest.fn().mockResolvedValue([]),
      unionAreas: jest.fn(),
      unionSources: jest.fn(),
    };
    put.mockClear();
    // The estimate is queued, never awaited: a cut must not fail because Redis hiccuped.
    queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "j1", queued: true }) };
    directions = {
      routeLegs: jest.fn().mockResolvedValue(null),
      routeLegsAndGeometry: jest.fn().mockResolvedValue(null),
    };
    outbox = { append: jest.fn() };
    service = new CanvassingService(
      prisma,
      engagement,
      geo,
      queue as never,
      new ImageUploadService(),
      directions as never,
      outbox as never,
    );
  });

  describe("assignTurf", () => {
    it("creates an ASSIGNED lock for a free turf", async () => {
      prisma.turfAssignment.create.mockResolvedValue({ id: "a1", volunteerId: "u1" });
      const result = await service.assignTurf("org1", "t1", "u1");
      expect(result.id).toBe("a1");
    });

    it("rejects with TURF_LOCKED when another volunteer already holds the lock", async () => {
      prisma.turfAssignment.create.mockRejectedValue(p2002());
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "someone_else" });

      await expect(service.assignTurf("org1", "t1", "u1")).rejects.toThrow();
    });

    it("is idempotent when the same volunteer re-claims", async () => {
      prisma.turfAssignment.create.mockRejectedValue(p2002());
      prisma.turfAssignment.findFirst.mockResolvedValue({ id: "a1", volunteerId: "u1" });

      const result = await service.assignTurf("org1", "t1", "u1");
      expect(result.id).toBe("a1");
    });
  });

  describe("releaseTurf", () => {
    it("releases the volunteer's active lock", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      prisma.turfAssignment.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.releaseTurf("org1", "t1", "u1");
      expect(prisma.turfAssignment.updateMany).toHaveBeenCalledWith({
        where: { turfId: "t1", volunteerId: "u1", status: TurfAssignmentStatus.ASSIGNED },
        data: { status: "RELEASED", releasedAt: expect.any(Date) },
      });
      expect(res.count).toBe(1);
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.releaseTurf("org1", "missing", "u1")).rejects.toThrow();
    });
  });

  describe("recommendedTurf", () => {
    it("returns unassigned turf from self-serve campaigns, ranked by the volunteer's prefs", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ canvassPrefs: { sessionLength: "standard" } }); // target 40
      prisma.canvassCampaign.findMany.mockResolvedValue([
        { id: "camp1", name: "Northcote", selfClaimModes: [] }, // empty ⇒ all modes allowed
        { id: "camp2", name: "Brunswick", selfClaimModes: ["existing"] },
        { id: "camp3", name: "Richmond", selfClaimModes: ["area"] }, // mode C off ⇒ excluded
      ]);
      prisma.turf.findMany
        .mockResolvedValueOnce([
          { id: "t_big", name: "Big", campaignId: "camp1", _count: { contacts: 90 } },
          { id: "t_mid", name: "Mid", campaignId: "camp2", _count: { contacts: 45 } },
          { id: "t_small", name: "Small", campaignId: "camp1", _count: { contacts: 10 } },
        ])
        // Second narrow query: bbox geometry for ONLY the returned rows.
        .mockResolvedValueOnce([
          { id: "t_mid", name: "Mid", geometry: { type: "Polygon", coordinates: [[[1, 2], [3, 4], [1, 2]]] } },
          { id: "t_small", name: "Small", geometry: null },
          { id: "t_big", name: "Big", geometry: null },
        ]);

      const res = await service.recommendedTurf("org1", "u1");

      // Candidate query ranks on counts alone — geometry is never selected for the 100.
      expect(prisma.turf.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "org1",
            campaignId: { in: ["camp1", "camp2"] },
            assignments: { none: { status: TurfAssignmentStatus.ASSIGNED } },
          }),
          select: expect.not.objectContaining({ geometry: true }),
        }),
      );
      expect(prisma.turf.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: { in: ["t_mid", "t_small", "t_big"] } },
          select: { id: true, geometry: true },
        }),
      );
      // target 40 → 45 closest, then 10, then 90; campaign name resolved from the eligible map.
      expect(res.map((t) => t.id)).toEqual(["t_mid", "t_small", "t_big"]);
      expect(res[0]).toMatchObject({
        campaignId: "camp2",
        campaignName: "Brunswick",
        contactCount: 45,
        bbox: [1, 2, 3, 4],
      });
      expect(res[1].bbox).toBeNull();
      // The geometry (already fetched to derive the bbox) now rides along so the homepage card
      // draws the real turf outline, not just its bounding box.
      expect(res[0].geometry).toEqual({ type: "Polygon", coordinates: [[[1, 2], [3, 4], [1, 2]]] });
      expect(res[1].geometry).toBeNull();
    });

    it("returns [] (without querying turf) when no campaign allows claiming a ready turf", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue(null);
      prisma.canvassCampaign.findMany.mockResolvedValue([
        { id: "camp3", name: "Richmond", selfClaimModes: ["area", "draw"] },
      ]);

      const res = await service.recommendedTurf("org1", "u1");

      expect(res).toEqual([]);
      expect(prisma.turf.findMany).not.toHaveBeenCalled();
    });
  });

  describe("auto walk list on turf population (reconciling)", () => {
    // contactIds in the created walk list (order-agnostic — order is optimiseRoute's job, tested elsewhere).
    const createdContactIds = () => {
      const arg = prisma.walkList.create.mock.calls[0]?.[0];
      return (arg?.data?.items?.create ?? []).map((i: any) => i.contactId).sort();
    };
    const cs = (ids: string[]) => ids.map((id, i) => ({ id, lat: -37.8 - i * 0.01, lng: 144.9 + i * 0.01 }));

    it("builds a default wl_turf list of every address after loadUniverseIntoTurf", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "Brunswick 01", tenantId: "org1", campaignId: "camp1" });
      geo.addresses.mockResolvedValue([]); // no cold doors to materialise — exercise the walk-list build
      prisma.walkList.findFirst.mockResolvedValue(null); // no existing list → create path
      prisma.contact.findMany.mockResolvedValue(cs(["c1", "c2", "c3"]));
      prisma.contact.count.mockResolvedValue(3);

      await service.loadUniverseIntoTurf("org1", "t1", { universe: "none" });

      expect(prisma.walkList.create.mock.calls[0][0].data).toMatchObject({
        id: "wl_turf_t1",
        turfId: "t1",
        tenantId: "org1",
        campaignId: "camp1",
      });
      expect(createdContactIds()).toEqual(["c1", "c2", "c3"]);
    });

    it("builds a default wl_turf list after rebucketTurf buckets existing contacts", async () => {
      prisma.turf.findFirst.mockResolvedValue({
        id: "t1",
        name: "Brunswick 01",
        tenantId: "org1",
        campaignId: "camp1",
        geometry: { type: "Polygon", coordinates: [] },
      });
      prisma.walkList.findFirst.mockResolvedValue(null);
      prisma.contact.findMany
        .mockResolvedValueOnce([]) // rebucket candidate scan — nothing to move
        .mockResolvedValueOnce(cs(["c1", "c2"])); // orderedTurfContactIds read inside the rebuild
      prisma.contact.count.mockResolvedValue(2);

      await service.rebucketTurf("org1", "t1");

      expect(prisma.walkList.create.mock.calls[0][0].data).toMatchObject({ id: "wl_turf_t1", turfId: "t1" });
      expect(createdContactIds()).toEqual(["c1", "c2"]);
    });

    it("does not build a walk list when the turf has no addresses", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "Empty", tenantId: "org1", campaignId: null });
      geo.addresses.mockResolvedValue([]);
      prisma.walkList.findFirst.mockResolvedValue(null);
      prisma.contact.findMany.mockResolvedValue([]); // no bucketed contacts
      prisma.contact.count.mockResolvedValue(0);

      await service.loadUniverseIntoTurf("org1", "t1", { universe: "none" });

      expect(prisma.walkList.create).not.toHaveBeenCalled();
    });

    // The regression the review caught: a turf is populated in TWO steps (e.g. cold doors, then
    // rebucketed voters). The second step must ADD its doors to the existing wl_turf list, never drop them.
    it("reconcile: ADDS a second population step's new contact to an existing list, preserving the rest", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "T", tenantId: "org1", campaignId: "camp1" });
      prisma.contact.findMany.mockResolvedValue(cs(["c1", "c2", "c3"])); // c3 newly bucketed by step 2
      prisma.walkList.findFirst.mockResolvedValue({
        id: "wl_turf_t1",
        items: [
          { id: "i1", contactId: "c1" },
          { id: "i2", contactId: "c2" },
        ], // list built by step 1
      });

      const res = await service.rebuildTurfWalkList("org1", "t1");

      const added = (prisma.walkListItem.createMany.mock.calls[0]?.[0]?.data ?? []).map((r: any) => r.contactId);
      expect(added).toEqual(["c3"]); // the second step's door is added
      expect(prisma.walkListItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.walkList.create).not.toHaveBeenCalled(); // reconciled in place, not re-created
      expect(res).toMatchObject({ items: 3, added: 1, removed: 0 });
    });

    it("reconcile: REMOVES an item whose contact left the turf, keeping the rest", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "T", tenantId: "org1", campaignId: null });
      prisma.contact.findMany.mockResolvedValue(cs(["c1"])); // only c1 remains in the turf
      prisma.walkList.findFirst.mockResolvedValue({
        id: "wl_turf_t1",
        items: [
          { id: "i1", contactId: "c1" },
          { id: "i2", contactId: "c2" },
        ],
      });

      const res = await service.rebuildTurfWalkList("org1", "t1");

      expect(prisma.walkListItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["i2"] } } });
      expect(res).toMatchObject({ items: 1, added: 0, removed: 1 });
    });

    it("rebuildWalkLists isolates a failing turf so the batch keeps going", async () => {
      prisma.turf.findFirst
        .mockResolvedValueOnce({ id: "t1", name: "T", tenantId: "org1", campaignId: null })
        .mockResolvedValueOnce(null); // t2 not found → per-turf error, not a batch failure
      prisma.walkList.findFirst.mockResolvedValue(null);
      prisma.contact.findMany.mockResolvedValue(cs(["c1"]));

      const { results } = await service.rebuildWalkLists("org1", ["t1", "t2"]);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ turfId: "t1", items: 1 });
      expect(results[1]).toMatchObject({ turfId: "t2" });
      expect(results[1].error).toBeDefined();
    });

    // The residual M2 the re-review caught: a turf that already has a list with a NON-deterministic
    // (cuid) id — e.g. the seed's "Demo walk list" — must be reconciled, never duplicated.
    it("reuses a turf's existing non-wl_turf list instead of creating a second (M2 guard)", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "T", tenantId: "org1", campaignId: null });
      prisma.contact.findMany.mockResolvedValue(cs(["c1", "c2"]));
      prisma.walkList.findFirst.mockResolvedValue({
        id: "cuid_demo_list", // a legacy/seed list, NOT wl_turf_t1
        items: [
          { id: "i1", contactId: "c1" },
          { id: "i2", contactId: "c2" },
        ],
      });

      const res = await service.rebuildTurfWalkList("org1", "t1");

      expect(prisma.walkList.create).not.toHaveBeenCalled(); // no second parallel list
      expect(res.walkListId).toBe("cuid_demo_list"); // reconciled the turf's existing list in place
    });

    it("recovers from a concurrent create (P2002) by reconciling the race winner's list, not 500ing", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "T", tenantId: "org1", campaignId: null });
      prisma.contact.findMany.mockResolvedValue(cs(["c1", "c2"]));
      prisma.walkList.findFirst
        .mockResolvedValueOnce(null) // first look — no list yet, take the create branch
        .mockResolvedValueOnce({ id: "wl_turf_t1", items: [{ id: "i1", contactId: "c1" }] }); // racer's list
      prisma.walkList.create.mockRejectedValueOnce(p2002());

      const res = await service.rebuildTurfWalkList("org1", "t1");

      expect(res.walkListId).toBe("wl_turf_t1"); // reconciled instead of throwing
      const added = (prisma.walkListItem.createMany.mock.calls[0]?.[0]?.data ?? []).map((r: any) => r.contactId);
      expect(added).toContain("c2"); // the missing door was added during recovery
    });
  });

  describe("deleteWalkList", () => {
    it("deletes a tenant's walk list (items cascade) and returns { deleted: true }", async () => {
      prisma.walkList.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.deleteWalkList("org1", "wl1");
      expect(prisma.walkList.deleteMany).toHaveBeenCalledWith({ where: { id: "wl1", tenantId: "org1" } });
      expect(res).toEqual({ deleted: true });
    });

    it("throws WALK_LIST_NOT_FOUND when nothing matches the tenant + id", async () => {
      prisma.walkList.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteWalkList("org1", "ghost")).rejects.toMatchObject({
        response: { error: { code: "WALK_LIST_NOT_FOUND" } },
      });
    });
  });

  describe("recordDoorKnock", () => {
    const baseInput = {
      contactId: "c1",
      volunteerId: "u1",
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

    it("rejects when the contact's turf is locked to another volunteer", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1" });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "another" });

      await expect(service.recordDoorKnock("org1", baseInput)).rejects.toThrow();
      expect(prisma.doorKnock.create).not.toHaveBeenCalled();
    });

    it("records the knock and the disposition through the engagement layer", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1" });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });

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

    it("passes verbal_door consent to the disposition when the flag is true (APP 5)", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1", turf: { campaignId: "camp1" } });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });

      await service.recordDoorKnock("org1", {
        ...baseInput,
        dispositionCode: "spoke_to_target",
        consent: true,
      });

      expect(engagement.recordDisposition).toHaveBeenCalledWith(
        "org1",
        expect.objectContaining({ code: "spoke_to_target", consentMethod: "verbal_door" }),
      );
    });

    it("records no consent when the flag is absent or false (affirmative-only)", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1", turf: { campaignId: "camp1" } });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });

      await service.recordDoorKnock("org1", { ...baseInput, consent: false });

      expect(engagement.recordDisposition).toHaveBeenCalledWith(
        "org1",
        expect.objectContaining({ consentMethod: null }),
      );
    });

    it("persists each survey answer through the engagement layer with the campaign id", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      // One mock satisfies both the lock check (.turfId) and the campaign resolve (.turf.campaignId).
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1", turf: { campaignId: "camp1" } });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });

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
      const prevStore = process.env.BLOB_STORE_ID;
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      await expect(
        service.uploadDoorPhoto({ buffer: Buffer.from("x"), originalname: "a.jpg", mimetype: "image/jpeg" }),
      ).rejects.toThrow();
      if (prev !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prev;
      if (prevStore !== undefined) process.env.BLOB_STORE_ID = prevStore;
    });
  });

  describe("createDoorContact", () => {
    it("creates a contact in the turf when the volunteer holds the lock", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });
      const c = await service.createDoorContact("org1", {
        volunteerId: "u1",
        turfId: "t1",
        firstName: "Sam",
      });
      expect(prisma.contact.create).toHaveBeenCalled();
      expect(c.id).toBe("c_new");
    });

    it("rejects when the turf is not assigned to the volunteer", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "other" });
      await expect(
        service.createDoorContact("org1", { volunteerId: "u1", turfId: "t1", firstName: "Sam" }),
      ).rejects.toThrow();
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });
  });

  describe("qaReview", () => {
    it("flags no-GPS and too-fast knocks", async () => {
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }]);
      const base = new Date("2026-06-17T10:00:00Z").getTime();
      prisma.doorKnock.findMany.mockResolvedValue([
        { id: "k1", volunteerId: "u1", lat: null, lng: null, createdAt: new Date(base), volunteer: { displayName: "Ada" } },
        { id: "k2", volunteerId: "u1", lat: 1, lng: 1, createdAt: new Date(base + 5000), volunteer: { displayName: "Ada" } },
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

    it("reviews tenant-wide when no campaign id (no campaignId filter)", async () => {
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }]);
      prisma.doorKnock.findMany.mockResolvedValue([]);
      prisma.qaFlagResolution.findMany.mockResolvedValue([]);
      await service.qaReview("org1");
      // Turfs + resolutions are tenant-scoped only, with no campaignId narrowing.
      expect(prisma.turf.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1" } }),
      );
      expect(prisma.qaFlagResolution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1" } }),
      );
    });

    it("annotates flags that have a resolution", async () => {
      prisma.turf.findMany.mockResolvedValue([{ id: "t1" }]);
      const base = new Date("2026-06-17T10:00:00Z").getTime();
      prisma.doorKnock.findMany.mockResolvedValue([
        { id: "k1", volunteerId: "u1", lat: null, lng: null, createdAt: new Date(base), volunteer: { displayName: "Ada" } },
      ]);
      prisma.qaFlagResolution.findMany.mockResolvedValue([
        { doorKnockId: "k1", kind: "NO_GPS", state: "RESOLVED" },
      ]);
      const { flags } = await service.qaReview("org1", "c1");
      const gps = flags.find((f) => f.kind === "NO_GPS");
      expect(gps?.resolved).toBe(true);
      expect(gps?.state).toBe("RESOLVED");
    });

    it("records and clears a flag resolution", async () => {
      await service.setQaFlagResolution("org1", "c1", { doorKnockId: "k1", kind: "NO_GPS", state: "DISMISSED" });
      expect(prisma.qaFlagResolution.upsert).toHaveBeenCalled();
      const cleared = await service.setQaFlagResolution("org1", "c1", { doorKnockId: "k1", kind: "NO_GPS", resolved: false });
      expect(prisma.qaFlagResolution.deleteMany).toHaveBeenCalled();
      expect(cleared).toEqual({ resolved: false });
    });
  });

  describe("createVolunteer", () => {
    it("hashes the password and defaults to VOLUNTEER", async () => {
      const user = await service.createVolunteer("org1", {
        displayName: "Ada",
        email: "Ada@Example.com",
        password: "supersecret",
      });
      const userArg = prisma.user.create.mock.calls[0][0].data;
      expect(userArg.passwordHash).toBeTruthy();
      expect(userArg.passwordHash).not.toBe("supersecret"); // hashed, not plaintext
      expect(userArg.email).toBe("ada@example.com"); // normalised
      const memberArg = prisma.tenantMember.create.mock.calls[0][0].data;
      expect(memberArg.tenantId).toBe("org1");
      expect(memberArg.role).toBe("VOLUNTEER"); // default role on the membership
      expect(user.id).toBe("u1");
      expect(user.role).toBe("VOLUNTEER");
    });

    it("maps a duplicate email to EMAIL_TAKEN", async () => {
      prisma.user.create.mockRejectedValue(p2002());
      await expect(
        service.createVolunteer("org1", { displayName: "Ada", email: "a@b.c", password: "supersecret" }),
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
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1", geometry: square });
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
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      prisma.contact.count.mockResolvedValue(7);

      const res = await service.loadUniverseIntoTurf("org1", "t1", { universe: "existing" });

      expect(geo.addresses).not.toHaveBeenCalled();
      expect(prisma.contact.createMany).toBeUndefined();
      expect(res).toEqual({ materialised: 0, total: 7 });
    });

    it("materialises cold doors as contacts with gnafPid + coldDoor metadata", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
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
        tenantId: "org1",
        turfId: "t1",
        gnafPid: "GA1",
        metadata: { coldDoor: true },
      });
      expect(res).toEqual({ materialised: 2, total: 2 });
    });

    it("skips gnafPids already on a contact (idempotent re-run)", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
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
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
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
                volunteerId: "u1",
                assignedAt: new Date(),
                lockedUntil: null,
                volunteer: { id: "u1", displayName: "Ada" },
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

  describe("updateWalkList", () => {
    it("updates name + listType for an owned list", async () => {
      prisma.walkList.findFirst.mockResolvedValue({ id: "w1", tenantId: "org1" });
      await service.updateWalkList("org1", "w1", { name: "Renamed", listType: "DYNAMIC" as any });
      expect(prisma.walkList.update).toHaveBeenCalledWith({
        where: { id: "w1" },
        data: { name: "Renamed", listType: "DYNAMIC" },
      });
    });

    it("throws for an unknown walk list", async () => {
      prisma.walkList.findFirst.mockResolvedValue(null);
      await expect(service.updateWalkList("org1", "missing", { name: "x" })).rejects.toThrow();
    });
  });

  describe("updateShift", () => {
    it("updates fields + coerces dates", async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: "s1", tenantId: "org1" });
      await service.updateShift("org1", "s1", { name: "AM", startsAt: "2026-07-01T09:00:00Z" });
      const arg = prisma.shift.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: "s1" });
      expect(arg.data.name).toBe("AM");
      expect(arg.data.startsAt).toBeInstanceOf(Date);
    });

    it("throws for an unknown shift", async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.updateShift("org1", "missing", { name: "x" })).rejects.toThrow();
    });
  });

  describe("updateVolunteer", () => {
    it("renames + re-hashes the password when provided", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      await service.updateVolunteer("org1", "u1", { displayName: "Ada B", password: "supersecret" });
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.data.displayName).toBe("Ada B");
      expect(arg.data.passwordHash).toBeTruthy();
      expect(arg.data.passwordHash).not.toBe("supersecret");
    });

    it("does not set passwordHash when no password given", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      await service.updateVolunteer("org1", "u1", { displayName: "Ada" });
      expect(prisma.user.update.mock.calls[0][0].data.passwordHash).toBeUndefined();
    });

    it("sets the mobile number (trimmed), and clears it with an empty string", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      await service.updateVolunteer("org1", "u1", { mobile: "  +61412345678 " });
      expect(prisma.user.update.mock.calls[0][0].data.mobile).toBe("+61412345678");
      prisma.user.update.mockClear();
      await service.updateVolunteer("org1", "u1", { mobile: "" });
      expect(prisma.user.update.mock.calls[0][0].data.mobile).toBeNull();
    });

    it("throws for an unknown user", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue(null);
      await expect(service.updateVolunteer("org1", "missing", { displayName: "x" })).rejects.toThrow();
    });

    it("updates only the role (no user fields) and returns the new role", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      const res = await service.updateVolunteer("org1", "u1", { role: AppUserRole.ORGANISER });
      // No displayName/password → the user row is read, not written.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalled();
      expect(prisma.tenantMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: AppUserRole.ORGANISER } }),
      );
      expect(res.role).toBe(AppUserRole.ORGANISER);
    });

    it("maps a P2025 (record not found) to USER_NOT_FOUND", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      prisma.user.update.mockRejectedValue(p2025());
      await expect(service.updateVolunteer("org1", "u1", { displayName: "Ada B" })).rejects.toThrow();
    });

    it("rethrows a non-P2025 error", async () => {
      prisma.tenantMember.findFirst.mockResolvedValue({ tenantId: "org1", userId: "u1", role: "VOLUNTEER" });
      prisma.user.update.mockRejectedValue(new Error("db down"));
      await expect(service.updateVolunteer("org1", "u1", { displayName: "Ada B" })).rejects.toThrow("db down");
    });
  });

  describe("assignTurf (rethrow)", () => {
    it("rethrows a non-P2002 create error", async () => {
      prisma.turfAssignment.create.mockRejectedValue(new Error("db down"));
      await expect(service.assignTurf("org1", "t1", "u1")).rejects.toThrow("db down");
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.assignTurf("org1", "missing", "u1")).rejects.toThrow();
    });
  });

  describe("createVolunteer (rethrow)", () => {
    it("rethrows a non-P2002 error", async () => {
      prisma.user.create.mockRejectedValue(new Error("boom"));
      await expect(
        service.createVolunteer("org1", { displayName: "Ada", email: "a@b.c", password: "supersecret" }),
      ).rejects.toThrow("boom");
    });

    it("honours an explicit role", async () => {
      const user = await service.createVolunteer("org1", {
        displayName: "Org",
        email: "org@x.com",
        password: "supersecret",
        role: AppUserRole.ORGANISER,
      });
      expect(prisma.tenantMember.create.mock.calls[0][0].data.role).toBe(AppUserRole.ORGANISER);
      expect(user.role).toBe(AppUserRole.ORGANISER);
    });
  });

  describe("listAssignments", () => {
    const square = {
      type: "Polygon",
      coordinates: [
        [
          [144.9, -37.8],
          [144.9, -37.7],
          [145.0, -37.7],
          [145.0, -37.8],
          [144.9, -37.8],
        ],
      ],
    };

    it("maps each locked turf to bbox + geometry + self-claim flag + walk-list counts (counts, not items)", async () => {
      prisma.turfAssignment.findMany.mockResolvedValue([
        {
          turfId: "t1",
          lockedUntil: null,
          turf: {
            id: "t1",
            name: "Turf 1",
            geometry: square,
            campaignId: "c1",
            campaign: { volunteerCanSelfClaimTurf: true },
            estimate: { doorsPerHour: 30 },
            walkLists: [
              {
                id: "w1",
                name: "Walk 1",
                items: [{ status: "PENDING" }, { status: "VISITED" }, { status: "SKIPPED" }],
              },
            ],
          },
        },
      ]);
      prisma.shift.findMany.mockResolvedValue([{ campaignId: "c1" }]); // campaign c1 has shifts
      const res = await service.listAssignments("org1", "u1");
      expect(res).toEqual([
        {
          turfId: "t1",
          lockedUntil: null,
          turf: {
            id: "t1",
            name: "Turf 1",
            campaignId: "c1",
            bbox: [144.9, -37.8, 145.0, -37.7],
            // The boundary geometry IS shipped now — the homepage card draws the real turf outline.
            geometry: square,
            canSelfClaim: true,
            // Campaign c1 has shifts → the "Pick a shift" link shows.
            hasShifts: true,
            // Density estimate → the card's "time remaining" from the pending door count.
            doorsPerHour: 30,
          },
          walkLists: [{ id: "w1", name: "Walk 1", total: 3, pending: 1, visited: 1 }],
        },
      ]);
      // Walk lists still ship COUNTS, not their items.
      expect(res[0].walkLists[0]).not.toHaveProperty("items");
    });

    it("defaults canSelfClaim to false when the turf has no campaign", async () => {
      prisma.turfAssignment.findMany.mockResolvedValue([
        {
          turfId: "t1",
          lockedUntil: null,
          turf: {
            id: "t1",
            name: "Turf 1",
            geometry: square,
            campaignId: null,
            walkLists: [{ id: "w1", name: "Walk 1", items: [{ status: "PENDING" }] }],
          },
        },
      ]);
      const res = await service.listAssignments("org1", "u1");
      expect(res[0].turf.canSelfClaim).toBe(false);
    });

    it("materialises a walk-list from the turf's contacts when an assigned turf has none", async () => {
      const bare = {
        turfId: "t1",
        lockedUntil: null,
        turf: { id: "t1", name: "Turf 1", tenantId: "org1", geometry: {}, campaignId: "c1", walkLists: [] },
      };
      const healed = {
        ...bare,
        turf: {
          ...bare.turf,
          walkLists: [{ id: "wl_turf_t1", name: "Turf 1", items: [{ status: "PENDING" }, { status: "PENDING" }] }],
        },
      };
      prisma.turfAssignment.findMany.mockResolvedValueOnce([bare]).mockResolvedValueOnce([healed]);
      prisma.contact.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);

      const res = await service.listAssignments("org1", "u1");

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1", turfId: "t1" } }),
      );
      expect(prisma.walkList.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: "wl_turf_t1",
            turfId: "t1",
            items: { create: [{ contactId: "c1", orderIndex: 0 }, { contactId: "c2", orderIndex: 1 }] },
          }),
        }),
      );
      expect(res[0].walkLists[0]).toEqual({ id: "wl_turf_t1", name: "Turf 1", total: 2, pending: 2, visited: 0 });
    });

    it("does not build a walk-list for a turf with no contacts", async () => {
      prisma.turfAssignment.findMany.mockResolvedValue([
        { turfId: "t1", lockedUntil: null, turf: { id: "t1", name: "T", tenantId: "org1", geometry: {}, campaignId: null, walkLists: [] } },
      ]);
      prisma.contact.findMany.mockResolvedValue([]);
      await service.listAssignments("org1", "u1");
      expect(prisma.walkList.create).not.toHaveBeenCalled();
    });

    it("tolerates a concurrent generate — deterministic id makes it a PK conflict, not a duplicate", async () => {
      prisma.turfAssignment.findMany.mockResolvedValue([
        { turfId: "t1", lockedUntil: null, turf: { id: "t1", name: "T", tenantId: "org1", geometry: {}, campaignId: null, walkLists: [] } },
      ]);
      prisma.contact.findMany.mockResolvedValue([{ id: "c1" }]);
      prisma.walkList.create.mockRejectedValueOnce(p2002());
      await expect(service.listAssignments("org1", "u1")).resolves.toBeDefined();
    });
  });

  describe("getAssignment", () => {
    const items = [
      { id: "i1", orderIndex: 0, status: "PENDING", contact: { id: "c1", address: "1 Test St" } },
    ];

    it("returns the ONE turf in full — geometry + walk-list items", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({
        turfId: "t1",
        lockedUntil: null,
        turf: {
          id: "t1",
          name: "Turf 1",
          geometry: { type: "Polygon" },
          campaignId: "c1",
          walkLists: [{ id: "w1", name: "Walk 1", items }],
        },
      });
      const res = await service.getAssignment("org1", "t1", "u1");
      expect(prisma.turfAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { turfId: "t1", volunteerId: "u1", status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId: "org1" } },
        }),
      );
      expect(res.turf).toEqual({ id: "t1", name: "Turf 1", geometry: { type: "Polygon" }, campaignId: "c1" });
      expect(res.walkLists[0].items).toEqual(items);
    });

    it("throws TURF_NOT_ASSIGNED when the turf isn't locked to this volunteer", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue(null);
      await expect(service.getAssignment("org1", "t1", "u1")).rejects.toThrow();
    });

    it("self-heals a missing walk list, then reloads", async () => {
      const bare = {
        turfId: "t1",
        lockedUntil: null,
        turf: { id: "t1", name: "Turf 1", geometry: {}, campaignId: "c1", walkLists: [] },
      };
      const healed = {
        ...bare,
        turf: { ...bare.turf, walkLists: [{ id: "wl_turf_t1", name: "Turf 1", items }] },
      };
      prisma.turfAssignment.findFirst.mockResolvedValueOnce(bare).mockResolvedValueOnce(healed);
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", name: "Turf 1", tenantId: "org1", campaignId: "c1" });
      prisma.contact.findMany.mockResolvedValue([{ id: "c1" }]);
      prisma.walkList.findFirst.mockResolvedValue(null);

      const res = await service.getAssignment("org1", "t1", "u1");

      expect(prisma.walkList.create).toHaveBeenCalled();
      expect(res.walkLists[0].items).toHaveLength(1);
    });
  });

  describe("getVolunteerMetrics", () => {
    it("tallies doors, conversations, distinct surveyed residents and persuasion IDs", async () => {
      prisma.doorKnock.count
        .mockResolvedValueOnce(3) // doorsToday
        .mockResolvedValueOnce(30) // doorsTotal
        .mockResolvedValueOnce(1) // conversationsToday
        .mockResolvedValueOnce(12); // conversationsTotal
      prisma.questionResponse.groupBy
        .mockResolvedValueOnce([{ contactId: "a" }]) // surveysToday → 1 distinct
        .mockResolvedValueOnce([{ contactId: "a" }, { contactId: "b" }]); // surveysTotal → 2 distinct
      prisma.disposition.groupBy
        .mockResolvedValueOnce([{ contactId: "a" }, { contactId: "b" }]) // persuasionToday → 2 distinct
        .mockResolvedValueOnce([{ contactId: "a" }, { contactId: "b" }, { contactId: "c" }]); // persuasionTotal → 3

      const res = await service.getVolunteerMetrics("org1", "u1");
      expect(res).toEqual({
        doorsToday: 3,
        doorsTotal: 30,
        conversationsToday: 1,
        conversationsTotal: 12,
        surveysToday: 1,
        surveysTotal: 2,
        persuasionToday: 2,
        persuasionTotal: 3,
      });
      expect(prisma.doorKnock.count).toHaveBeenCalledTimes(4);
      expect(prisma.questionResponse.groupBy).toHaveBeenCalledTimes(2);
      expect(prisma.disposition.groupBy).toHaveBeenCalledTimes(2);
    });
  });

  describe("uploadDoorPhoto (happy path)", () => {
    it("puts the buffer to blob storage and returns the public URL", async () => {
      const prev = process.env.BLOB_READ_WRITE_TOKEN;
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_tok";
      try {
        const res = await service.uploadDoorPhoto({
          buffer: Buffer.from("img"),
          originalname: "photo.PNG",
          mimetype: "image/png",
        });
        expect(put).toHaveBeenCalledTimes(1);
        const [key, buf, opts] = put.mock.calls[0];
        expect(key).toContain("door-knocks/");
        expect(key).toMatch(/\.png$/); // extension lower-cased + sanitised
        expect(buf).toBeInstanceOf(Buffer);
        expect(opts).toMatchObject({ access: "public", contentType: "image/png", token: "vercel_blob_tok" });
        expect(res).toEqual({ url: "https://blob.example/door-knocks/x.jpg" });
      } finally {
        if (prev === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
        else process.env.BLOB_READ_WRITE_TOKEN = prev;
      }
    });
  });

  describe("recordDoorKnock (survey answer resilience)", () => {
    it("logs and continues when one survey answer fails, still returning the knock", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue({ turfId: "t1", turf: { campaignId: "camp1" } });
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });
      engagement.recordSurveyAnswer
        .mockRejectedValueOnce(new Error("FK violation")) // first answer blows up
        .mockResolvedValueOnce({ id: "qr2" }); // second succeeds

      const knock = await service.recordDoorKnock("org1", {
        contactId: "c1",
        volunteerId: "u1",
        localId: "local-x",
        dispositionCode: "spoke_to_target",
        surveyAnswers: [
          { questionId: "q1", optionId: "o1" },
          { questionId: "q2", valueText: "yes" },
        ],
      });

      expect(engagement.recordSurveyAnswer).toHaveBeenCalledTimes(2);
      expect(knock.id).toBe("dk1"); // the knock still committed
    });

    it("throws CONTACT_NOT_FOUND when the contact does not exist", async () => {
      prisma.doorKnock.findUnique.mockResolvedValue(null);
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(
        service.recordDoorKnock("org1", { contactId: "missing", volunteerId: "u1", localId: "l1" }),
      ).rejects.toThrow();
      expect(prisma.doorKnock.create).not.toHaveBeenCalled();
    });
  });

  describe("listVolunteers", () => {
    it("returns [] when the org has no members", async () => {
      prisma.tenantMember.findMany = jest.fn().mockResolvedValue([]);
      const res = await service.listVolunteers("org1");
      expect(res).toEqual([]);
    });

    it("joins users to their membership role, defaulting to VOLUNTEER", async () => {
      prisma.tenantMember.findMany = jest.fn().mockResolvedValue([
        { userId: "u1", role: "ORGANISER" },
        { userId: "u2", role: "VOLUNTEER" },
      ]);
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { id: "u1", displayName: "Ada", email: "ada@x.com", mobile: "+61400000001" },
        { id: "u3", displayName: "Ghost", email: "ghost@x.com", mobile: null }, // no membership → default role
      ]);
      const res = await service.listVolunteers("org1");
      // mobile is surfaced for the click-to-call button (null for email-login volunteers).
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.objectContaining({ mobile: true }) }),
      );
      expect(res).toEqual([
        { id: "u1", displayName: "Ada", email: "ada@x.com", mobile: "+61400000001", role: "ORGANISER" },
        { id: "u3", displayName: "Ghost", email: "ghost@x.com", mobile: null, role: AppUserRole.VOLUNTEER },
      ]);
    });
  });

  describe("listTurfContacts", () => {
    it("returns the turf's contacts joined to the G-NAF address detail, tenant+turf scoped", async () => {
      const contacts = [
        { id: "c1", firstName: "A", lastName: "B", address: "96 Smith Street, Richmond VIC 3121", street: "Smith Street", locality: "Richmond", postcode: "3121", lat: 1, lng: 2 },
      ];
      prisma.$queryRaw.mockResolvedValue(contacts);
      const res = await service.listTurfContacts("org1", "t1");
      // Tagged-template call: params carry the tenant + turf; the SQL joins geo.gnaf_address.
      const [strings, tenantId, turfId] = prisma.$queryRaw.mock.calls[0];
      expect(strings.join("?")).toContain("geo.gnaf_address");
      expect(strings.join("?")).toContain('c."gnafPid"');
      // gnafPid is selected out (not just joined on) so the preview popover can fetch address detail.
      expect(strings.join("?")).toContain('c."gnafPid"   AS "gnafPid"');
      // Coords fall back to the G-NAF row so a cold door with no backfilled Contact.lat/lng
      // still gets a map pin.
      expect(strings.join("?")).toContain("COALESCE(c.lat, a.lat)");
      expect(strings.join("?")).toContain("COALESCE(c.lng, a.lng)");
      expect(tenantId).toBe("org1");
      expect(turfId).toBe("t1");
      expect(res).toBe(contacts);
    });
  });

  describe("turfRoute", () => {
    const threeContacts = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 0, lng: 0.001 },
      { id: "c", lat: 0, lng: 0.002 },
    ];

    it("uses real Mapbox legs when available, mapping each to its from/to stop", async () => {
      prisma.$queryRaw.mockResolvedValue(threeContacts);
      const line: GeoJSON.LineString = { type: "LineString", coordinates: [[0, 0], [0, 0.001], [0, 0.002]] };
      directions.routeLegsAndGeometry.mockResolvedValue({
        legs: [
          { distance: 100, duration: 80 },
          { distance: 120, duration: 96 },
        ],
        geometry: line,
        requests: 1,
      });
      const res = await service.turfRoute("org1", "t1");
      expect(res.source).toBe("directions");
      expect(res.ordered).toHaveLength(3);
      expect(res.legs).toHaveLength(2);
      expect(res.legs[0]).toMatchObject({ distanceM: 100, durationS: 80 });
      // from/to are consecutive located stop ids in the optimised order.
      expect(res.legs[0].fromId).toBe(res.ordered[0]);
      expect(res.legs[0].toId).toBe(res.ordered[1]);
      expect(res.totalM).toBe(220);
      expect(res.totalS).toBe(176);
      // The real street-following line is passed through for the map to draw.
      expect(res.geometry).toEqual(line);
    });

    it("falls back to straight-line legs (and no geometry) when directions are unavailable", async () => {
      prisma.$queryRaw.mockResolvedValue(threeContacts);
      directions.routeLegsAndGeometry.mockResolvedValue(null); // no server token
      const res = await service.turfRoute("org1", "t1");
      expect(res.source).toBe("crowflies");
      expect(res.legs).toHaveLength(2);
      expect(res.legs.every((l) => l.distanceM > 0 && l.durationS > 0)).toBe(true);
      expect(res.geometry).toBeNull();
    });

    it("gives no legs for a turf with fewer than two located stops", async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: "a", lat: null, lng: null }]);
      const res = await service.turfRoute("org1", "t1");
      expect(res.legs).toEqual([]);
      expect(res.ordered).toEqual(["a"]); // unlocated stop still listed, sorted to the end
      expect(directions.routeLegsAndGeometry).not.toHaveBeenCalled();
    });

    it("prepends the origin as the first Mapbox waypoint and folds the from-here leg into the totals", async () => {
      prisma.$queryRaw.mockResolvedValue(threeContacts);
      directions.routeLegsAndGeometry.mockResolvedValue({
        legs: [
          { distance: 50, duration: 40 }, // origin → first stop
          { distance: 100, duration: 80 },
          { distance: 120, duration: 96 },
        ],
        geometry: { type: "LineString", coordinates: [] },
        requests: 1,
      });
      const res = await service.turfRoute("org1", "t1", { lat: 0, lng: 0.0005 });
      const waypoints = directions.routeLegsAndGeometry.mock.calls[0][0];
      expect(waypoints).toHaveLength(4); // origin + 3 stops
      expect(waypoints[0]).toEqual({ lat: 0, lng: 0.0005 });
      expect(res.legs).toHaveLength(2); // stop-to-stop only (origin leg not surfaced as a leg)
      expect(res.totalM).toBe(270); // 50 + 100 + 120 — includes the from-here leg
      expect(res.totalS).toBe(216);
    });

    it("adds the from-here segment to the totals in the straight-line fallback when given an origin", async () => {
      prisma.$queryRaw.mockResolvedValue(threeContacts);
      directions.routeLegsAndGeometry.mockResolvedValue(null);
      const without = await service.turfRoute("org1", "t1");
      const withOrigin = await service.turfRoute("org1", "t1", { lat: 0, lng: -0.001 });
      expect(withOrigin.source).toBe("crowflies");
      expect(withOrigin.totalM).toBeGreaterThan(without.totalM);
    });
  });

  describe("walkRouteForVolunteer", () => {
    it("throws TURF_NOT_ASSIGNED when the turf isn't assigned to the volunteer", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "someone_else" });
      await expect(service.walkRouteForVolunteer("org1", "t1", "u1")).rejects.toThrow();
    });

    it("returns the origin-aware route when the turf is assigned to the volunteer", async () => {
      prisma.turfAssignment.findFirst.mockResolvedValue({ volunteerId: "u1" });
      prisma.$queryRaw.mockResolvedValue([
        { id: "a", lat: 0, lng: 0 },
        { id: "b", lat: 0, lng: 0.001 },
      ]);
      directions.routeLegsAndGeometry.mockResolvedValue(null);
      const res = await service.walkRouteForVolunteer("org1", "t1", "u1", { lat: 0, lng: 0 });
      expect(res.ordered).toHaveLength(2);
      expect(prisma.turfAssignment.findFirst).toHaveBeenCalled();
    });
  });

  describe("listTurfs", () => {
    it("summarises stop progress and the active assignee", async () => {
      prisma.turf.findMany.mockResolvedValue([
        {
          id: "t1",
          name: "Turf 1",
          campaignId: "c1",
          geometry: { type: "Polygon" },
          _count: { contacts: 12, walkLists: 2 },
          assignments: [{ volunteerId: "u1", volunteer: { displayName: "Ada" } }],
          walkLists: [
            { items: [{ status: "VISITED" }, { status: "PENDING" }] },
            { items: [{ status: "VISITED" }] },
          ],
        },
        {
          id: "t2",
          name: "Turf 2",
          campaignId: "c1",
          geometry: null,
          _count: { contacts: 0, walkLists: 0 },
          assignments: [],
          walkLists: [],
        },
      ]);
      const res = await service.listTurfs("org1", "c1");
      expect(res[0]).toMatchObject({
        id: "t1",
        contactCount: 12,
        walkListCount: 2,
        totalStops: 3,
        visitedStops: 2,
        assignedTo: { volunteerId: "u1", name: "Ada" },
      });
      expect(res[1].assignedTo).toBeNull();
      expect(res[1].totalStops).toBe(0);
    });
  });

  describe("createTurf + syncTurfGeom", () => {
    it("creates the row then mirrors the PostGIS geom", async () => {
      const geometry = { type: "Polygon", coordinates: [] };
      const turf = await service.createTurf("org1", { name: "New", geometry });
      expect(prisma.turf.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: "org1", name: "New" }) }),
      );
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1); // geom mirror
      expect(turf.id).toBe("turf_new");
    });

    it("syncTurfGeom is a no-op for empty geometry", async () => {
      await service.syncTurfGeom("t1", null);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it("syncTurfGeom swallows a bad-mirror error (geom is derived)", async () => {
      prisma.$executeRawUnsafe.mockRejectedValue(new Error("invalid geometry"));
      await expect(service.syncTurfGeom("t1", { type: "Polygon" })).resolves.toBeUndefined();
    });
  });

  describe("clipToCampaign", () => {
    const geometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

    it("returns the geometry unchanged when there is no campaign", async () => {
      const res = await service.clipToCampaign("org1", null, geometry);
      expect(res).toBe(geometry);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("returns the clipped GeoJSON when something is left", async () => {
      const clipped = { type: "MultiPolygon", coordinates: [] };
      prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: JSON.stringify(clipped), empty: false }]);
      const res = await service.clipToCampaign("org1", "camp1", geometry);
      expect(res).toEqual(clipped);
    });

    it("returns null when the clip is empty", async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: null, empty: true }]);
      const res = await service.clipToCampaign("org1", "camp1", geometry);
      expect(res).toBeNull();
    });

    it("returns null when the clip query yields no rows", async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      const res = await service.clipToCampaign("org1", "camp1", geometry);
      expect(res).toBeNull();
    });
  });

  describe("createTurfFromDivision", () => {
    const square = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

    it("cuts a turf from a division boundary (no campaign → no clip query)", async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ name: "Div A", geojson: JSON.stringify(square) }]);
      const turf = await service.createTurfFromDivision("org1", { type: "ced", code: "C1" });
      expect(prisma.turf.create).toHaveBeenCalled();
      expect(turf.id).toBe("turf_new");
    });

    it("throws DIVISION_NOT_FOUND when the boundary is missing", async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(service.createTurfFromDivision("org1", { type: "lga", code: "X" })).rejects.toThrow();
    });

    it("throws OUTSIDE_BOUNDARY when the clip against the campaign is empty", async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ name: "Div A", geojson: JSON.stringify(square) }]) // division lookup
        .mockResolvedValueOnce([{ geojson: null, empty: true }]); // clipToCampaign → null
      await expect(
        service.createTurfFromDivision("org1", { type: "sed", code: "C2", campaignId: "camp1" }),
      ).rejects.toThrow();
    });

    it("materialises the cold-door universe when requested", async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ name: "Div A", geojson: JSON.stringify(square) }]);
      prisma.contact.count.mockResolvedValue(0);
      const spy = jest.spyOn(service, "loadUniverseIntoTurf").mockResolvedValue({ materialised: 0, total: 0 });
      await service.createTurfFromDivision("org1", { type: "ced", code: "C1", universe: "hybrid" });
      expect(spy).toHaveBeenCalledWith("org1", "turf_new", { universe: "hybrid" });
      spy.mockRestore();
    });

    // The table map is shared with GeoService, so a new chamber layer becomes cuttable
    // without a second copy of the ced/sed/lga mapping drifting out of sync here.
    it.each([
      ["sed_lower", "geo.sed_lower"],
      ["sed_upper", "geo.sed_upper"],
      ["ward", "geo.ward"],
    ] as const)("cuts a turf from a %s division", async (type, table) => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ name: "Southern Metropolitan", geojson: JSON.stringify(square) }]);
      await service.createTurfFromDivision("org1", { type, code: "X1" });
      expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain(table);
      expect(prisma.turf.create).toHaveBeenCalled();
    });
  });

  describe("createTurfFromAreas", () => {
    const square = { type: "Polygon", coordinates: [] };

    it("throws EMPTY_SELECTION when nothing resolves from the geo union", async () => {
      geo.unionAreas.mockResolvedValue(null);
      await expect(
        service.createTurfFromAreas("org1", { name: "T", areas: [{ layer: "sa1", code: "A" }] }),
      ).rejects.toThrow();
    });

    it("cuts a turf from the unioned areas", async () => {
      geo.unionAreas.mockResolvedValue(square);
      const turf = await service.createTurfFromAreas("org1", {
        name: "T",
        areas: [{ layer: "sa1", code: "A" }],
      });
      expect(geo.unionAreas).toHaveBeenCalledWith([{ layer: "sa1", code: "A" }], []);
      expect(prisma.turf.create).toHaveBeenCalled();
      expect(turf.id).toBe("turf_new");
    });

    it("throws OUTSIDE_BOUNDARY when the campaign clip is empty", async () => {
      geo.unionAreas.mockResolvedValue(square);
      prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: null, empty: true }]);
      await expect(
        service.createTurfFromAreas("org1", {
          name: "T",
          campaignId: "camp1",
          areas: [{ layer: "sa1", code: "A" }],
        }),
      ).rejects.toThrow();
    });

    it("materialises the cold-door universe when requested", async () => {
      geo.unionAreas.mockResolvedValue(square);
      const spy = jest.spyOn(service, "loadUniverseIntoTurf").mockResolvedValue({ materialised: 0, total: 0 });
      await service.createTurfFromAreas("org1", {
        name: "T",
        areas: [{ layer: "sa1", code: "A" }],
        universe: "none",
      });
      expect(spy).toHaveBeenCalledWith("org1", "turf_new", { universe: "none" });
      spy.mockRestore();
    });
  });

  describe("createTurfFromSources", () => {
    const square = { type: "Polygon", coordinates: [] };

    it("throws EMPTY_SELECTION when no sources and no addresses are given", async () => {
      await expect(service.createTurfFromSources("org1", { name: "T" })).rejects.toThrow();
      expect(geo.unionSources).not.toHaveBeenCalled();
    });

    it("throws EMPTY_SELECTION when the union resolves to nothing", async () => {
      geo.unionSources.mockResolvedValue(null);
      await expect(
        service.createTurfFromSources("org1", { name: "T", gnafPids: ["GA1"] }),
      ).rejects.toThrow();
    });

    it("unions divisions, areas, polygons and G-NAF pids into one turf", async () => {
      geo.unionSources.mockResolvedValue(square);
      const turf = await service.createTurfFromSources("org1", {
        name: "T",
        divisions: [{ type: "ced", code: "C" }],
        areas: [{ layer: "sa2", code: "A" }],
        polygons: [{ type: "Polygon" }],
        gnafPids: ["GA1", ""], // falsy pids are filtered
      });
      const [sources, pids] = geo.unionSources.mock.calls[0];
      expect(sources).toEqual([
        { kind: "division", type: "ced", code: "C" },
        { kind: "area", layer: "sa2", code: "A" },
        { kind: "polygon", geometry: { type: "Polygon" } },
      ]);
      expect(pids).toEqual(["GA1"]);
      expect(turf.id).toBe("turf_new");
    });

    it("throws OUTSIDE_BOUNDARY when the campaign clip is empty", async () => {
      geo.unionSources.mockResolvedValue(square);
      prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: null, empty: true }]);
      await expect(
        service.createTurfFromSources("org1", { name: "T", campaignId: "camp1", gnafPids: ["GA1"] }),
      ).rejects.toThrow();
    });

    it("materialises the cold-door universe when requested", async () => {
      geo.unionSources.mockResolvedValue(square);
      const spy = jest.spyOn(service, "loadUniverseIntoTurf").mockResolvedValue({ materialised: 0, total: 0 });
      await service.createTurfFromSources("org1", { name: "T", gnafPids: ["GA1"], universe: "hybrid" });
      expect(spy).toHaveBeenCalledWith("org1", "turf_new", { universe: "hybrid" });
      spy.mockRestore();
    });
  });

  describe("self-serve turf claiming", () => {
    const campaign = {
      id: "camp1",
      boundary: { type: "Polygon" },
      volunteerCanSelfClaimTurf: true,
      selfClaimModes: null,
    };
    const square = { type: "Polygon", coordinates: [] };

    describe("selfServeAvailable", () => {
      it("returns the boundary, modes and ready turfs (bbox + counts, no geometry)", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        prisma.turf.findMany.mockResolvedValue([
          {
            id: "t1",
            name: "Ready",
            geometry: { type: "Polygon", coordinates: [[[144.9, -37.8], [145.0, -37.7], [144.9, -37.8]]] },
            _count: { contacts: 4 },
          },
          { id: "t2", name: "Unmapped", geometry: null, _count: { contacts: 2 } },
        ]);
        const res = await service.selfServeAvailable("org1", "camp1");
        expect(res.boundary).toEqual(campaign.boundary); // the map still draws the campaign boundary
        expect(res.modes).toEqual(["area", "draw", "existing"]); // default when unset
        expect(res.readyTurfs).toEqual([
          { id: "t1", name: "Ready", bbox: [144.9, -37.8, 145.0, -37.7], contactCount: 4 },
          { id: "t2", name: "Unmapped", bbox: null, contactCount: 2 },
        ]);
      });

      it("throws CAMPAIGN_NOT_FOUND when the campaign is missing", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(null);
        await expect(service.selfServeAvailable("org1", "missing")).rejects.toThrow();
      });

      it("throws SELF_CLAIM_DISABLED when self-serve is off", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue({ ...campaign, volunteerCanSelfClaimTurf: false });
        await expect(service.selfServeAvailable("org1", "camp1")).rejects.toThrow();
      });
    });

    describe("claimAreaSelfServe", () => {
      it("throws SELF_CLAIM_DISABLED when the area mode is not allowed", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue({ ...campaign, selfClaimModes: ["draw"] });
        await expect(
          service.claimAreaSelfServe("org1", "camp1", "u1", [{ layer: "sa1", code: "A" }]),
        ).rejects.toThrow();
      });

      it("throws EMPTY_SELECTION when the geo union is empty", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        geo.unionAreas.mockResolvedValue(null);
        await expect(service.claimAreaSelfServe("org1", "camp1", "u1", [])).rejects.toThrow();
      });

      it("clips, creates and assigns the turf inside a campaign lock", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        geo.unionAreas.mockResolvedValue(square);
        prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: JSON.stringify(square), empty: false }]);
        prisma.turfAssignment.create.mockResolvedValue({ id: "a1" });
        prisma.contact.count.mockResolvedValue(0);

        const turf = await service.claimAreaSelfServe("org1", "camp1", "u1", [{ layer: "sa1", code: "A" }]);

        // advisory lock + geom mirror both go through $executeRawUnsafe.
        expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
        expect(prisma.turf.create).toHaveBeenCalled();
        expect(prisma.turfAssignment.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ volunteerId: "u1", status: TurfAssignmentStatus.ASSIGNED }) }),
        );
        expect(turf.id).toBe("turf_new");
      });

      it("throws AREA_ALREADY_CLAIMED when the clip inside the lock is empty", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        geo.unionAreas.mockResolvedValue(square);
        prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: null, empty: true }]);
        await expect(
          service.claimAreaSelfServe("org1", "camp1", "u1", [{ layer: "sa1", code: "A" }]),
        ).rejects.toThrow();
        expect(prisma.turf.create).not.toHaveBeenCalled();
      });
    });

    describe("claimDrawSelfServe", () => {
      it("throws INVALID_POLYGON when the drawn polygon resolves to nothing", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        geo.unionSources.mockResolvedValue(null);
        await expect(service.claimDrawSelfServe("org1", "camp1", "u1", { type: "Polygon" })).rejects.toThrow();
      });

      it("claims a self-drawn polygon", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        geo.unionSources.mockResolvedValue(square);
        prisma.$queryRawUnsafe.mockResolvedValue([{ geojson: JSON.stringify(square), empty: false }]);
        prisma.turfAssignment.create.mockResolvedValue({ id: "a1" });
        prisma.contact.count.mockResolvedValue(0);
        const turf = await service.claimDrawSelfServe("org1", "camp1", "u1", { type: "Polygon" });
        expect(geo.unionSources).toHaveBeenCalledWith([{ kind: "polygon", geometry: { type: "Polygon" } }]);
        expect(turf.id).toBe("turf_new");
      });
    });

    describe("claimExistingTurfSelfServe", () => {
      it("assigns a ready-made unassigned turf", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1", campaignId: "camp1" });
        prisma.turfAssignment.create.mockResolvedValue({ id: "a1", volunteerId: "u1" });
        const res = await service.claimExistingTurfSelfServe("org1", "camp1", "u1", "t1");
        expect(res.id).toBe("a1");
      });

      it("throws TURF_NOT_FOUND when the turf is not in the campaign", async () => {
        prisma.canvassCampaign.findFirst.mockResolvedValue(campaign);
        prisma.turf.findFirst.mockResolvedValue(null);
        await expect(service.claimExistingTurfSelfServe("org1", "camp1", "u1", "t9")).rejects.toThrow();
      });
    });
  });

  describe("createWalkList", () => {
    it("creates a walk list with route-ordered items", async () => {
      await service.createWalkList("org1", {
        name: "Route 1",
        turfId: "t1",
        contactIds: ["c1", "c2", "c3"],
      });
      const arg = prisma.walkList.create.mock.calls[0][0];
      expect(arg.data.name).toBe("Route 1");
      expect(arg.data.items.create).toEqual([
        { contactId: "c1", orderIndex: 0 },
        { contactId: "c2", orderIndex: 1 },
        { contactId: "c3", orderIndex: 2 },
      ]);
    });
  });

  describe("updateTurf", () => {
    it("updates name + geometry for an owned turf", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      const geometry = { type: "Polygon" };
      await service.updateTurf("org1", "t1", { name: "Renamed", geometry });
      expect(prisma.turf.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { name: "Renamed", geometry },
      });
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.updateTurf("org1", "missing", { name: "x" })).rejects.toThrow();
    });
  });

  describe("deleteTurf", () => {
    it("releases contacts + assignments then deletes the turf", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      prisma.contact.updateMany.mockResolvedValue({ count: 3 });
      const res = await service.deleteTurf("org1", "t1");
      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { tenantId: "org1", turfId: "t1" },
        data: { turfId: null },
      });
      expect(prisma.turfAssignment.deleteMany).toHaveBeenCalledWith({ where: { turfId: "t1" } });
      expect(prisma.turf.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
      expect(res).toEqual({ deleted: true });
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.deleteTurf("org1", "missing")).rejects.toThrow();
    });
  });

  describe("unassignTurf", () => {
    it("releases the active lock and returns the released count", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      prisma.turfAssignment.updateMany.mockResolvedValue({ count: 1 });
      const res = await service.unassignTurf("org1", "t1");
      expect(prisma.turfAssignment.updateMany).toHaveBeenCalledWith({
        where: { turfId: "t1", status: TurfAssignmentStatus.ASSIGNED },
        data: { status: TurfAssignmentStatus.RELEASED, releasedAt: expect.any(Date) },
      });
      expect(res).toEqual({ released: 1 });
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.unassignTurf("org1", "missing")).rejects.toThrow();
    });
  });

  describe("reassignTurf", () => {
    it("releases the current lock then assigns the new volunteer", async () => {
      prisma.turf.findFirst.mockResolvedValue({ id: "t1", tenantId: "org1" });
      prisma.turfAssignment.updateMany.mockResolvedValue({ count: 1 });
      prisma.turfAssignment.create.mockResolvedValue({ id: "a2", volunteerId: "u2" });
      const res = await service.reassignTurf("org1", "t1", "u2");
      expect(prisma.turfAssignment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: TurfAssignmentStatus.RELEASED }) }),
      );
      expect(prisma.turfAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ turfId: "t1", volunteerId: "u2", status: TurfAssignmentStatus.ASSIGNED }) }),
      );
      expect(res.id).toBe("a2");
    });

    it("throws for an unknown turf", async () => {
      prisma.turf.findFirst.mockResolvedValue(null);
      await expect(service.reassignTurf("org1", "missing", "u2")).rejects.toThrow();
    });
  });

  describe("shifts", () => {
    it("listShifts filters by campaign when given", async () => {
      prisma.shift.findMany.mockResolvedValue([{ id: "s1", capacity: null, assignments: [] }]);
      await service.listShifts("org1", "camp1");
      expect(prisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1", campaignId: "camp1" } }),
      );
    });

    it("listShifts omits the campaign filter when not given", async () => {
      prisma.shift.findMany.mockResolvedValue([]);
      await service.listShifts("org1");
      expect(prisma.shift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: "org1" } }),
      );
    });

    it("createShift coerces the start/end strings to Dates", async () => {
      await service.createShift("org1", {
        campaignId: "camp1",
        name: "AM",
        startsAt: "2026-07-01T09:00:00Z",
        endsAt: "2026-07-01T12:00:00Z",
      });
      const arg = prisma.shift.create.mock.calls[0][0];
      expect(arg.data.startsAt).toBeInstanceOf(Date);
      expect(arg.data.endsAt).toBeInstanceOf(Date);
      expect(arg.data.location).toBeNull();
    });

    it("deleteShift returns deleted when a row was removed", async () => {
      prisma.shift.deleteMany.mockResolvedValue({ count: 1 });
      const res = await service.deleteShift("org1", "s1");
      expect(res).toEqual({ deleted: true });
    });

    it("deleteShift throws SHIFT_NOT_FOUND when nothing matched", async () => {
      prisma.shift.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteShift("org1", "missing")).rejects.toThrow();
    });
  });
});
