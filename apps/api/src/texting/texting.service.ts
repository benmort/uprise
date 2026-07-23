import { HttpStatus, Injectable } from "@nestjs/common";
import { AppUserRole, BlastRecipientStatus, EngagementChannel, MessageChannel, Prisma } from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { BlastsService } from "../blasts/blasts.service";
import { InboxService } from "../inbox/inbox.service";
import { ApiHttpException } from "../common/http/api-response";
import type { AuthUser } from "../auth/auth-user";

/**
 * Volunteer P2P texting — the field app's text-bank slice. A text bank is an SMS/BOTH
 * canvass campaign with P2P blasts linked via Blast.campaignId. Volunteers claim batches
 * of work (unsent scripted initial messages, or unowned unread reply conversations) and
 * work them one at a time; ALL access is scoped to the session user in this service
 * (assignee/owner checks — the own-turf 404 pattern), so the tenant-wide admin inbox
 * stays organiser-only. Organisers/owners/super-admins bypass ownership for oversight.
 */
@Injectable()
export class TextingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blasts: BlastsService,
    private readonly inbox: InboxService,
  ) {}

  private isOrganiser(actor: AuthUser): boolean {
    return actor.isSuperAdmin === true || actor.role === AppUserRole.ORGANISER || actor.role === AppUserRole.OWNER;
  }

  /**
   * The tenant's text banks: SMS/BOTH-channel campaigns with linked P2P blasts, plus the
   * caller's own workload counts. Organisers additionally see every blast's live status.
   */
  async listBanks(tenantId: string, actor: AuthUser) {
    const campaigns = await this.prisma.canvassCampaign.findMany({
      where: { tenantId, channel: { in: [EngagementChannel.SMS, EngagementChannel.BOTH] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, channel: true, status: true },
    });
    if (campaigns.length === 0) return [];
    const blasts = await this.prisma.blast.findMany({
      where: { tenantId, campaignId: { in: campaigns.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        campaignId: true,
        title: true,
        status: true,
        channel: true,
        metadata: true,
        createdAt: true,
      },
    });
    const p2pBlasts = blasts.filter((b) => this.blasts.isP2pBlast(b.metadata));
    const blastIds = p2pBlasts.map((b) => b.id);

    // Workload counts, grouped per blast in a handful of aggregate queries.
    const [myAssigned, unassigned, myOwned] = await Promise.all([
      blastIds.length
        ? this.prisma.blastRecipient.groupBy({
            by: ["blastId"],
            where: {
              blastId: { in: blastIds },
              assigneeId: actor.id,
              status: { in: [BlastRecipientStatus.PENDING, BlastRecipientStatus.QUEUED] },
            },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ blastId: string; _count: { _all: number } }>),
      blastIds.length
        ? this.prisma.blastRecipient.groupBy({
            by: ["blastId"],
            where: {
              blastId: { in: blastIds },
              assigneeId: null,
              status: BlastRecipientStatus.PENDING,
            },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ blastId: string; _count: { _all: number } }>),
      this.prisma.conversationState.count({
        where: { tenantId, channel: MessageChannel.SMS, ownerId: actor.id, unreadCount: { gt: 0 } },
      }),
    ]);
    const assignedBy = new Map(myAssigned.map((r) => [r.blastId, r._count._all]));
    const unassignedBy = new Map(unassigned.map((r) => [r.blastId, r._count._all]));

    const organiser = this.isOrganiser(actor);
    return campaigns
      .map((c) => {
        const campaignBlasts = p2pBlasts.filter((b) => b.campaignId === c.id);
        return {
          campaignId: c.id,
          name: c.name,
          channel: c.channel,
          status: c.status,
          myUnreadConversations: myOwned,
          blasts: campaignBlasts.map((b) => ({
            id: b.id,
            title: b.title,
            // Live status is organiser oversight; volunteers just need workable counts.
            status: organiser ? b.status : undefined,
            myAssignedUnsent: assignedBy.get(b.id) ?? 0,
            availableToClaim: unassignedBy.get(b.id) ?? 0,
            createdAt: b.createdAt,
          })),
        };
      })
      .filter((bank) => organiser || bank.blasts.length > 0);
  }

  /**
   * Claim a batch of work from a P2P blast, race-safely: `initial` assigns the next N
   * unassigned PENDING recipients to the caller; `replies` takes ownership of up to N
   * unowned unread SMS conversations belonging to this blast's recipients. SKIP LOCKED
   * keeps two volunteers claiming simultaneously from ever double-assigning.
   */
  async claimBatch(tenantId: string, actor: AuthUser, blastId: string, kind: "initial" | "replies", count = 10) {
    const blast = await this.prisma.blast.findFirst({
      where: { id: blastId, tenantId },
      select: { id: true, metadata: true, campaignId: true },
    });
    if (!blast || !blast.campaignId) {
      throw new ApiHttpException("TEXT_BANK_NOT_FOUND", "Text bank not found", HttpStatus.NOT_FOUND);
    }
    if (!this.blasts.isP2pBlast(blast.metadata)) {
      throw new ApiHttpException("BLAST_NOT_P2P", "This blast is not a P2P text bank");
    }
    const take = Math.min(Math.max(1, count), 25);

    if (kind === "initial") {
      // Materialise recipients + flip the blast into SENDING (idempotent).
      await this.blasts.prepareP2pBlast(tenantId, blastId);
      const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "messaging"."BlastRecipient" SET "assigneeId" = ${actor.id}, "assignedAt" = NOW()
        WHERE "id" IN (
          SELECT "id" FROM "messaging"."BlastRecipient"
          WHERE "blastId" = ${blastId} AND "assigneeId" IS NULL AND "status" = 'PENDING'
          ORDER BY "createdAt" ASC
          LIMIT ${take}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id"
      `);
      return { kind, claimed: claimed.length };
    }

    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "messaging"."ConversationState" SET "ownerId" = ${actor.id}, "claimedAt" = NOW()
      WHERE "id" IN (
        SELECT cs."id" FROM "messaging"."ConversationState" cs
        WHERE cs."tenantId" = ${tenantId} AND cs."channel" = 'SMS'
          AND cs."ownerId" IS NULL AND cs."unreadCount" > 0 AND cs."resolved" = false
          AND cs."contactPhone" IN (
            SELECT "phoneE164" FROM "messaging"."BlastRecipient" WHERE "blastId" = ${blastId}
          )
        ORDER BY cs."lastMessageAt" ASC
        LIMIT ${take}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `);
    return { kind, claimed: claimed.length };
  }

  /** The caller's work queue for a blast: assigned unsent messages + owned conversations. */
  async myQueue(tenantId: string, actor: AuthUser, blastId: string) {
    const blast = await this.prisma.blast.findFirst({
      where: { id: blastId, tenantId },
      select: { id: true, title: true, metadata: true },
    });
    if (!blast) throw new ApiHttpException("TEXT_BANK_NOT_FOUND", "Text bank not found", HttpStatus.NOT_FOUND);

    const [toSend, phones] = await Promise.all([
      this.prisma.blastRecipient.findMany({
        where: {
          blastId,
          assigneeId: actor.id,
          status: { in: [BlastRecipientStatus.PENDING, BlastRecipientStatus.QUEUED] },
        },
        orderBy: { assignedAt: "asc" },
        select: { id: true, phoneE164: true, renderedBody: true, contactId: true },
      }),
      this.prisma.blastRecipient.findMany({
        where: { blastId },
        select: { phoneE164: true },
      }),
    ]);
    const bankPhones = new Set(phones.map((p) => p.phoneE164));
    const conversations = (
      await this.prisma.conversationState.findMany({
        where: { tenantId, channel: MessageChannel.SMS, ownerId: actor.id, resolved: false },
        orderBy: [{ unreadCount: "desc" }, { lastMessageAt: "desc" }],
        select: { contactPhone: true, unreadCount: true, lastMessageAt: true, contactId: true },
      })
    ).filter((c) => bankPhones.has(c.contactPhone));

    // Contact names, one lookup across both lists.
    const contactIds = [
      ...new Set([...toSend, ...conversations].map((r) => r.contactId).filter((x): x is string => Boolean(x))),
    ];
    const contacts = contactIds.length
      ? await this.prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = new Map(
      contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ") || null]),
    );

    return {
      blastId: blast.id,
      title: blast.title,
      toSend: toSend.map((r) => ({
        recipientId: r.id,
        phone: r.phoneE164,
        message: r.renderedBody,
        contactName: r.contactId ? (nameOf.get(r.contactId) ?? null) : null,
      })),
      conversations: conversations.map((c) => ({
        contactPhone: c.contactPhone,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt,
        contactName: c.contactId ? (nameOf.get(c.contactId) ?? null) : null,
      })),
    };
  }

  /** Ownership gate for a conversation: the owner, or an organiser+ (oversight). */
  private async assertConversationAccess(tenantId: string, actor: AuthUser, contactPhone: string) {
    if (this.isOrganiser(actor)) return;
    const state = await this.prisma.conversationState.findFirst({
      where: { tenantId, contactPhone, channel: MessageChannel.SMS },
      select: { ownerId: true },
    });
    if (state?.ownerId === actor.id) return;
    // Also allow the volunteer assigned the initial send for this phone (thread preview
    // before the contact ever replies).
    const assigned = await this.prisma.blastRecipient.findFirst({
      where: { phoneE164: contactPhone, assigneeId: actor.id, blast: { tenantId } },
      select: { id: true },
    });
    if (assigned) return;
    throw new ApiHttpException("CONVERSATION_NOT_YOURS", "This conversation is not assigned to you", HttpStatus.NOT_FOUND);
  }

  async thread(tenantId: string, actor: AuthUser, contactPhone: string) {
    await this.assertConversationAccess(tenantId, actor, contactPhone);
    return this.inbox.getThread(tenantId, contactPhone, MessageChannel.SMS);
  }

  async reply(tenantId: string, actor: AuthUser, contactPhone: string, body: string) {
    await this.assertConversationAccess(tenantId, actor, contactPhone);
    return this.inbox.reply(tenantId, contactPhone, body, MessageChannel.SMS);
  }

  async resolve(tenantId: string, actor: AuthUser, contactPhone: string) {
    await this.assertConversationAccess(tenantId, actor, contactPhone);
    return this.inbox.markConversation(tenantId, contactPhone, true, MessageChannel.SMS);
  }

  /** Press-send one assigned scripted initial message. Assignee binding enforced downstream. */
  async sendInitial(tenantId: string, actor: AuthUser, recipientId: string) {
    return this.blasts.sendSingleRecipient(tenantId, recipientId, actor.id);
  }
}
