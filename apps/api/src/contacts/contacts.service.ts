import { Injectable } from "@nestjs/common";
import { Contact, Prisma } from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeAddress } from "../common/utils/address.utils";

export type ContactSeed = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve (or create) the single Contact for an org + normalised phone.
   * The (org, phoneE164) uniqueness is a partial index Prisma can't target with
   * upsert(), so we find-then-create and treat a P2002 as a concurrent insert.
   */
  async getOrCreateByPhone(
    organizationId: string,
    phoneE164: string,
    seed?: ContactSeed,
  ): Promise<Contact> {
    const existing = await this.prisma.contact.findFirst({
      where: { organizationId, phoneE164 },
    });
    if (existing) return this.enrich(existing, seed);

    try {
      return await this.prisma.contact.create({
        data: { organizationId, phoneE164, ...this.seedData(seed) },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const raced = await this.prisma.contact.findFirst({
        where: { organizationId, phoneE164 },
      });
      if (raced) return this.enrich(raced, seed);
      throw error;
    }
  }

  /**
   * Resolve (or create) the single Contact for an org + normalised address.
   * Returns null when the address normalises to empty (nothing to dedup on).
   */
  async getOrCreateByAddress(
    organizationId: string,
    rawAddress: string,
    seed?: ContactSeed,
  ): Promise<Contact | null> {
    const addressNorm = normalizeAddress(rawAddress);
    if (!addressNorm) return null;

    const existing = await this.prisma.contact.findFirst({
      where: { organizationId, addressNorm },
    });
    if (existing) return this.enrich(existing, { ...seed, address: rawAddress });

    try {
      return await this.prisma.contact.create({
        data: {
          organizationId,
          addressNorm,
          address: rawAddress,
          ...this.seedData(seed),
        },
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const raced = await this.prisma.contact.findFirst({
        where: { organizationId, addressNorm },
      });
      if (raced) return this.enrich(raced, { ...seed, address: rawAddress });
      throw error;
    }
  }

  /**
   * Resolve a Contact from whatever identifiers are present. When both phone and
   * address resolve to *different* existing contacts, merge address → phone so a
   * single timeline survives.
   */
  async dedupUpsert(
    organizationId: string,
    identity: { phoneE164?: string | null; address?: string | null; seed?: ContactSeed },
  ): Promise<Contact | null> {
    const byPhone = identity.phoneE164
      ? await this.getOrCreateByPhone(organizationId, identity.phoneE164, identity.seed)
      : null;
    const byAddress = identity.address
      ? await this.getOrCreateByAddress(organizationId, identity.address, identity.seed)
      : null;

    if (byPhone && byAddress && byPhone.id !== byAddress.id) {
      return this.mergeContacts(organizationId, byPhone.id, byAddress.id);
    }
    return byPhone ?? byAddress;
  }

  /**
   * Re-point every relation from `duplicateId` onto `primaryId`, union metadata
   * and fill blank primary fields, then delete the duplicate. This is the
   * timeline merge: door + text history collapses onto one person.
   */
  async mergeContacts(
    organizationId: string,
    primaryId: string,
    duplicateId: string,
  ): Promise<Contact> {
    if (primaryId === duplicateId) {
      const same = await this.prisma.contact.findFirst({
        where: { id: primaryId, organizationId },
      });
      if (!same) throw new Error(`Contact ${primaryId} not found`);
      return same;
    }

    return this.prisma.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.contact.findFirst({ where: { id: primaryId, organizationId } }),
        tx.contact.findFirst({ where: { id: duplicateId, organizationId } }),
      ]);
      if (!primary) throw new Error(`Contact ${primaryId} not found`);
      if (!duplicate) throw new Error(`Contact ${duplicateId} not found`);

      // A duplicate may own the same partial-unique values; clear them first so
      // re-pointing the primary's missing fields can't collide.
      await tx.contact.update({
        where: { id: duplicateId },
        data: { phoneE164: null, addressNorm: null },
      });

      await Promise.all([
        tx.audienceContact.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
        tx.blastRecipient.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
        tx.inboundMessage.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
        tx.outboundMessage.updateMany({ where: { contactId: duplicateId }, data: { contactId: primaryId } }),
      ]);

      // ConversationState is keyed per (phone, channel); the duplicate's phone
      // differs from the primary's, so re-pointing contactId can't collide.
      await tx.conversationState.updateMany({
        where: { contactId: duplicateId },
        data: { contactId: primaryId },
      });

      const mergedMetadata = this.mergeMetadata(primary.metadata, duplicate.metadata);
      const updated = await tx.contact.update({
        where: { id: primaryId },
        data: {
          phoneE164: primary.phoneE164 ?? duplicate.phoneE164,
          addressNorm: primary.addressNorm ?? duplicate.addressNorm,
          firstName: primary.firstName ?? duplicate.firstName,
          lastName: primary.lastName ?? duplicate.lastName,
          email: primary.email ?? duplicate.email,
          address: primary.address ?? duplicate.address,
          lat: primary.lat ?? duplicate.lat,
          lng: primary.lng ?? duplicate.lng,
          turfId: primary.turfId ?? duplicate.turfId,
          metadata: mergedMetadata as Prisma.InputJsonValue,
        },
      });

      await tx.contact.delete({ where: { id: duplicateId } });
      return updated;
    });
  }

  /**
   * The merged message timeline for a contact, oldest first.
   */
  async getTimeline(organizationId: string, contactId: string) {
    const [inbound, outbound] = await Promise.all([
      this.prisma.inboundMessage.findMany({
        where: { organizationId, contactId },
        orderBy: { receivedAt: "asc" },
      }),
      this.prisma.outboundMessage.findMany({
        where: { organizationId, contactId },
        orderBy: { sentAt: "asc" },
      }),
    ]);

    return [
      ...inbound.map((m) => ({
        id: m.id,
        type: "inbound" as const,
        at: m.receivedAt,
        body: m.body,
        from: m.fromPhone,
        to: m.toPhone,
        blastId: m.blastId,
      })),
      ...outbound.map((m) => ({
        id: m.id,
        type: "outbound" as const,
        at: m.sentAt,
        body: m.body,
        from: m.fromPhone,
        to: m.toPhone,
        blastId: m.blastId,
      })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /**
   * Full contact profile for the spine UI: the merged door+text timeline,
   * disposition history, latest survey answers, audience memberships and a
   * derived next-action hint.
   */
  async getProfile(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      include: {
        turf: { select: { id: true, name: true } },
        audienceContacts: { include: { audience: { select: { id: true, name: true } } } },
      },
    });
    if (!contact) return null;

    const [timeline, dispositions, knocks, responses] = await Promise.all([
      this.getTimeline(organizationId, contactId),
      this.prisma.disposition.findMany({
        where: { organizationId, contactId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.doorKnock.findMany({
        where: { organizationId, contactId },
        orderBy: { createdAt: "asc" },
        include: { canvasser: { select: { id: true, displayName: true } } },
      }),
      this.prisma.questionResponse.findMany({
        where: { organizationId, contactId },
        orderBy: { createdAt: "desc" },
        include: {
          question: { select: { id: true, prompt: true } },
          option: { select: { id: true, label: true, supportLevel: true } },
        },
      }),
    ]);

    const mergedTimeline = [
      ...timeline.map((t) => ({
        id: t.id,
        kind: t.type === "inbound" ? ("text_in" as const) : ("text_out" as const),
        at: t.at,
        body: t.body,
        from: t.from,
        to: t.to,
        blastId: t.blastId,
      })),
      ...knocks.map((k) => ({
        id: k.id,
        kind: "knock" as const,
        at: k.createdAt,
        dispositionCode: k.dispositionCode,
        lat: k.lat,
        lng: k.lng,
        notes: k.notes,
        safetyFlag: k.safetyFlag,
        canvasser: k.canvasser ? { id: k.canvasser.id, name: k.canvasser.displayName } : null,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    const latestSupport = dispositions.find((d) => d.supportLevel)?.supportLevel ?? null;
    const lastEvent = mergedTimeline[0] ?? null;
    const nextAction = this.deriveNextAction(lastEvent, dispositions);

    return {
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null,
        phoneE164: contact.phoneE164,
        email: contact.email,
        address: contact.address,
        lat: contact.lat,
        lng: contact.lng,
        turf: contact.turf,
        supportLevel: latestSupport,
      },
      timeline: mergedTimeline,
      dispositions: dispositions.map((d) => ({
        id: d.id,
        code: d.code,
        layer: d.layer,
        channel: d.channel,
        supportLevel: d.supportLevel,
        at: d.createdAt,
      })),
      surveyResponses: responses.map((r) => ({
        id: r.id,
        questionId: r.questionId,
        prompt: r.question?.prompt ?? null,
        optionLabel: r.option?.label ?? r.valueText ?? null,
        supportLevel: r.option?.supportLevel ?? null,
        at: r.createdAt,
      })),
      audiences: contact.audienceContacts
        .filter((ac) => ac.audience)
        .map((ac) => ({ id: ac.audience!.id, name: ac.audience!.name })),
      nextAction,
    };
  }

  /** Search contacts by name or phone within an org. */
  async search(organizationId: string, query: string, limit = 20) {
    const q = query.trim();
    if (!q) return [];
    const contacts = await this.prisma.contact.findMany({
      where: {
        organizationId,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phoneE164: { contains: q } },
          { address: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneE164: true,
        address: true,
      },
    });
    return contacts.map((c) => ({
      id: c.id,
      fullName: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
      phoneE164: c.phoneE164,
      address: c.address,
    }));
  }

  private deriveNextAction(
    lastEvent: { kind: string; at: Date } | null,
    dispositions: Array<{ code: string; isTerminal?: boolean }>,
  ): { type: string; label: string } | null {
    if (!lastEvent) {
      return { type: "first_contact", label: "No contact yet — queue a first knock or text" };
    }
    if (lastEvent.kind === "text_in") {
      return { type: "reply", label: "Awaiting reply — respond in the inbox" };
    }
    if (lastEvent.kind === "knock") {
      return { type: "followup", label: "Recently knocked — follow up with a text" };
    }
    return { type: "followup", label: "Queue a follow-up" };
  }

  private seedData(seed?: ContactSeed): Partial<Prisma.ContactUncheckedCreateInput> {
    if (!seed) return {};
    const { firstName, lastName } = this.resolveName(seed);
    const data: Partial<Prisma.ContactUncheckedCreateInput> = {};
    if (firstName != null) data.firstName = firstName;
    if (lastName != null) data.lastName = lastName;
    if (seed.email != null) data.email = seed.email;
    if (seed.address != null) data.address = seed.address;
    if (seed.lat != null) data.lat = seed.lat;
    if (seed.lng != null) data.lng = seed.lng;
    if (seed.metadata !== undefined) data.metadata = seed.metadata;
    return data;
  }

  /** Fill only blank fields on an existing contact from the seed (non-destructive). */
  private async enrich(contact: Contact, seed?: ContactSeed): Promise<Contact> {
    if (!seed) return contact;
    const { firstName, lastName } = this.resolveName(seed);
    const data: Prisma.ContactUpdateInput = {};
    if (!contact.firstName && firstName) data.firstName = firstName;
    if (!contact.lastName && lastName) data.lastName = lastName;
    if (!contact.email && seed.email) data.email = seed.email;
    if (!contact.address && seed.address) data.address = seed.address;
    if (contact.lat == null && seed.lat != null) data.lat = seed.lat;
    if (contact.lng == null && seed.lng != null) data.lng = seed.lng;
    if (Object.keys(data).length === 0) return contact;
    return this.prisma.contact.update({ where: { id: contact.id }, data });
  }

  private resolveName(seed: ContactSeed): { firstName: string | null; lastName: string | null } {
    if (seed.firstName != null || seed.lastName != null) {
      return { firstName: seed.firstName ?? null, lastName: seed.lastName ?? null };
    }
    const full = (seed.fullName ?? "").trim();
    if (!full) return { firstName: null, lastName: null };
    const [first, ...rest] = full.split(/\s+/);
    return { firstName: first, lastName: rest.length ? rest.join(" ") : null };
  }

  private mergeMetadata(
    primary: Prisma.JsonValue | null,
    duplicate: Prisma.JsonValue | null,
  ): Record<string, unknown> {
    const a = primary && typeof primary === "object" && !Array.isArray(primary) ? primary : {};
    const b = duplicate && typeof duplicate === "object" && !Array.isArray(duplicate) ? duplicate : {};
    return { ...(b as object), ...(a as object) };
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
