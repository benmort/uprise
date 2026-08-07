import { AudienceKind } from "@uprise/db";
import { orderByHash } from "@uprise/segmentation";
import { AudienceRecipientsResolver } from "./audience-recipients.resolver";

/**
 * The one place blasts and the dialler agree on "who is in this audience, in
 * what order". `resolvePhoneRecipients` hydrates full Contact rows for the
 * blast sender; `resolveOrderedMembers` returns identity only so the dialler's
 * pacing tick can walk the SAME membership in windows without materialising
 * the audience. The contract these specs defend is that the two never fork –
 * same members, same order, same staleness re-evaluation.
 */

const SEED = "seed-alpha";

function makePrisma() {
  return {
    audience: { findFirst: jest.fn().mockResolvedValue({ kind: AudienceKind.STATIC }) },
    audienceSegment: { findMany: jest.fn().mockResolvedValue([]) },
    audienceSegmentMember: { findMany: jest.fn().mockResolvedValue([]) },
    audienceContact: { findMany: jest.fn().mockResolvedValue([]) },
    contactConsent: { findMany: jest.fn().mockResolvedValue([]) },
    contact: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

function makeResolver(prisma: any, evaluator?: any) {
  const config = { get: jest.fn().mockReturnValue(undefined) } as any;
  return new AudienceRecipientsResolver(prisma, config, evaluator);
}

/** A dynamic-segment audience of `n` contacts, each with a phone. */
function seedDynamic(prisma: any, ids: string[], segment: Record<string, unknown> = {}) {
  prisma.audience.findFirst.mockResolvedValue({ kind: AudienceKind.DYNAMIC_SEGMENT });
  prisma.audienceSegment.findMany.mockResolvedValue([
    { id: "seg1", seed: SEED, lastEvaluatedAt: new Date(), ...segment },
  ]);
  prisma.audienceSegmentMember.findMany.mockResolvedValue(ids.map((contactId) => ({ contactId })));
  prisma.contact.findMany.mockImplementation(async ({ where }: any) =>
    (where.id.in as string[]).map((id) => ({
      id,
      phoneE164: `+6149157${id.slice(1).padStart(4, "0")}`,
      metadata: {},
    })),
  );
}

describe("AudienceRecipientsResolver", () => {
  describe("resolveOrderedMembers", () => {
    it("returns dynamic-segment membership as contact ids in the SAME hash order the blast sender resolves, without hydrating Contact rows", async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
      const prisma = makePrisma();
      seedDynamic(prisma, ids);
      const resolver = makeResolver(prisma);

      const order = await resolver.resolveOrderedMembers("t1", "aud1");

      const hashOrder = orderByHash(ids, SEED);
      expect(hashOrder).not.toEqual(ids); // the seed really does reshuffle
      expect(order).toEqual({ kind: "contactIds", contactIds: hashOrder });
      // The whole point of the windowed walk: identity only, no Contact spine.
      expect(prisma.contact.findMany).not.toHaveBeenCalled();

      // …and the hydrating path agrees, contact for contact, position for position.
      const recipients = await resolver.resolvePhoneRecipients("t1", "aud1");
      expect(recipients.map((r) => r.contactId)).toEqual(hashOrder);
    });

    it("re-evaluates a STALE v2 seeded segment inline, exactly as the blast path does", async () => {
      const prisma = makePrisma();
      const evaluator = { evaluate: jest.fn().mockResolvedValue(undefined) };
      seedDynamic(prisma, ["c1"], { lastEvaluatedAt: new Date(Date.now() - 60 * 60_000) });
      const resolver = makeResolver(prisma, evaluator);

      await resolver.resolveOrderedMembers("t1", "aud1");

      expect(evaluator.evaluate).toHaveBeenCalledWith("seg1");
    });

    it("leaves a freshly-evaluated segment alone", async () => {
      const prisma = makePrisma();
      const evaluator = { evaluate: jest.fn() };
      seedDynamic(prisma, ["c1"], { lastEvaluatedAt: new Date() });
      const resolver = makeResolver(prisma, evaluator);

      await resolver.resolveOrderedMembers("t1", "aud1");

      expect(evaluator.evaluate).not.toHaveBeenCalled();
    });

    it("keeps legacy unseeded dynamic segments in evaluator order and never re-evaluates them", async () => {
      const prisma = makePrisma();
      const evaluator = { evaluate: jest.fn() };
      prisma.audience.findFirst.mockResolvedValue({ kind: AudienceKind.DYNAMIC_SEGMENT });
      prisma.audienceSegment.findMany.mockResolvedValue([
        { id: "legacy1", seed: null, lastEvaluatedAt: null },
        { id: "legacy2", seed: null, lastEvaluatedAt: null },
      ]);
      prisma.audienceSegmentMember.findMany.mockResolvedValue([
        { contactId: "cB" },
        { contactId: "cA" },
        { contactId: "cB" }, // duplicate membership across the two segments
      ]);
      const resolver = makeResolver(prisma, evaluator);

      const order = await resolver.resolveOrderedMembers("t1", "aud1");

      expect(order).toEqual({ kind: "contactIds", contactIds: ["cB", "cA"] });
      expect(evaluator.evaluate).not.toHaveBeenCalled();
    });

    it("materialises a WHATSAPP_OPTED_IN audience from consent, deduped by phone", async () => {
      const prisma = makePrisma();
      prisma.audience.findFirst.mockResolvedValue({ kind: AudienceKind.WHATSAPP_OPTED_IN });
      prisma.contactConsent.findMany.mockResolvedValue([
        { phoneE164: "+61491570001", contactId: "c1" },
        { phoneE164: "+61491570002", contactId: null },
        { phoneE164: "+61491570001", contactId: "c9" }, // same number, later row wins
      ]);
      const resolver = makeResolver(prisma);

      const order = await resolver.resolveOrderedMembers("t1", "aud1");

      expect(order).toEqual({
        kind: "members",
        members: [
          { phoneE164: "+61491570001", contactId: "c9" },
          { phoneE164: "+61491570002", contactId: undefined },
        ],
      });
      expect(prisma.audienceSegment.findMany).not.toHaveBeenCalled();
    });

    it("reads a static audience in creation order and drops uncontactable rows, matching the blast path member for member", async () => {
      const prisma = makePrisma();
      prisma.audience.findFirst.mockResolvedValue({ kind: AudienceKind.STATIC });
      prisma.audienceContact.findMany.mockResolvedValue([
        { contactId: "c1", phoneE164: "+61491570001", metadata: {} },
        { contactId: null, phoneE164: "not-a-number", metadata: {} },
        { contactId: "c3", phoneE164: "+61491570003", metadata: { contactable: false } },
        { contactId: "c4", phoneE164: "+61491570004", metadata: null },
      ]);
      const resolver = makeResolver(prisma);

      const order = await resolver.resolveOrderedMembers("t1", "aud1");

      expect(order).toEqual({
        kind: "members",
        members: [
          { contactId: "c1", phoneE164: "+61491570001" },
          { contactId: "c4", phoneE164: "+61491570004" },
        ],
      });
      expect(prisma.audienceContact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "asc" } }),
      );

      const recipients = await resolver.resolvePhoneRecipients("t1", "aud1");
      expect(recipients.map((r) => r.phoneE164)).toEqual(
        (order as { members: Array<{ phoneE164: string }> }).members.map((m) => m.phoneE164),
      );
    });
  });
});
