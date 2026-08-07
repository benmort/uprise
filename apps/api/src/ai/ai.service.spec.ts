const createMock = jest.fn();
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({ messages: { create: createMock } }));
});

import { ApiHttpException } from "../common/http/api-response";
import { AiService } from "./ai.service";
import type { AiChatDto } from "./dto/ai-chat.dto";

const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

function makePrisma() {
  const prisma: any = {
    aiConversation: {
      create: jest.fn(async ({ data }: any) => ({ id: "conv1", ...data })),
      findFirst: jest.fn(async () => ({ id: "conv1", title: "Hello" })),
      findMany: jest.fn(async () => [{ id: "conv1", title: "Hello", model: null, updatedAt: new Date(), createdAt: new Date() }]),
      update: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    aiMessage: {
      create: jest.fn(async ({ data }: any) => ({ id: "m", ...data })),
      findMany: jest.fn(async () => []),
    },
  };
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  return prisma;
}

const reply = (over: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text: "Hi there" }],
  model: "claude-opus-4-8",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 20 },
  ...over,
});

const dto = (over: Partial<AiChatDto> = {}): AiChatDto => ({ message: "Hello AI", ...over }) as AiChatDto;

describe("AiService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("throws coded AI_NOT_CONFIGURED (503) without a key and never calls the SDK", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const svc = new AiService(makePrisma(), logger);
    const err = await svc.chat("u1", dto()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpException);
    expect(err.getStatus()).toBe(503);
    expect((err.getResponse() as any).error.code).toBe("AI_NOT_CONFIGURED");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("happy path: creates the conversation, persists both turns, returns the reply", async () => {
    createMock.mockResolvedValueOnce(reply());
    const prisma = makePrisma();
    const svc = new AiService(prisma, logger);
    const out = await svc.chat("u1", dto());

    expect(prisma.aiConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", title: "Hello AI" }) }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        messages: [{ role: "user", content: "Hello AI" }],
      }),
    );
    expect(prisma.aiMessage.create).toHaveBeenCalledTimes(2);
    expect(prisma.aiMessage.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "assistant", content: "Hi there", inputTokens: 10, outputTokens: 20 }),
      }),
    );
    expect(out).toMatchObject({
      conversationId: "conv1",
      reply: "Hi there",
      model: "claude-opus-4-8",
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  it("passes model + system through and prepends prior context", async () => {
    createMock.mockResolvedValueOnce(reply({ model: "claude-haiku-4-5" }));
    const prisma = makePrisma();
    // The context read is newest-first with a `take`, so the stub answers the way that
    // query does – the service turns the tail back the right way round.
    prisma.aiMessage.findMany.mockResolvedValueOnce([
      { role: "assistant", content: "answer" },
      { role: "user", content: "before" },
    ]);
    const svc = new AiService(prisma, logger);
    await svc.chat("u1", dto({ conversationId: "conv1", model: "claude-haiku-4-5", system: "Be terse." }));

    // The window is asked of the database, not sliced out in JS after loading everything.
    expect(prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" }, take: 40 }),
    );
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5",
        system: "Be terse.",
        messages: [
          { role: "user", content: "before" },
          { role: "assistant", content: "answer" },
          { role: "user", content: "Hello AI" },
        ],
      }),
    );
  });

  it("a foreign conversationId 404s before any SDK call", async () => {
    const prisma = makePrisma();
    prisma.aiConversation.findFirst.mockResolvedValueOnce(null);
    const svc = new AiService(prisma, logger);
    const err = await svc.chat("u1", dto({ conversationId: "theirs" })).catch((e) => e);
    expect(err.getStatus()).toBe(404);
    expect((err.getResponse() as any).error.code).toBe("AI_CONVERSATION_NOT_FOUND");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("maps 429 → AI_RATE_LIMITED and logs", async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 }));
    const svc = new AiService(makePrisma(), logger);
    const err = await svc.chat("u1", dto()).catch((e) => e);
    expect(err.getStatus()).toBe(429);
    expect((err.getResponse() as any).error.code).toBe("AI_RATE_LIMITED");
    expect((logger as any).warn).toHaveBeenCalled();
  });

  it("maps other statuses → 502 and connection failures → 504", async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));
    const svc = new AiService(makePrisma(), logger);
    const upstream = await svc.chat("u1", dto()).catch((e) => e);
    expect(upstream.getStatus()).toBe(502);
    expect((upstream.getResponse() as any).error.code).toBe("AI_UPSTREAM_ERROR");

    createMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const conn = await svc.chat("u1", dto()).catch((e) => e);
    expect(conn.getStatus()).toBe(504);
    expect((conn.getResponse() as any).error.code).toBe("AI_UNAVAILABLE");
  });

  it("joins multiple text blocks into one reply", async () => {
    createMock.mockResolvedValueOnce(
      reply({ content: [{ type: "text", text: "A" }, { type: "tool_use", id: "t" }, { type: "text", text: "B" }] }),
    );
    const svc = new AiService(makePrisma(), logger);
    const out = await svc.chat("u1", dto());
    expect(out.reply).toBe("AB");
  });

  it("truncates long first lines into the conversation title", async () => {
    createMock.mockResolvedValueOnce(reply());
    const prisma = makePrisma();
    const svc = new AiService(prisma, logger);
    await svc.chat("u1", dto({ message: `${"x".repeat(80)}\nsecond line` }));
    const title = prisma.aiConversation.create.mock.calls[0][0].data.title;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("list/get/delete scope to the owner; delete 404s on foreign rows", async () => {
    const prisma = makePrisma();
    const svc = new AiService(prisma, logger);

    const list = await svc.listConversations("u1");
    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
    expect(list.conversations).toHaveLength(1);

    const got = await svc.getConversation("u1", "conv1");
    expect(got.id).toBe("conv1");

    await svc.deleteConversation("u1", "conv1");
    expect(prisma.aiConversation.delete).toHaveBeenCalledWith({ where: { id: "conv1" } });

    prisma.aiConversation.findFirst.mockResolvedValueOnce(null);
    const err = await svc.deleteConversation("u1", "foreign").catch((e) => e);
    expect(err.getStatus()).toBe(404);
  });

  it("bounds the conversation list and pages it with a cursor", async () => {
    const prisma = makePrisma();
    const svc = new AiService(prisma, logger);

    // A short page is the end of the list: no cursor to follow.
    expect((await svc.listConversations("u1")).nextCursor).toBeNull();
    expect(prisma.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, orderBy: { updatedAt: "desc" } }),
    );
    expect(prisma.aiConversation.findMany.mock.calls[0][0].cursor).toBeUndefined();

    // A full page hands back the last id to resume from.
    prisma.aiConversation.findMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const page = await svc.listConversations("u1", { limit: 2 });
    expect(page.nextCursor).toBe("b");

    await svc.listConversations("u1", { limit: 2, cursor: "b" });
    expect(prisma.aiConversation.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 2, cursor: { id: "b" }, skip: 1 }),
    );

    // The caller-supplied limit is clamped at both ends.
    await svc.listConversations("u1", { limit: 5000 });
    expect(prisma.aiConversation.findMany.mock.calls.at(-1)[0].take).toBe(100);
    await svc.listConversations("u1", { limit: 0 });
    expect(prisma.aiConversation.findMany.mock.calls.at(-1)[0].take).toBe(1);
  });
});
