import { ConfigService } from "@nestjs/config";
import { BlastRecipientStatus } from "@uprise/db";
import { InboxService } from "./inbox.service";

describe("InboxService", () => {
  const prisma = {
    tenant: { upsert: jest.fn() },
    blast: { findMany: jest.fn() },
    outboundMessage: { create: jest.fn(), findFirst: jest.fn() },
    inboundMessage: { create: jest.fn(), findFirst: jest.fn() },
    blastRecipient: { updateMany: jest.fn() },
    analyticsSnapshot: { create: jest.fn() },
    conversationState: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    user: { findMany: jest.fn() },
  } as any;
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === "DEFAULT_ORGANIZATION_SLUG") return "default";
      return fallback;
    }),
  } as unknown as ConfigService;
  const twilio = {
    getLatestByContact: jest.fn(),
    getMessagesForPhoneNumber: jest.fn(),
    sendMessage: jest.fn(),
  } as any;
  const events = { emit: jest.fn() } as any;
  const contacts = {
    getOrCreateByPhone: jest.fn(async (_orgId: string, phone: string) => ({
      id: `contact_${phone}`,
    })),
  } as any;
  const repo = {
    listConversations: jest.fn(),
    listRecentMessageContacts: jest.fn(),
    listContactPhonesForBlast: jest.fn(),
    listContactPhonesForAudience: jest.fn(),
    listContactNamesByPhones: jest.fn(),
    getThread: jest.fn(),
  } as any;
  const ai = { suggestReplies: jest.fn(() => []) } as any;
  const consent = {
    setState: jest.fn(),
    getState: jest.fn(),
    canSend: jest.fn().mockReturnValue(true),
    classifyConsentKeyword: jest.fn().mockReturnValue(null),
  } as any;
  const sessionWindow = {
    isOpen: jest.fn().mockResolvedValue(true),
  } as any;

  let service: InboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tenant.upsert.mockResolvedValue({ id: "org_1", slug: "default" });
    prisma.outboundMessage.findFirst.mockResolvedValue(null);
    prisma.inboundMessage.create.mockResolvedValue({
      id: "inbound_1",
      receivedAt: new Date("2026-05-08T10:00:00.000Z"),
    });
    prisma.blastRecipient.updateMany.mockResolvedValue({ count: 0 });
    prisma.analyticsSnapshot.create.mockResolvedValue({});
    prisma.conversationState.upsert.mockResolvedValue({});
    prisma.conversationState.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversationState.findUnique.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    repo.listContactNamesByPhones.mockResolvedValue([]);
    consent.canSend.mockReturnValue(true);
    sessionWindow.isOpen.mockResolvedValue(true);
    service = new InboxService(
      prisma,
      config,
      twilio,
      { resolve: async () => undefined, resolveByNumber: async () => undefined, invalidate: () => {} } as any,
      events,
      contacts,
      repo,
      ai,
      consent,
      sessionWindow,
    );
  });

  it("attributes inbound reply to latest blast-linked outbound and records responded snapshot", async () => {
    prisma.outboundMessage.findFirst.mockResolvedValue({
      id: "outbound_blast_1",
      blastId: "blast_1",
      recipientId: "recipient_1",
      sentAt: new Date("2026-05-08T09:55:00.000Z"),
      createdAt: new Date("2026-05-08T09:55:00.000Z"),
    });
    const receivedAt = new Date("2026-05-08T10:01:00.000Z");
    prisma.inboundMessage.create.mockResolvedValue({
      id: "inbound_2",
      receivedAt,
    });
    prisma.blastRecipient.updateMany.mockResolvedValue({ count: 1 });

    await service.recordInbound({
      from: "+1 (555) 000-0001",
      to: "+1 (555) 000-0000",
      body: "Yes, I am interested",
      messageSid: "SM_INBOUND_1",
    });

    expect(prisma.outboundMessage.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "org_1",
        toPhone: "+15550000001",
        channel: "SMS",
        OR: [{ blastId: { not: null } }, { recipientId: { not: null } }],
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
    });
    expect(prisma.inboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blastId: "blast_1",
          fromPhone: "+15550000001",
          toPhone: "+15550000000",
          twilioMessageSid: "SM_INBOUND_1",
        }),
      }),
    );
    expect(prisma.blastRecipient.updateMany).toHaveBeenCalledWith({
      where: {
        id: "recipient_1",
        status: { not: BlastRecipientStatus.RESPONDED },
      },
      data: {
        status: BlastRecipientStatus.RESPONDED,
        respondedAt: receivedAt,
      },
    });
    expect(prisma.analyticsSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "org_1",
          blastId: "blast_1",
          metricName: "responded",
          metricValue: 1,
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith("inbox.inbound", {
      contactPhone: "+15550000001",
      blastId: "blast_1",
      body: "Yes, I am interested",
      channel: "SMS",
    });
  });

  it("does not write duplicate responded snapshot when recipient already responded", async () => {
    prisma.outboundMessage.findFirst.mockResolvedValue({
      id: "outbound_blast_1",
      blastId: "blast_1",
      recipientId: "recipient_1",
      sentAt: new Date("2026-05-08T09:55:00.000Z"),
      createdAt: new Date("2026-05-08T09:55:00.000Z"),
    });
    prisma.blastRecipient.updateMany.mockResolvedValue({ count: 0 });

    await service.recordInbound({
      from: "+15550000001",
      to: "+15550000000",
      body: "Checking in",
      messageSid: "SM_INBOUND_2",
    });

    expect(prisma.blastRecipient.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.analyticsSnapshot.create).not.toHaveBeenCalled();
  });

  it("does not mark responded when inbound cannot be linked to a blast outbound", async () => {
    prisma.outboundMessage.findFirst.mockResolvedValue(null);

    await service.recordInbound({
      from: "+15550000009",
      to: "+15550000000",
      body: "Hello",
      messageSid: "SM_INBOUND_3",
    });

    expect(prisma.inboundMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blastId: null,
          fromPhone: "+15550000009",
        }),
      }),
    );
    expect(prisma.blastRecipient.updateMany).not.toHaveBeenCalled();
    expect(prisma.analyticsSnapshot.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith("inbox.inbound", {
      contactPhone: "+15550000009",
      blastId: null,
      body: "Hello",
      channel: "SMS",
    });
  });

  it("merges conversation state with message recipients from db and twilio", async () => {
    repo.listConversations.mockResolvedValue([
      {
        contactPhone: "+15550000001",
        unreadCount: 2,
        resolved: false,
        lastMessageAt: new Date("2026-05-08T10:00:00.000Z"),
        createdAt: new Date("2026-05-08T09:00:00.000Z"),
        updatedAt: new Date("2026-05-08T10:00:00.000Z"),
      },
    ]);
    repo.listRecentMessageContacts.mockResolvedValue([
      {
        contactPhone: "+15550000002",
        lastMessageAt: new Date("2026-05-08T10:30:00.000Z"),
      },
    ]);
    twilio.getLatestByContact.mockResolvedValue({
      "+15550000003": {
        direction: "outbound-api",
        date: "2026-05-08T11:00:00.000Z",
        body: "hi",
        status: "sent",
      },
      "+15550000002": {
        direction: "inbound",
        date: "2026-05-08T11:10:00.000Z",
        body: "reply",
        status: "received",
      },
    });

    const rows = await service.listConversations();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.contactPhone)).toEqual([
      "+15550000002",
      "+15550000003",
      "+15550000001",
    ]);
    expect(rows.find((row) => row.contactPhone === "+15550000002")?.unreadCount).toBe(0);
  });

  it("deduplicates thread messages when twilio sid overlaps db records", async () => {
    repo.getThread.mockResolvedValue([
      [
        {
          id: "inbound_row_1",
          twilioMessageSid: "SM_DUP",
          receivedAt: new Date("2026-05-08T10:00:00.000Z"),
          body: "hello",
          fromPhone: "+15550000001",
          toPhone: "+15550000000",
          blastId: null,
        },
      ],
      [
        {
          id: "outbound_row_1",
          twilioMessageSid: null,
          sentAt: new Date("2026-05-08T10:02:00.000Z"),
          body: "hey back",
          fromPhone: "+15550000000",
          toPhone: "+15550000001",
          blastId: null,
        },
      ],
    ]);
    twilio.getMessagesForPhoneNumber.mockResolvedValue({
      messages: [
        {
          sid: "SM_DUP",
          direction: "inbound",
          dateCreated: "2026-05-08T10:00:00.000Z",
          dateSent: null,
          body: "hello",
          from: "+15550000001",
          to: "+15550000000",
        },
        {
          sid: "SM_NEW",
          direction: "outbound-api",
          dateCreated: "2026-05-08T10:03:00.000Z",
          dateSent: "2026-05-08T10:03:00.000Z",
          body: "follow up",
          from: "+15550000000",
          to: "+15550000001",
        },
      ],
    });

    const thread = await service.getThread("+15550000001");
    expect(thread.messages).toHaveLength(3);
    const sidMessages = thread.messages.filter(
      (row: any) => row.id === "SM_DUP" || row.sid === "SM_DUP",
    );
    expect(sidMessages).toHaveLength(1);
  });

  it("clears unread count when replying to a conversation", async () => {
    twilio.sendMessage.mockResolvedValue({
      to: "+15550000001",
      from: "+15550000000",
      body: "Thanks",
      sid: "SM_REPLY_1",
      dateSent: "2026-05-08T10:03:00.000Z",
      dateCreated: "2026-05-08T10:03:00.000Z",
    });
    prisma.outboundMessage.create.mockResolvedValue({
      sentAt: new Date("2026-05-08T10:03:00.000Z"),
    });
    prisma.conversationState.upsert.mockResolvedValue({});

    await service.reply("+15550000001", "Thanks");

    expect(prisma.conversationState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          unreadCount: 0,
        }),
      }),
    );
  });

  describe("ownership (E2)", () => {
    it("claims a conversation for a user and resolves the owner name", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1", displayName: "Ada", email: "a@b.c" }]);
      const res = await service.claimConversation("+15550000001", "u1", "SMS");
      expect(prisma.conversationState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ ownerId: "u1" }) }),
      );
      expect(res.owner).toEqual({ id: "u1", name: "Ada" });
    });

    it("releases a conversation (clears the owner)", async () => {
      const res = await service.releaseConversation("+15550000001", "SMS");
      expect(prisma.conversationState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ownerId: null, claimedAt: null } }),
      );
      expect(res.owner).toBeNull();
    });
  });
});
