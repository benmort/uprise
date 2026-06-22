import { ConfigService } from "@nestjs/config";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { OrgProfileService } from "./org-profile.service";

const PROFILE = { id: "op1", tenantId: "t1", name: "Org" };

function setup(credentialRow?: any) {
  const prisma: any = {
    tenant: { upsert: jest.fn(async () => ({ id: "t1", slug: "default", name: "Org" })) },
    orgProfile: {
      findFirst: jest.fn(async () => PROFILE),
      create: jest.fn(async ({ data }: any) => ({ id: "op1", ...data })),
      update: jest.fn(async () => PROFILE),
    },
    orgCredential: {
      upsert: jest.fn(async ({ create }: any) => ({ id: "cred1", ...create })),
      findUnique: jest.fn(async () => credentialRow ?? null),
    },
    orgContact: {
      create: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ id: "c1", orgProfileId: "op1" })),
      update: jest.fn(async ({ data }: any) => ({ id: "c1", ...data })),
      delete: jest.fn(async () => ({})),
    },
    orgAddress: {
      create: jest.fn(async ({ data }: any) => ({ id: "a1", ...data })),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => ({ id: "a1", orgProfileId: "op1" })),
      update: jest.fn(async ({ data }: any) => ({ id: "a1", ...data })),
      delete: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (cb: any) => cb(prisma)),
  };
  const config = {
    get: jest.fn((key: string, fb?: string) =>
      key === "INTEGRATION_CREDENTIAL_SECRET" ? "test-secret-key" : fb ?? "",
    ),
  } as unknown as ConfigService;
  const outbox = { append: jest.fn() } as any;
  const crypto = new CredentialCryptoService(config);
  const svc = new OrgProfileService(prisma, config, outbox, crypto);
  return { svc, prisma, outbox, crypto };
}

describe("OrgProfileService", () => {
  it("encrypts the TFN at rest (never stores plaintext) and emits an outbox event", async () => {
    const { svc, prisma, outbox, crypto } = setup();
    await svc.setCredential({ taxFileNumber: "123456789", australianBusinessNumber: "51824753556" });

    const stored = prisma.orgCredential.upsert.mock.calls[0][0].create;
    expect(stored.taxFileNumber).not.toBe("123456789"); // encrypted blob, not plaintext
    expect(crypto.decrypt(stored.taxFileNumber)).toBe("123456789"); // round-trips
    expect(stored.australianBusinessNumber).toBe("51824753556");

    expect(outbox.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: "tenant.org-credential.updated", aggregateId: "op1" }),
    );
  });

  it("returns the credential with the TFN masked to a presence flag (never plaintext)", async () => {
    const { crypto } = setup();
    const encrypted = crypto.encrypt("987654321");
    const { svc } = setup({ id: "cred1", orgProfileId: "op1", taxFileNumber: encrypted, isRegisteredEntity: true });

    const profile = await svc.getProfile();
    expect(profile.credential).not.toBeNull();
    expect(profile.credential!).not.toHaveProperty("taxFileNumber");
    expect(profile.credential!.hasTaxFileNumber).toBe(true);
  });

  it("hasTaxFileNumber is false when no TFN is set", async () => {
    const { svc } = setup({ id: "cred1", orgProfileId: "op1", taxFileNumber: null });
    const profile = await svc.getProfile();
    expect(profile.credential!.hasTaxFileNumber).toBe(false);
  });

  it("decryptTaxFileNumber round-trips the stored TFN (backend-only)", async () => {
    const { crypto } = setup();
    const encrypted = crypto.encrypt("555000111");
    const { svc } = setup({ id: "cred1", orgProfileId: "op1", taxFileNumber: encrypted });
    expect(await svc.decryptTaxFileNumber()).toBe("555000111");
  });

  it("clears the TFN when an empty string is supplied", async () => {
    const { svc, prisma } = setup();
    await svc.setCredential({ taxFileNumber: "" });
    expect(prisma.orgCredential.upsert.mock.calls[0][0].create.taxFileNumber).toBeNull();
  });

  it("leaves the TFN untouched when omitted", async () => {
    const { svc, prisma } = setup();
    await svc.setCredential({ industry: "Nonprofit" });
    expect(prisma.orgCredential.upsert.mock.calls[0][0].create).not.toHaveProperty("taxFileNumber");
  });

  it("rejects updating a contact that does not belong to the org", async () => {
    const { svc, prisma } = setup();
    prisma.orgContact.findFirst.mockResolvedValueOnce(null);
    await expect(svc.updateContact("c_other", { email: "x@y.z" })).rejects.toThrow();
    expect(prisma.orgContact.update).not.toHaveBeenCalled();
  });

  it("adds a contact under the resolved org profile", async () => {
    const { svc, prisma } = setup();
    await svc.addContact({ firstName: "Ada", isPrimaryContact: true });
    expect(prisma.orgContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgProfileId: "op1", firstName: "Ada", isPrimaryContact: true }) }),
    );
  });
});
