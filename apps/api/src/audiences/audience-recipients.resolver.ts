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

    const dynamicSegments = await this.prisma.audienceSegment.findMany({
      where: {
        audienceId,
        tenantId,
        type: AudienceSegmentType.DYNAMIC,
      },
      select: { id: true, seed: true, lastEvaluatedAt: true },
    });

    if (dynamicSegments.length > 0) {
      // Engine-v2 container audiences hold exactly ONE seeded segment — that seed
      // drives the deterministic send order (preview == send) and the staleness
      // re-evaluation. Legacy dynamic segments (no seed) keep the old behaviour.
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

      // Dynamic-segment audience: members are the materialised AudienceSegmentMember
      // set (rewritten by SegmentEvaluatorService), resolved to the Contact spine.
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
