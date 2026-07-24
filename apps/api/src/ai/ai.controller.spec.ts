import { AiController } from "./ai.controller";
import { AiChatDto } from "./dto/ai-chat.dto";

describe("AiController", () => {
  const service = {
    chat: jest.fn(async () => ({ conversationId: "c1", reply: "hi" })),
    listConversations: jest.fn(async () => ({ conversations: [] })),
    getConversation: jest.fn(async () => ({ id: "c1", title: "t", messages: [] })),
    deleteConversation: jest.fn(async () => ({ deleted: true })),
  };
  const controller = new AiController(service as never);
  const req = { user: { id: "u1" } } as never;

  it("delegates each route with the caller's user id", async () => {
    const dto = Object.assign(new AiChatDto(), { message: "hello" });
    await controller.chat(dto, req);
    expect(service.chat).toHaveBeenCalledWith("u1", dto);

    await controller.list(req);
    expect(service.listConversations).toHaveBeenCalledWith("u1");

    await controller.get("c1", req);
    expect(service.getConversation).toHaveBeenCalledWith("u1", "c1");

    await controller.remove("c1", req);
    expect(service.deleteConversation).toHaveBeenCalledWith("u1", "c1");
  });
});
