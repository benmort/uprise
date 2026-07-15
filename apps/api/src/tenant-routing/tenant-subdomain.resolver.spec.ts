import { ConfigService } from "@nestjs/config";
import { TenantSubdomainResolver } from "./tenant-subdomain.resolver";

function setup(base = "uprise.org.au") {
  const prisma: any = {
    tenant: { findFirst: jest.fn(async () => ({ id: "t1" })) },
  };
  const config = {
    get: jest.fn((key: string, fb?: string) => (key === "PLATFORM_BASE_DOMAIN" ? base : (fb ?? ""))),
  } as unknown as ConfigService;
  const resolver = new TenantSubdomainResolver(prisma, config);
  return { resolver, prisma, config };
}

describe("TenantSubdomainResolver", () => {
  it("resolves a bare tenant subdomain to its tenant id", async () => {
    const { resolver, prisma } = setup();
    await expect(resolver.resolve("common-threads.uprise.org.au")).resolves.toEqual({ tenantId: "t1" });
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith({
      where: { slug: "common-threads", deletedAt: null },
      select: { id: true },
    });
  });

  it("returns null for platform app hosts, the apex, and never queries", async () => {
    const { resolver, prisma } = setup();
    for (const host of ["admin.uprise.org.au", "api.uprise.org.au", "uprise.org.au", "localhost:3001"]) {
      await expect(resolver.resolve(host)).resolves.toBeNull();
    }
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for an unknown slug (and caches the miss)", async () => {
    const { resolver, prisma } = setup();
    prisma.tenant.findFirst.mockResolvedValue(null);
    await expect(resolver.resolve("nope.uprise.org.au")).resolves.toBeNull();
    await expect(resolver.resolve("nope.uprise.org.au")).resolves.toBeNull();
    expect(prisma.tenant.findFirst).toHaveBeenCalledTimes(1); // second read served from cache
  });

  it("caches a hit and re-queries after invalidate()", async () => {
    const { resolver, prisma } = setup();
    await resolver.resolve("common-threads.uprise.org.au");
    await resolver.resolve("common-threads.uprise.org.au");
    expect(prisma.tenant.findFirst).toHaveBeenCalledTimes(1);
    resolver.invalidate();
    await resolver.resolve("common-threads.uprise.org.au");
    expect(prisma.tenant.findFirst).toHaveBeenCalledTimes(2);
  });

  it("honours a staging PLATFORM_BASE_DOMAIN", async () => {
    const { resolver, prisma } = setup("dev.uprise.org.au");
    await expect(resolver.resolve("acme.dev.uprise.org.au")).resolves.toEqual({ tenantId: "t1" });
    // A prod-root host is NOT a subdomain under the staging root → no query, null.
    await expect(resolver.resolve("acme.uprise.org.au")).resolves.toBeNull();
    expect(prisma.tenant.findFirst).toHaveBeenCalledTimes(1);
  });
});
