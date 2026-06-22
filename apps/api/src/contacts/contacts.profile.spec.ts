import { ContactsService } from "./contacts.service";

describe("ContactsService.getProfile", () => {
  let prisma: any;
  let service: ContactsService;

  beforeEach(() => {
    prisma = {
      contact: { findFirst: jest.fn(), findMany: jest.fn() },
      inboundMessage: { findMany: jest.fn().mockResolvedValue([]) },
      outboundMessage: { findMany: jest.fn().mockResolvedValue([]) },
      disposition: { findMany: jest.fn().mockResolvedValue([]) },
      doorKnock: { findMany: jest.fn().mockResolvedValue([]) },
      questionResponse: { findMany: jest.fn().mockResolvedValue([]) },
      contactSourceRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ContactsService(prisma);
  });

  it("returns null for an unknown contact", async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    expect(await service.getProfile("org1", "missing")).toBeNull();
  });

  it("merges knocks + texts into one reverse-chron timeline", async () => {
    prisma.contact.findFirst.mockResolvedValue({
      id: "c1",
      firstName: "Ada",
      lastName: "Lovelace",
      phoneE164: "+61400000000",
      email: null,
      address: "1 Pitt St",
      lat: null,
      lng: null,
      turf: { id: "t1", name: "Inner West" },
      audienceContacts: [{ audience: { id: "a1", name: "Volunteers" } }],
    });
    prisma.inboundMessage.findMany.mockResolvedValue([
      { id: "in1", receivedAt: new Date("2026-06-10"), body: "Hi", fromPhone: "x", toPhone: "y", blastId: null },
    ]);
    prisma.doorKnock.findMany.mockResolvedValue([
      { id: "dk1", createdAt: new Date("2026-06-12"), dispositionCode: "SPOKE", lat: null, lng: null, notes: null, safetyFlag: null, canvasser: { id: "u1", displayName: "Sam" } },
    ]);
    prisma.contactSourceRecord.findMany.mockResolvedValue([
      { id: "sr1", sourceSystem: "action_network", externalId: "an:1", createdAt: new Date("2026-06-09") },
    ]);
    const profile = await service.getProfile("org1", "c1");
    expect(profile).not.toBeNull();
    expect(profile!.timeline[0].kind).toBe("knock"); // newest first
    expect(profile!.timeline[1].kind).toBe("text_in");
    expect(profile!.audiences).toEqual([{ id: "a1", name: "Volunteers" }]);
    expect(profile!.sources).toEqual([
      { id: "sr1", sourceSystem: "action_network", externalId: "an:1", at: new Date("2026-06-09") },
    ]);
    expect(profile!.nextAction?.type).toBe("followup");
  });

  it("search returns empty for blank query", async () => {
    expect(await service.search("org1", "  ")).toEqual([]);
  });
});
