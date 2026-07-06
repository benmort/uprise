import { InboxController } from "./inbox.controller";

describe("InboxController", () => {
  const inbox = {
    listConversations: jest.fn().mockResolvedValue([]),
    getThread: jest.fn().mockResolvedValue({}),
    reply: jest.fn().mockResolvedValue({}),
    markConversation: jest.fn().mockResolvedValue({}),
    claimConversation: jest.fn().mockResolvedValue({}),
    releaseConversation: jest.fn().mockResolvedValue({}),
    suggest: jest.fn().mockResolvedValue([]),
  } as any;
  const c = new InboxController(inbox);

  beforeEach(() => jest.clearAllMocks());

  it("listConversations forwards tenantId + query/blast/audience filters", () => {
    c.listConversations("t1", { query: "q", blastId: "b1", audienceId: "a1" } as any);
    expect(inbox.listConversations).toHaveBeenCalledWith("t1", {
      query: "q",
      blastId: "b1",
      audienceId: "a1",
    });
  });

  it("getThread delegates with tenantId, phone, channel", () => {
    c.getThread("t1", "+61400000000", "sms");
    expect(inbox.getThread).toHaveBeenCalledWith("t1", "+61400000000", "sms");
  });

  it("reply unpacks the dto with tenantId first", () => {
    c.reply("t1", { contactPhone: "+61400000000", body: "hi", channel: "sms" } as any);
    expect(inbox.reply).toHaveBeenCalledWith("t1", "+61400000000", "hi", "sms");
  });

  it("markConversation coerces resolved to a boolean", () => {
    c.markConversation("t1", "+61400000000", { resolved: 1, channel: "sms" } as any);
    expect(inbox.markConversation).toHaveBeenCalledWith("t1", "+61400000000", true, "sms");
  });

  it("claim uses the request user id as owner", () => {
    c.claim("t1", "+61400000000", { channel: "sms" }, { user: { id: "u1" } } as any);
    expect(inbox.claimConversation).toHaveBeenCalledWith("t1", "+61400000000", "u1", "sms");
  });

  it("claim falls back to env-admin when unauthenticated", () => {
    c.claim("t1", "+61400000000", {}, {} as any);
    expect(inbox.claimConversation).toHaveBeenCalledWith("t1", "+61400000000", "env-admin", undefined);
  });

  it("release delegates with tenantId, phone, channel", () => {
    c.release("t1", "+61400000000", { channel: "sms" });
    expect(inbox.releaseConversation).toHaveBeenCalledWith("t1", "+61400000000", "sms");
  });

  it("aiSuggestions defaults a missing message to empty string", () => {
    c.aiSuggestions("t1");
    expect(inbox.suggest).toHaveBeenCalledWith("t1", "");
  });
});
