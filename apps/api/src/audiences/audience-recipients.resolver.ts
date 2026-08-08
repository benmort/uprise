import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AudienceKind,
  AudienceSegmentType,
  ConsentState,
  MessageChannel,
  Prisma,
} from "@uprise/db";
import { orderByHash } from "@uprise/segmentation";
import { PrismaService } from "../prisma/prisma.service";
import { SegmentEvaluatorService } from "./segment-evaluator.service";

/** One resolvable audience member with a phone. */
export type AudienceRecipient = {
  contactId?: string;
  phoneE164: string;
  metadata: Record<string, unknown>;
};

/**
 * Ordered member identity only – no Contact hydration. Windowed consumers
 * (the dialler's dispatch tick) walk this order in slices and hydrate each
 * slice themselves, so a pacing tick never materialises the whole audience.
 *
 *   - `contactIds`: a dynamic-segment audience – ids in the v2 deterministic
 *     hash order (or evaluator order for legacy segments); the consumer
 *     resolves each window against the Contact spine.
 *   - `members`: a static or WHATSAPP_OPTED_IN audience – phones are already
 *     on the membership rows, deduped in the same order
 *     `resolvePhoneRecipients` would produce.
 */
export type AudienceMemberOrder =
  | { kind: "contactIds"; contactIds: string[] }
  | { kind: "members"; members: Array<{ contactId?: string; phoneE164: string }> };

/**
 * Audience-membership → phone-recipient resolution, extracted verbatim from
 * BlastsService.getBlastRecipients so the autodialer's dial engine and the
 * blast sender resolve the SAME membership the same way:
 *
 *   - WHATSAPP_OPTED_IN audiences materialise from consent, not a stored list;
 *   - dynamic-segment audiences read the materialised AudienceSegmentMember set
 *     (re-evaluating a stale v2 seeded segment inline, preserving the
 *     deterministic hash order so preview == send);
 *   - static audiences read AudienceContact in creation order.
 *
 * Consent/channel gating is deliberately NOT here — it is channel-specific
 * (SMS/WhatsApp rules live in blasts; VOICE opt-out exclusion in the dialler).
 *
 * BlastsService COMPOSES an instance from its own constructor deps (so its
 * positional-construction specs keep working); the dialler INJECTS the
 * DI-provided instance from AudiencesModule. Same class, one behaviour.
 */
@Injectable()
export class AudienceRecipientsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly segmentEvaluator?: SegmentEvaluatorService,
  ) {}

  async resolvePhoneRecipients(tenantId: string, audienceId: string): Promise<AudienceRecipient[]> {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
      select: { kind: true },
    });
    const dedup = new Map<string, AudienceRecipient>();

    if (audience?.kind === AudienceKind.WHATSAPP_OPTED_IN) {
      // Dynamic "all WhatsApp opt-ins" audience: members are computed from consent,
      // not a stored AudienceContact list.
      const optIns = await this.prisma.contactConsent.findMany({
        where: {
          tenantId,
          channel: MessageChannel.WHATSAPP,
          state: ConsentState.OPTED_IN,
        },
        select: { phoneE164: true, contactId: true },
      });
      for (const c of optIns) {
        dedup.set(c.phoneE164, { contactId: c.contactId ?? undefined, phoneE164: c.phoneE164, metadata: {} });
      }
      return Array.from(dedup.values());
    }

    const dynamicSegments = await this.loadDynamicSegments(tenantId, audienceId);

    if (dynamicSegments.length > 0) {
      const contactIds = await this.orderedSegmentContactIds(dynamicSegments);
      if (contactIds.length > 0) {
        const contacts = await this.prisma.contact.findMany({
          where: { id: { in: contactIds }, tenantId, phoneE164: { not: null } },
          select: { id: true, phoneE164: true, metadata: true },
        });
        // Insert in contactIds order (hash order for v2) — the dedup Map's
        // insertion order becomes recipient-creation order downstream.
        const byId = new Map(contacts.map((c) => [c.id, c]));
        for (const id of contactIds) {
          const c = byId.get(id);
          if (!c?.phoneE164) continue;
          dedup.set(c.phoneE164, {
            contactId: c.id,
            phoneE164: c.phoneE164,
            metadata: (c.metadata as Record<string, unknown>) || {},
          });
        }
      }
    } else {
      const contacts = await this.prisma.audienceContact.findMany({
        where: { audienceId },
        orderBy: { createdAt: "asc" },
      });
      for (const contact of contacts) {
        if (!isContactable(contact)) continue;
        dedup.set(contact.phoneE164, {
          // Point at the persistent Contact spine, not the per-audience row.
          // Null until backfill populates AudienceContact.contactId.
          contactId: contact.contactId ?? undefined,
          phoneE164: contact.phoneE164,
          metadata: (contact.metadata as Record<string, unknown>) || {},
        });
      }
    }

    return Array.from(dedup.values());
  }

  /**
   * Ordered member identity WITHOUT hydrating Contact rows – the windowed
   * counterpart of `resolvePhoneRecipients`, resolving exactly the SAME
   * membership in exactly the same order (the staleness re-evaluation and
   * hash ordering are shared via `orderedSegmentContactIds`, so the blast
   * and dialler contracts cannot fork).
   */
  async resolveOrderedMembers(tenantId: string, audienceId: string): Promise<AudienceMemberOrder> {
    const audience = await this.prisma.audience.findFirst({
      where: { id: audienceId, tenantId },
      select: { kind: true },
    });

    if (audience?.kind === AudienceKind.WHATSAPP_OPTED_IN) {
      const optIns = await this.prisma.contactConsent.findMany({
        where: {
          tenantId,
          channel: MessageChannel.WHATSAPP,
          state: ConsentState.OPTED_IN,
        },
        select: { phoneE164: true, contactId: true },
      });
      const dedup = new Map<string, { contactId?: string; phoneE164: string }>();
      for (const c of optIns) {
        dedup.set(c.phoneE164, { contactId: c.contactId ?? undefined, phoneE164: c.phoneE164 });
      }
      return { kind: "members", members: Array.from(dedup.values()) };
    }

    const dynamicSegments = await this.loadDynamicSegments(tenantId, audienceId);
    if (dynamicSegments.length > 0) {
      return { kind: "contactIds", contactIds: await this.orderedSegmentContactIds(dynamicSegments) };
    }

    const contacts = await this.prisma.audienceContact.findMany({
      where: { audienceId },
      orderBy: { createdAt: "asc" },
      select: { contactId: true, phoneE164: true, metadata: true },
    });
    const dedup = new Map<string, { contactId?: string; phoneE164: string }>();
    for (const contact of contacts) {
      if (!isContactable(contact)) continue;
      dedup.set(contact.phoneE164, {
        contactId: contact.contactId ?? undefined,
        phoneE164: contact.phoneE164,
      });
    }
    return { kind: "members", members: Array.from(dedup.values()) };
  }

  private async loadDynamicSegments(tenantId: string, audienceId: string) {
    return this.prisma.audienceSegment.findMany({
      where: {
        audienceId,
        tenantId,
        type: AudienceSegmentType.DYNAMIC,
      },
      select: { id: true, seed: true, lastEvaluatedAt: true },
    });
  }

  /**
   * The ordered contact-id membership of a dynamic-segment audience. Engine-v2
   * container audiences hold exactly ONE seeded segment – that seed drives the
   * deterministic send order (preview == send) and the staleness
   * re-evaluation; legacy dynamic segments (no seed) keep the old behaviour.
   * Every consumer (blast send, dialler tick) resolves through HERE so the
   * membership + order contract stays single-sourced.
   */
  private async orderedSegmentContactIds(
    dynamicSegments: Array<{ id: string; seed: string | null; lastEvaluatedAt: Date | null }>,
  ): Promise<string[]> {
    const v2 = dynamicSegments.length === 1 && dynamicSegments[0].seed ? dynamicSegments[0] : null;
    if (v2 && this.segmentEvaluator) {
      const configured = Number(this.config.get("SEGMENT_STALE_MINUTES"));
      const staleMinutes = Number.isFinite(configured) && configured > 0 ? configured : 15;
      const staleBefore = Date.now() - staleMinutes * 60_000;
      if (!v2.lastEvaluatedAt || v2.lastEvaluatedAt.getTime() < staleBefore) {
        // Re-materialise inline so the run reflects the definition NOW (both
        // consumers are queue-driven; the evaluation latency is acceptable).
        await this.segmentEvaluator.evaluate(v2.id);
      }
    }

    // Members are the materialised AudienceSegmentMember set (rewritten by
    // SegmentEvaluatorService), later resolved to the Contact spine.
    const members = await this.prisma.audienceSegmentMember.findMany({
      where: { segmentId: { in: dynamicSegments.map((s) => s.id) } },
      select: { contactId: true },
    });
    let contactIds = Array.from(new Set(members.map((m) => m.contactId)));
    if (v2?.seed) {
      // Deterministic hash order: the preview sample is the head of exactly
      // this order, so what the organiser saw is who the run starts with.
      contactIds = orderByHash(contactIds, v2.seed);
    }
    return contactIds;
  }
}

/** A member is contactable when not explicitly flagged off and the phone is plausible E.164. */
export function isContactable(contact: {
  phoneE164: string;
  metadata: Prisma.JsonValue | null;
}): boolean {
  const metadata =
    contact.metadata && typeof contact.metadata === "object" && !Array.isArray(contact.metadata)
      ? (contact.metadata as Record<string, unknown>)
      : {};
  if (metadata.contactable === false) return false;
  return /^\+\d{7,15}$/.test(contact.phoneE164);
}
