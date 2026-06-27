import { Prisma } from "@uprise/db";
import { WebhookEventService } from "./webhook-event.service";

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6.19.3" });
}

describe("WebhookEventService", () => {
  it("claims a new (provider, eventId) → true", async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    await expect(new WebhookEventService(prisma).claim("sendgrid", "e1")).resolves.toBe(true);
    expect(prisma.webhookEvent.create).toHaveBeenCalledWith({ data: { provider: "sendgrid", eventId: "e1" } });
  });

  it("returns false on a duplicate (P2002)", async () => {
    const prisma = { webhookEvent: { create: jest.fn().mockRejectedValue(p2002()) } } as any;
    await expect(new WebhookEventService(prisma).claim("sendgrid", "e1")).resolves.toBe(false);
  });

  it("lets an event with no id through without a claim", async () => {
    const prisma = { webhookEvent: { create: jest.fn() } } as any;
    await expect(new WebhookEventService(prisma).claim("sendgrid", "")).resolves.toBe(true);
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("rethrows non-P2002 errors", async () => {
    const prisma = { webhookEvent: { create: jest.fn().mockRejectedValue(new Error("db down")) } } as any;
    await expect(new WebhookEventService(prisma).claim("sendgrid", "e1")).rejects.toThrow("db down");
  });
});
