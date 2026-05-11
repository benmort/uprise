import { ConfigService } from "@nestjs/config";
import { InboxService } from "./inbox.service";

describe("InboxService", () => {
  const prisma = {
    organization: { upsert: jest.fn() },
    blast: { findMany: jest.fn() },
    outboundMessage: { create: jest.fn() },
    conversationState: { upsert: jest.fn() },
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
  const repo = {
    listConversations: jest.fn(),
    listRecentMessageContacts: jest.fn(),
    listContactPhonesForBlast: jest.fn(),
    listContactPhonesForAudience: jest.fn(),
    listContactNamesByPhones: jest.fn(),
    getThread: jest.fn(),
  } as any;
  const ai = { suggestReplies: jest.fn(() => []) } as any;

  let service: InboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.upsert.mockResolvedValue({ id: "org_1", slug: "default" });
    repo.listContactNamesByPhones.mockResolvedValue([]);
    service = new InboxService(prisma, config, twilio, events, repo, ai);
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
});
