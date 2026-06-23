import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessageTemplateService } from "./message-template.service";

describe("MessageTemplateService — undeclared-variable guard", () => {
  const config = { get: (_: string, d?: string) => d ?? "default" } as ConfigService;

  function build() {
    const prisma: any = {
      tenant: { upsert: jest.fn().mockResolvedValue({ id: "org1", slug: "default" }) },
      messageTemplate: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: "t1", ...data })),
        findFirst: jest.fn(),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: "t1", ...data })),
      },
    };
    return { prisma, service: new MessageTemplateService(prisma, config) };
  }

  it("accepts a body whose {{vars}} are all declared", async () => {
    const { prisma, service } = build();
    await service.create({ key: "welcome", body: "Hi {{name}}", variables: ["name"] });
    expect(prisma.messageTemplate.create).toHaveBeenCalled();
  });

  it("rejects a body referencing an undeclared {{var}}", async () => {
    const { service } = build();
    await expect(
      service.create({ key: "welcome", body: "Hi {{name}} aged {{age}}", variables: ["name"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("leaves the body unconstrained when no variables are declared", async () => {
    const { prisma, service } = build();
    await service.create({ key: "free", body: "Hi {{anything}}" });
    expect(prisma.messageTemplate.create).toHaveBeenCalled();
  });

  it("re-validates against existing declared variables on update", async () => {
    const { prisma, service } = build();
    prisma.messageTemplate.findFirst.mockResolvedValue({
      id: "t1",
      tenantId: "org1",
      body: "Hi {{name}}",
      variables: ["name"],
    });
    await expect(
      service.update("t1", { body: "Hi {{name}} {{surprise}}" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
