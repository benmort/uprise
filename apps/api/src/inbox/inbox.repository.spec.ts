import { MessageChannel } from "@uprise/db";
import { InboxRepository, INBOX_RECENT_CONTACT_WINDOW_DAYS } from "./inbox.repository";

const NOW = new Date("2026-08-07T00:00:00.000Z").getTime();
const CUTOFF = new Date(NOW - INBOX_RECENT_CONTACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

function setup() {
  const prisma: any = {
    conversationState: { findMany: jest.fn(async () => []) },
    inboundMessage: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
    outboundMessage: { findMany: jest.fn(async () => []), groupBy: jest.fn(async () => []) },
    audienceContact: { findMany: jest.fn(async () => []) },
  };
  return { repo: new InboxRepository(prisma), prisma };
}

describe("InboxRepository", () => {
  describe("getThread", () => {
    it("matches inbound by fromPhone-or-toPhone and outbound by toPhone only", async () => {
      const { repo, prisma } = setup();
      await repo.getThread("t1", "+15550000001", MessageChannel.SMS);

      expect(prisma.inboundMessage.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: "t1",
          channel: MessageChannel.SMS,
          OR: [{ fromPhone: "+15550000001" }, { toPhone: "+15550000001" }],
        },
        orderBy: { receivedAt: "asc" },
        take: 200,
      });
      // Outbound fromPhone is always the tenant's sender number – the contact-phone
      // match lives on toPhone alone, so (tenantId, toPhone, sentAt) serves the read.
      expect(prisma.outboundMessage.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: "t1",
          channel: MessageChannel.SMS,
          toPhone: "+15550000001",
        },
        orderBy: { sentAt: "asc" },
        take: 200,
      });
    });
  });

  describe("listRecentMessageContacts", () => {
    let nowSpy: jest.SpyInstance<number, []>;
    beforeEach(() => {
      nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW);
    });
    afterEach(() => nowSpy.mockRestore());

    it("bounds both aggregations to the recent-contact window", async () => {
      const { repo, prisma } = setup();
      await repo.listRecentMessageContacts("t1");

      expect(prisma.inboundMessage.groupBy).toHaveBeenCalledWith({
        by: ["fromPhone", "channel"],
        where: { tenantId: "t1", receivedAt: { gte: CUTOFF } },
        _max: { receivedAt: true },
        orderBy: { _max: { receivedAt: "desc" } },
        take: 500,
      });
      expect(prisma.outboundMessage.groupBy).toHaveBeenCalledWith({
        by: ["toPhone", "channel"],
        where: { tenantId: "t1", sentAt: { gte: CUTOFF } },
        _max: { sentAt: true },
        orderBy: { _max: { sentAt: "desc" } },
        take: 500,
      });
    });

    it("keeps the most recent side per (phone, channel) and drops null aggregates", async () => {
      const { repo, prisma } = setup();
      const older = new Date("2026-08-01T00:00:00.000Z");
      const newer = new Date("2026-08-06T00:00:00.000Z");
      prisma.inboundMessage.groupBy.mockResolvedValue([
        { fromPhone: "+15550000001", channel: MessageChannel.SMS, _max: { receivedAt: older } },
        { fromPhone: "+15550000002", channel: MessageChannel.SMS, _max: { receivedAt: null } },
      ]);
      prisma.outboundMessage.groupBy.mockResolvedValue([
        { toPhone: "+15550000001", channel: MessageChannel.SMS, _max: { sentAt: newer } },
      ]);

      const contacts = await repo.listRecentMessageContacts("t1");
      expect(contacts).toEqual([
        { contactPhone: "+15550000001", channel: MessageChannel.SMS, lastMessageAt: newer },
      ]);
    });

    it("clamps the take between 1 and 2000", async () => {
      const { repo, prisma } = setup();
      await repo.listRecentMessageContacts("t1", 99999);
      expect(prisma.inboundMessage.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2000 }),
      );
    });
  });

  describe("listAudienceMemberPhones", () => {
    it("membership-tests the given phones against AudienceContact", async () => {
      const { repo, prisma } = setup();
      prisma.audienceContact.findMany.mockResolvedValue([{ phoneE164: "+15550000002" }]);

      const phones = await repo.listAudienceMemberPhones("t1", "aud_1", [
        "+15550000001",
        "+15550000002",
      ]);

      expect(prisma.audienceContact.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: "t1",
          audienceId: "aud_1",
          phoneE164: { in: ["+15550000001", "+15550000002"] },
        },
        select: { phoneE164: true },
      });
      expect(phones).toEqual(["+15550000002"]);
    });

    it("short-circuits an empty page without querying", async () => {
      const { repo, prisma } = setup();
      expect(await repo.listAudienceMemberPhones("t1", "aud_1", [])).toEqual([]);
      expect(prisma.audienceContact.findMany).not.toHaveBeenCalled();
    });
  });

  describe("listContactPhonesForBlast", () => {
    it("concatenates distinct inbound-from and outbound-to phones", async () => {
      const { repo, prisma } = setup();
      prisma.inboundMessage.findMany.mockResolvedValue([{ fromPhone: "+15550000001" }]);
      prisma.outboundMessage.findMany.mockResolvedValue([{ toPhone: "+15550000002" }]);

      const phones = await repo.listContactPhonesForBlast("t1", "blast_1");
      expect(phones).toEqual(["+15550000001", "+15550000002"]);
      expect(prisma.inboundMessage.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1", blastId: "blast_1" },
        select: { fromPhone: true },
        distinct: ["fromPhone"],
      });
    });
  });

  describe("listContactNamesByPhones", () => {
    it("takes one row per phone, most recently updated first (most-recent-wins)", async () => {
      const { repo, prisma } = setup();
      await repo.listContactNamesByPhones("t1", ["+15550000001"]);

      expect(prisma.audienceContact.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: "t1",
          phoneE164: { in: ["+15550000001"] },
          NOT: [{ fullName: null }, { fullName: "" }],
        },
        select: { phoneE164: true, fullName: true, updatedAt: true },
        distinct: ["phoneE164"],
        orderBy: [{ phoneE164: "asc" }, { updatedAt: "desc" }],
      });
    });

    it("short-circuits an empty phone list", async () => {
      const { repo, prisma } = setup();
      expect(await repo.listContactNamesByPhones("t1", [])).toEqual([]);
      expect(prisma.audienceContact.findMany).not.toHaveBeenCalled();
    });
  });

  describe("listConversations", () => {
    it("stays bounded to the newest 400 conversations", async () => {
      const { repo, prisma } = setup();
      await repo.listConversations("t1");
      expect(prisma.conversationState.findMany).toHaveBeenCalledWith({
        where: { tenantId: "t1" },
        orderBy: { updatedAt: "desc" },
        take: 400,
      });
    });
  });
});
