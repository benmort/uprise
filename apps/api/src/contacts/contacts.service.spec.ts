import { Prisma } from "@uprise/db";
import { ContactsService } from "./contacts.service";

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
  });
}

describe("ContactsService", () => {
  let prisma: any;
  let service: ContactsService;

  beforeEach(() => {
    prisma = {
      contact: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      audienceContact: { updateMany: jest.fn() },
      blastRecipient: { updateMany: jest.fn() },
      inboundMessage: { updateMany: jest.fn() },
      outboundMessage: { updateMany: jest.fn() },
      conversationState: { updateMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new ContactsService(prisma);
  });

  describe("getOrCreateByPhone", () => {
    it("returns the existing contact without creating when one matches", async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: "c1", firstName: "Ada", lastName: "Lovelace" });

      const result = await service.getOrCreateByPhone("org_1", "+15550000001");

      expect(result.id).toBe("c1");
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it("creates a contact when none exists, splitting fullName into first/last", async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: "c2" });

      await service.getOrCreateByPhone("org_1", "+15550000002", { fullName: "Grace Hopper" });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: "org_1",
          phoneE164: "+15550000002",
          firstName: "Grace",
          lastName: "Hopper",
        }),
      });
    });

    it("recovers from a P2002 race by re-finding the contact", async () => {
      prisma.contact.findFirst
        .mockResolvedValueOnce(null) // initial lookup misses
        .mockResolvedValueOnce({ id: "c_raced" }); // re-find after conflict
      prisma.contact.create.mockRejectedValue(p2002());

      const result = await service.getOrCreateByPhone("org_1", "+15550000003");

      expect(result.id).toBe("c_raced");
    });

    it("enriches only blank fields on an existing contact", async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: "c3", firstName: null, email: "x@y.z" });
      prisma.contact.update.mockResolvedValue({ id: "c3", firstName: "Edsger" });

      await service.getOrCreateByPhone("org_1", "+15550000004", {
        firstName: "Edsger",
        email: "override@no.no",
      });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: "c3" },
        data: { firstName: "Edsger" }, // email already set → not overwritten
      });
    });
  });

  describe("getOrCreateByAddress", () => {
    it("returns null when the address normalises to empty", async () => {
      const result = await service.getOrCreateByAddress("org_1", "   ");
      expect(result).toBeNull();
      expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    });

    it("dedups on the normalised address key", async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: "c_addr" });

      await service.getOrCreateByAddress("org_1", "12 Main St.");

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { tenantId: "org_1", addressNorm: "12 main st" },
      });
      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ addressNorm: "12 main st", address: "12 Main St." }),
      });
    });
  });

  describe("mergeContacts", () => {
    it("re-points all relations onto the primary and deletes the duplicate", async () => {
      prisma.contact.findFirst
        .mockResolvedValueOnce({ id: "primary", firstName: "A", metadata: { a: 1 } })
        .mockResolvedValueOnce({ id: "dup", lastName: "B", metadata: { b: 2 }, phoneE164: "+1555" });
      prisma.conversationState.findUnique.mockResolvedValue(null);
      prisma.contact.update.mockResolvedValue({ id: "primary" });

      await service.mergeContacts("org_1", "primary", "dup");

      for (const rel of [
        prisma.audienceContact,
        prisma.blastRecipient,
        prisma.inboundMessage,
        prisma.outboundMessage,
      ]) {
        expect(rel.updateMany).toHaveBeenCalledWith({
          where: { contactId: "dup" },
          data: { contactId: "primary" },
        });
      }
      // duplicate's conversation adopted since primary has none
      expect(prisma.conversationState.updateMany).toHaveBeenCalledWith({
        where: { contactId: "dup" },
        data: { contactId: "primary" },
      });
      expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: "dup" } });
    });
  });

  describe("dedupUpsert", () => {
    it("merges when phone and address resolve to different contacts", async () => {
      const merge = jest.spyOn(service, "mergeContacts").mockResolvedValue({ id: "merged" } as any);
      jest.spyOn(service, "getOrCreateByPhone").mockResolvedValue({ id: "by_phone" } as any);
      jest.spyOn(service, "getOrCreateByAddress").mockResolvedValue({ id: "by_address" } as any);

      const result = await service.dedupUpsert("org_1", {
        phoneE164: "+1555",
        address: "1 Road",
      });

      expect(merge).toHaveBeenCalledWith("org_1", "by_phone", "by_address");
      expect(result).toEqual({ id: "merged" });
    });
  });
});
