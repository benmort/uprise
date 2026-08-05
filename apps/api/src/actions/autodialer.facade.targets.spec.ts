import { DefaultAutodialerFacade } from "./autodialer.facade";

/**
 * Member targeting through the public facade: the client only ever sends an
 * id, and it must be pinned OR (chooser on) match the campaign's narrowed
 * pool. Identity flows out (photo included); numbers never do.
 */

const MP = {
  id: "p1",
  name: "Alex Example",
  party: "Australian Labor Party",
  electorate: "Wills",
  imageUrl: "https://blob/mp.jpg",
  imageCredit: "Commons / Author",
  phone: "+61393504222",
  jurisdiction: "FEDERAL",
  chamber: "LOWER",
};

function setup(campaignOver: Record<string, unknown> = {}) {
  const campaign = {
    targetPoliticians: null,
    callerChoosesTarget: false,
    jurisdiction: "FEDERAL",
    officeTarget: "electorate",
    partyTargets: null,
    ...campaignOver,
  };
  const prisma: any = {
    dialerCampaign: { findFirst: jest.fn().mockResolvedValue(campaign) },
    politician: {
      findUnique: jest.fn().mockResolvedValue(MP),
      findFirst: jest.fn().mockResolvedValue({ id: MP.id }),
      findMany: jest.fn().mockResolvedValue([MP]),
    },
  };
  const facade = new DefaultAutodialerFacade(prisma, {} as never, {} as never, {} as never, {
    get: () => "",
  } as never);
  return { facade, prisma };
}

const input = (over: Record<string, unknown> = {}) =>
  ({
    tenantId: "t1",
    campaignId: "dc1",
    actionPageId: "ap1",
    supporter: {},
    embedAncestor: null,
    clientIp: null,
    ...over,
  }) as never;

describe("resolveChosenTarget (via facade internals)", () => {
  const resolve = (facade: DefaultAutodialerFacade, i: unknown) =>
    (facade as unknown as { resolveChosenTarget: (x: unknown) => Promise<unknown> }).resolveChosenTarget(i);

  it("a pinned member's id is allowed", async () => {
    const { facade } = setup({ targetPoliticians: [{ id: "p1", name: "Alex Example" }] });
    const row = (await resolve(facade, input({ targetPoliticianId: "p1" }))) as typeof MP;
    expect(row.name).toBe("Alex Example");
  });

  it("an unpinned id is refused when callers may not choose", async () => {
    const { facade } = setup({ targetPoliticians: [{ id: "other", name: "Someone Else" }] });
    await expect(resolve(facade, input({ targetPoliticianId: "p1" }))).rejects.toMatchObject({
      response: { error: { code: "TARGET_NOT_ALLOWED" } },
    });
  });

  it("chooser mode allows an id only when it matches the narrowed pool", async () => {
    const { facade, prisma } = setup({ callerChoosesTarget: true, partyTargets: ["Australian Greens"] });
    prisma.politician.findFirst.mockResolvedValue(null); // filters exclude the member
    await expect(resolve(facade, input({ targetPoliticianId: "p1" }))).rejects.toMatchObject({
      response: { error: { code: "TARGET_NOT_ALLOWED" } },
    });
    prisma.politician.findFirst.mockResolvedValue({ id: "p1" });
    const row = (await resolve(facade, input({ targetPoliticianId: "p1" }))) as typeof MP;
    expect(row.id).toBe("p1");
  });

  it("a single pinned member is the implicit target when none is sent", async () => {
    const { facade } = setup({ targetPoliticians: [{ id: "p1", name: "Alex Example" }] });
    const row = (await resolve(facade, input())) as typeof MP;
    expect(row.id).toBe("p1");
  });

  it("multiple pinned members with no choice resolve to nothing (the caller must pick)", async () => {
    const { facade } = setup({
      targetPoliticians: [
        { id: "p1", name: "A" },
        { id: "p2", name: "B" },
      ],
    });
    expect(await resolve(facade, input())).toBeNull();
  });
});

describe("searchPublicTargets", () => {
  it("returns nothing unless the campaign lets callers choose", async () => {
    const { facade } = setup({ callerChoosesTarget: false });
    expect(await facade.searchPublicTargets("t1", "dc1", "wills")).toEqual([]);
  });

  it("matches member OR electorate and returns identity only — never a number", async () => {
    const { facade, prisma } = setup({ callerChoosesTarget: true });
    const rows = await facade.searchPublicTargets("t1", "dc1", "wills");
    const where = prisma.politician.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("electorate");
    expect(rows[0]).toEqual({
      id: "p1",
      name: "Alex Example",
      party: "Australian Labor Party",
      electorate: "Wills",
      imageUrl: "https://blob/mp.jpg",
      imageCredit: "Commons / Author",
    });
    expect(JSON.stringify(rows)).not.toContain("+61393504222");
  });
});

describe("getPublicTargets", () => {
  it("hydrates pinned snapshots with live identity in snapshot order", async () => {
    const { facade } = setup({
      targetPoliticians: [
        { id: "gone", name: "Retired Member" },
        { id: "p1", name: "Alex Example" },
      ],
      callerChoosesTarget: true,
    });
    const out = await facade.getPublicTargets("t1", "dc1");
    expect(out.chooser).toBe(true);
    expect(out.targets.map((t) => t.name)).toEqual(["Retired Member", "Alex Example"]);
    expect(out.targets[1].imageUrl).toBe("https://blob/mp.jpg");
    expect(out.targets[0].imageUrl).toBeNull();
  });
});
