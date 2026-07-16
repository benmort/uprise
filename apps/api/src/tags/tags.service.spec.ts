import { TagsService, slugifyTag } from "./tags.service";

function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    contactTag: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "t1", ...data })),
      delete: jest.fn(),
      upsert: jest.fn(async ({ create }: any) => ({ id: "t1", ...create })),
    },
    contactTagAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    contact: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
    ...overrides,
  };
  base.$transaction = jest.fn(async (fn: any) => fn(base));
  return base;
}

describe("slugifyTag", () => {
  it("slugs a human label", () => {
    expect(slugifyTag("Volunteer Supporter!")).toBe("volunteer_supporter");
    expect(slugifyTag("  ")).toBe("tag");
  });
});

describe("TagsService", () => {
  let prisma: any;
  let outbox: any;
  let service: TagsService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = { append: jest.fn() };
    service = new TagsService(prisma, outbox);
  });

  describe("createTag", () => {
    it("slugs the label and creates when absent", async () => {
      prisma.contactTag.findUnique.mockResolvedValue(null);
      await service.createTag("org1", { label: "Door supporter" });
      expect(prisma.contactTag.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ key: "door_supporter", label: "Door supporter" }) }),
      );
    });
    it("returns the existing tag rather than duplicating", async () => {
      prisma.contactTag.findUnique.mockResolvedValue({ id: "t9", key: "door_supporter" });
      const res = await service.createTag("org1", { label: "Door supporter" });
      expect(res).toEqual({ id: "t9", key: "door_supporter" });
      expect(prisma.contactTag.create).not.toHaveBeenCalled();
    });
  });

  describe("applyTag", () => {
    it("upserts the tag, creates the assignment, and emits the event atomically", async () => {
      prisma.contactTagAssignment.findFirst.mockResolvedValue(null);
      await service.applyTag("org1", "c1", "Volunteer", "journey");
      expect(prisma.contactTag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId_key: { tenantId: "org1", key: "volunteer" } } }),
      );
      expect(prisma.contactTagAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ contactId: "c1", source: "journey" }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ eventType: "contacts.tag.added", payload: expect.objectContaining({ key: "volunteer" }) }),
      );
    });

    it("is a no-op (no duplicate assignment or event) when already tagged", async () => {
      prisma.contactTagAssignment.findFirst.mockResolvedValue({ id: "a1" });
      await service.applyTag("org1", "c1", "volunteer");
      expect(prisma.contactTagAssignment.create).not.toHaveBeenCalled();
      expect(outbox.append).not.toHaveBeenCalled();
    });

    it("refuses to tag a contact that isn't the caller's tenant", async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      await expect(service.applyTag("org1", "foreign", "vip")).rejects.toMatchObject({ response: { error: { code: "CONTACT_NOT_FOUND" } } });
      expect(prisma.contactTagAssignment.create).not.toHaveBeenCalled();
    });

    it("ignores a blank tag rather than minting a literal 'tag'", async () => {
      await service.applyTag("org1", "c1", "   ");
      expect(prisma.contact.findFirst).not.toHaveBeenCalled();
      expect(prisma.contactTag.upsert).not.toHaveBeenCalled();
    });
  });

  describe("assignTag", () => {
    it("throws for a tag that isn't the tenant's", async () => {
      prisma.contactTag.findFirst.mockResolvedValue(null);
      await expect(service.assignTag("org1", "c1", "ghost")).rejects.toMatchObject({ response: { error: { code: "TAG_NOT_FOUND" } } });
    });
    it("applies an existing tag by id", async () => {
      prisma.contactTag.findFirst.mockResolvedValue({ id: "t1", key: "vip" });
      prisma.contactTagAssignment.findFirst.mockResolvedValue(null);
      const res = await service.assignTag("org1", "c1", "t1");
      expect(res).toEqual({ ok: true });
      expect(prisma.contactTag.upsert).toHaveBeenCalled();
    });
  });

  describe("deleteTag / removeTag", () => {
    it("archives-by-delete only the tenant's tag", async () => {
      prisma.contactTag.findFirst.mockResolvedValue(null);
      await expect(service.deleteTag("org1", "x")).rejects.toMatchObject({ response: { error: { code: "TAG_NOT_FOUND" } } });
      prisma.contactTag.findFirst.mockResolvedValue({ id: "t1" });
      expect(await service.deleteTag("org1", "t1")).toEqual({ deleted: true });
    });
    it("removes an assignment", async () => {
      expect(await service.removeTag("org1", "c1", "t1")).toEqual({ removed: true });
      expect(prisma.contactTagAssignment.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "org1", contactId: "c1", tagId: "t1" } });
    });
  });
});
