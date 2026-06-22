import { ProfileService } from "./profile.service";

function setup() {
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: "u1", displayName: "Ada" })) },
    userProfile: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ ...data })),
      upsert: jest.fn(async ({ create }: any) => ({ ...create })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    userAvatar: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: any) => ({ id: "av1", ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn(async () => ({ count: 2 })),
      delete: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const svc = new ProfileService(prisma);
  return { svc, prisma };
}

describe("ProfileService", () => {
  it("seeds a profile from the User identity on first read", async () => {
    const { svc, prisma } = setup();
    const profile = await svc.getProfile("u1");
    expect(prisma.userProfile.create).toHaveBeenCalledWith({
      data: { userId: "u1", displayName: "Ada" },
    });
    expect(profile.displayName).toBe("Ada");
  });

  it("upserts profile fields", async () => {
    const { svc, prisma } = setup();
    await svc.upsertProfile("u1", { givenName: "Ada", familyName: "Lovelace", bio: "Maths" });
    expect(prisma.userProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        create: expect.objectContaining({ userId: "u1", givenName: "Ada", familyName: "Lovelace", bio: "Maths" }),
      }),
    );
  });

  it("the first avatar a user adds becomes the selected one", async () => {
    const { svc, prisma } = setup();
    prisma.userAvatar.count.mockResolvedValueOnce(0);
    const avatar = await svc.addAvatar("u1", "https://img/1");
    expect(avatar.isSelected).toBe(true);
    expect(prisma.userProfile.upsert).toHaveBeenCalled(); // mirrors avatarUrl
  });

  it("a subsequent avatar is not auto-selected", async () => {
    const { svc, prisma } = setup();
    prisma.userAvatar.count.mockResolvedValueOnce(1);
    const avatar = await svc.addAvatar("u1", "https://img/2");
    expect(avatar.isSelected).toBe(false);
  });

  it("selectAvatar flips all siblings false then the chosen one true (exactly one selected)", async () => {
    const { svc, prisma } = setup();
    prisma.userAvatar.findFirst.mockResolvedValueOnce({ id: "av2", userId: "u1", url: "https://img/2" });
    await svc.selectAvatar("u1", "av2");

    // one transaction: deselect-all + select-one + mirror url
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.userAvatar.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { isSelected: false } });
    expect(prisma.userAvatar.update).toHaveBeenCalledWith({ where: { id: "av2" }, data: { isSelected: true } });
  });

  it("selectAvatar rejects an avatar owned by another user", async () => {
    const { svc, prisma } = setup();
    prisma.userAvatar.findFirst.mockResolvedValueOnce(null);
    await expect(svc.selectAvatar("u1", "av_other")).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deleting the selected avatar promotes the next remaining one", async () => {
    const { svc, prisma } = setup();
    prisma.userAvatar.findFirst
      .mockResolvedValueOnce({ id: "av1", userId: "u1", url: "https://img/1", isSelected: true }) // target
      .mockResolvedValueOnce({ id: "av2", userId: "u1", url: "https://img/2" }); // next
    await svc.deleteAvatar("u1", "av1");
    expect(prisma.userAvatar.delete).toHaveBeenCalledWith({ where: { id: "av1" } });
    expect(prisma.userAvatar.update).toHaveBeenCalledWith({ where: { id: "av2" }, data: { isSelected: true } });
  });
});
