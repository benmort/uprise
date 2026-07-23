import { AppUserRole } from "@uprise/db";
import { TextingService } from "./texting.service";
import type { AuthUser } from "../auth/auth-user";

const VOL: AuthUser = { id: "vol1", role: AppUserRole.VOLUNTEER, tenantId: "t1", roles: ["volunteer"], isSuperAdmin: false };
const ORG: AuthUser = { id: "org1", role: AppUserRole.ORGANISER, tenantId: "t1", roles: ["organiser"], isSuperAdmin: false };

function setup(over: Partial<Record<string, any>> = {}) {
  const prisma: any = {
    canvassCampaign: { findMany: jest.fn(async () => over.campaigns ?? []) },
    blast: { findMany: jest.fn(async () => over.blasts ?? []), findFirst: jest.fn(async () => over.blast ?? null) },
    blastRecipient: {
      groupBy: jest.fn(async () => []),
      findMany: jest.fn(async () => over.recipients ?? []),
      findFirst: jest.fn(async () => over.assignedRecipient ?? null),
    },
    conversationState: {
      count: jest.fn(async () => over.myUnread ?? 0),
      findMany: jest.fn(async () => over.conversations ?? []),
      findFirst: jest.fn(async () => over.conversationState ?? null),
    },
    contact: { findMany: jest.fn(async () => over.contacts ?? []) },
    $queryRaw: jest.fn(async () => over.claimedRows ?? [{ id: "x1" }, { id: "x2" }]),
  };
  const blasts: any = {
    isP2pBlast: jest.fn((m: any) => Boolean(m && m.p2p === true)),
    prepareP2pBlast: jest.fn(async () => ({ id: "b1" })),
    sendSingleRecipient: jest.fn(async () => ({ outcome: "sent", recipientId: "r1" })),
  };
  const inbox: any = {
    getThread: jest.fn(async () => ({ messages: [] })),
    reply: jest.fn(async () => ({ ok: true })),
    markConversation: jest.fn(async () => ({ resolved: true })),
  };
  return { service: new TextingService(prisma, blasts, inbox), prisma, blasts, inbox };
}

describe("listBanks", () => {
  const CAMPAIGNS = [{ id: "c1", name: "VIC SMS", channel: "SMS", status: "ACTIVE" }];
  const BLASTS = [
    { id: "b1", campaignId: "c1", title: "Wave 1", status: "SENDING", channel: "SMS", metadata: { p2p: true }, createdAt: new Date() },
    { id: "b2", campaignId: "c1", title: "Auto", status: "SENT", channel: "SMS", metadata: {}, createdAt: new Date() },
  ];

  it("volunteers see only P2P blasts, with counts and WITHOUT live status", async () => {
    const { service, prisma } = setup({ campaigns: CAMPAIGNS, blasts: BLASTS });
    prisma.blastRecipient.groupBy
      .mockResolvedValueOnce([{ blastId: "b1", _count: { _all: 3 } }]) // mine
      .mockResolvedValueOnce([{ blastId: "b1", _count: { _all: 40 } }]); // available
    const banks = await service.listBanks("t1", VOL);
    expect(banks).toHaveLength(1);
    expect(banks[0].blasts).toHaveLength(1); // the non-P2P blast is not volunteer work
    expect(banks[0].blasts[0]).toMatchObject({ id: "b1", myAssignedUnsent: 3, availableToClaim: 40 });
    expect(banks[0].blasts[0].status).toBeUndefined();
  });

  it("organisers see live blast status and banks with no P2P blasts yet", async () => {
    const { service } = setup({ campaigns: CAMPAIGNS, blasts: [BLASTS[1]] });
    const banks = await service.listBanks("t1", ORG);
    expect(banks).toHaveLength(1); // empty bank still visible for oversight
    expect(banks[0].blasts).toHaveLength(0);
  });

  it("returns [] when the tenant has no SMS campaigns", async () => {
    const { service, prisma } = setup({ campaigns: [] });
    expect(await service.listBanks("t1", VOL)).toEqual([]);
    expect(prisma.blast.findMany).not.toHaveBeenCalled();
  });
});

describe("claimBatch", () => {
  it("404s a blast without a campaign link (not a text bank)", async () => {
    const { service } = setup({ blast: { id: "b1", metadata: { p2p: true }, campaignId: null } });
    await expect(service.claimBatch("t1", VOL, "b1", "initial")).rejects.toMatchObject({
      response: { error: { code: "TEXT_BANK_NOT_FOUND" } },
    });
  });

  it("rejects a non-P2P blast", async () => {
    const { service } = setup({ blast: { id: "b1", metadata: {}, campaignId: "c1" } });
    await expect(service.claimBatch("t1", VOL, "b1", "initial")).rejects.toMatchObject({
      response: { error: { code: "BLAST_NOT_P2P" } },
    });
  });

  it("initial: prepares the blast then race-safely assigns via SKIP LOCKED", async () => {
    const { service, prisma, blasts } = setup({ blast: { id: "b1", metadata: { p2p: true }, campaignId: "c1" } });
    const res = await service.claimBatch("t1", VOL, "b1", "initial", 10);
    expect(blasts.prepareP2pBlast).toHaveBeenCalledWith("t1", "b1");
    expect(res).toEqual({ kind: "initial", claimed: 2 });
    const sql = String(prisma.$queryRaw.mock.calls[0][0].strings ?? prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain("SKIP LOCKED");
    expect(sql).toContain('"assigneeId" IS NULL');
  });

  it("replies: claims unowned unread conversations scoped to the blast's phones", async () => {
    const { service, prisma } = setup({ blast: { id: "b1", metadata: { p2p: true }, campaignId: "c1" } });
    const res = await service.claimBatch("t1", VOL, "b1", "replies", 5);
    expect(res).toEqual({ kind: "replies", claimed: 2 });
    const sql = String(prisma.$queryRaw.mock.calls[0][0].strings ?? prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('"ownerId" IS NULL');
    expect(sql).toContain("BlastRecipient");
  });
});

describe("myQueue", () => {
  it("returns assigned unsent sends + owned conversations restricted to the bank's phones", async () => {
    const { service, prisma } = setup({
      blast: { id: "b1", title: "Wave 1", metadata: { p2p: true } },
    });
    prisma.blastRecipient.findMany
      .mockResolvedValueOnce([
        { id: "r1", phoneE164: "+61400000001", renderedBody: "Hi Pat", contactId: "ct1" },
      ]) // toSend
      .mockResolvedValueOnce([{ phoneE164: "+61400000001" }, { phoneE164: "+61400000002" }]); // bank phones
    prisma.conversationState.findMany.mockResolvedValueOnce([
      { contactPhone: "+61400000002", unreadCount: 2, lastMessageAt: new Date(), contactId: null },
      { contactPhone: "+61499999999", unreadCount: 1, lastMessageAt: new Date(), contactId: null }, // other bank
    ]);
    prisma.contact.findMany.mockResolvedValueOnce([{ id: "ct1", firstName: "Pat", lastName: "Chair" }]);

    const q = await service.myQueue("t1", VOL, "b1");
    expect(q.toSend).toEqual([
      { recipientId: "r1", phone: "+61400000001", message: "Hi Pat", contactName: "Pat Chair" },
    ]);
    expect(q.conversations).toHaveLength(1); // the foreign-bank conversation is filtered out
    expect(q.conversations[0].contactPhone).toBe("+61400000002");
  });
});

describe("conversation scoping", () => {
  it("owner of the conversation may read/reply/resolve", async () => {
    const { service, inbox } = setup({ conversationState: { ownerId: "vol1" } });
    await service.thread("t1", VOL, "+61400000001");
    await service.reply("t1", VOL, "+61400000001", "hello");
    await service.resolve("t1", VOL, "+61400000001");
    expect(inbox.getThread).toHaveBeenCalled();
    expect(inbox.reply).toHaveBeenCalledWith("t1", "+61400000001", "hello", "SMS");
    expect(inbox.markConversation).toHaveBeenCalled();
  });

  it("the assigned initial-sender may view the thread before any reply exists", async () => {
    const { service, inbox } = setup({ conversationState: null, assignedRecipient: { id: "r1" } });
    await service.thread("t1", VOL, "+61400000001");
    expect(inbox.getThread).toHaveBeenCalled();
  });

  it("a foreign conversation 404s for volunteers (no existence leak)", async () => {
    const { service } = setup({ conversationState: { ownerId: "someone_else" }, assignedRecipient: null });
    await expect(service.thread("t1", VOL, "+61400000001")).rejects.toMatchObject({
      response: { error: { code: "CONVERSATION_NOT_YOURS" } },
    });
  });

  it("organisers bypass ownership for oversight", async () => {
    const { service, inbox, prisma } = setup({ conversationState: { ownerId: "someone_else" } });
    await service.thread("t1", ORG, "+61400000001");
    expect(inbox.getThread).toHaveBeenCalled();
    expect(prisma.conversationState.findFirst).not.toHaveBeenCalled();
  });
});

describe("sendInitial", () => {
  it("binds the send to the session user as assignee", async () => {
    const { service, blasts } = setup();
    await service.sendInitial("t1", VOL, "r1");
    expect(blasts.sendSingleRecipient).toHaveBeenCalledWith("t1", "r1", "vol1");
  });
});
