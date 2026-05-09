import { ConfigService } from "@nestjs/config";
import { AudiencesService } from "./audiences.service";

describe("AudiencesService integration-like flow", () => {
  it("imports csv contacts and returns row stats", async () => {
    const prismaMock: any = {
      organization: {
        upsert: jest.fn().mockResolvedValue({ id: "org_1", slug: "default" }),
      },
      audience: {
        findFirst: jest.fn().mockResolvedValue({ id: "aud_1", organizationId: "org_1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      audienceContact: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      audienceImport: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const configMock = {
      get: (_: string, fallback?: string) => fallback ?? "default",
    } as ConfigService;

    const service = new AudiencesService(prismaMock, configMock);
    const result = await service.importCsv(
      "aud_1",
      "contacts.csv",
      "name,phone,city\nAlice,+15551234567,Sydney\nBob,+15557654321,Melbourne",
    );

    expect(result.totalRows).toBe(2);
    expect(result.importedRows).toBe(2);
    expect(prismaMock.audienceContact.upsert).toHaveBeenCalledTimes(2);
  });
});
