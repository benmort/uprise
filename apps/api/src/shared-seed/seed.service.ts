import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AppUserRole,
  AudienceSegmentType,
  AudienceSource,
  BlastRecipientStatus,
  BlastStatus,
  EventStatus,
  MessageChannel,
  Prisma,
  RsvpStatus,
  ShiftAssignmentStatus,
  ShiftType,
  WalkListItemListType,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/password.util";
import { EngagementService } from "../shared-engagement/engagement.service";
import { CanvassingService } from "../canvassing/canvassing.service";
import {
  DEFAULT_TOUR_TEMPLATE,
  DEMO_AUDIENCES,
  DEMO_BLASTS,
  DEMO_CAMPAIGN,
  DEMO_CANNED,
  DEMO_EVENTS,
  DEMO_EXTRA_CANNED,
  DEMO_EXTRA_SCRIPTS,
  DEMO_EXTRA_SURVEYS,
  DEMO_JOURNEY,
  DEMO_KNOCKS,
  DEMO_KNOCK_TODAY_WINDOW_HOURS,
  DEMO_LOGINS,
  DEMO_SCRIPT,
  DEMO_SEARCHES,
  DEMO_SENDER_PHONE,
  DEMO_SHIFTS,
  DEMO_SUPPRESSIONS,
  DEMO_SURVEY,
  DEMO_TAG,
  DEMO_TAGS,
  DEMO_THREADS,
  DEMO_TURF,
  DEMO_WALK_LIST,
  DEMO_WALK_LIST_SIZE,
  EXAMPLE_AUDIENCE_NAME,
  EXAMPLE_BLAST_TITLE,
  buildDemoContacts,
  demoPhone,
} from "./seed-data";
import { PRIMARY_TENANT } from "./tenants.seed";

export type SeedResult = {
  tenantId: string;
  organiserEmail: string;
  volunteerEmail: string;
  volunteerId: string;
  campaignId: string;
  turfId: string;
  walkListId: string;
  stopId: string | null;
  contactId: string;
  audienceId: string;
  blastId: string;
  surveyId: string;
  scriptId: string;
  journeyId: string;
};

/**
 * The single demo/example seeder, shared by the demo-data CLI and (via canonical
 * constants in seed-data) the product tour. Idempotent: every step is
 * find-or-create by a natural key, so re-running is a no-op. Reuses the real
 * services where they carry logic (disposition defaults, turf lock, door knock).
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
    private readonly canvassing: CanvassingService,
  ) {}

  private async org(): Promise<string> {
    // Seed target: the primary tenant (Uprise Labs). All demo/tour/seed data is
    // written here. Idempotent upsert by slug — safe to re-run.
    const org = await this.prisma.tenant.upsert({
      where: { slug: PRIMARY_TENANT.slug },
      create: { slug: PRIMARY_TENANT.slug, name: PRIMARY_TENANT.name },
      update: {},
    });
    return org.id;
  }

  private async upsertUser(
    tenantId: string,
    login: { email: string; password: string; displayName: string; mobile?: string },
    role: AppUserRole,
  ): Promise<string> {
    // Identity (User) is global; membership (TenantMember) carries the role.
    const existing = await this.prisma.user.findUnique({ where: { email: login.email } });
    const userId =
      existing?.id ??
      (
        await this.prisma.user.create({
          data: {
            email: login.email,
            displayName: login.displayName,
            passwordHash: await hashPassword(login.password),
            // A pre-verified mobile so phone-first login / 2FA work in dev (no SMS).
            mobile: login.mobile ?? null,
            mobileVerified: Boolean(login.mobile),
          },
        })
      ).id;
    // Backfill the demo mobile on re-seed (older seeds created these users without one).
    if (existing && login.mobile) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mobile: login.mobile, mobileVerified: true },
      });
    }
    await this.prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, role },
      update: { role },
    });
    return userId;
  }

  /**
   * Seed the shared inbox from DEMO_THREADS: an inbound/outbound message pair per exchange plus the
   * ConversationState row that carries unread/resolved/owner. Before this, seedDemo() created no
   * messages at all, so the inbox rendered empty on every fresh environment.
   *
   * Idempotent via a deterministic `twilioMessageSid` (`demo:thread:<thread>:<msg>`) — the column is
   * @unique, so a re-seed skips messages it already wrote rather than duplicating the thread.
   */
  private async seedThreads(
    tenantId: string,
    contactIds: string[],
    contacts: ReturnType<typeof buildDemoContacts>,
    organiserId: string,
  ): Promise<void> {
    const now = Date.now();
    for (const [t, thread] of DEMO_THREADS.entries()) {
      const contactId = contactIds[thread.contactIndex];
      const contact = contacts[thread.contactIndex];
      // An SMS thread needs a number — the email-only tier has none. DEMO_THREADS only indexes
      // into the phone-bearing households, so this is a guard, not an expected skip.
      if (!contactId || !contact?.phoneE164) continue;
      const contactPhone = contact.phoneE164;

      let lastMessageAt: Date | null = null;
      for (const [m, msg] of thread.messages.entries()) {
        const sid = `demo:thread:${t}:${m}`;
        const at = new Date(now - msg.minutesAgo * 60_000);
        if (!lastMessageAt || at > lastMessageAt) lastMessageAt = at;

        if (msg.direction === "in") {
          const existing = await this.prisma.inboundMessage.findUnique({ where: { twilioMessageSid: sid } });
          if (existing) continue;
          await this.prisma.inboundMessage.create({
            data: {
              tenantId,
              contactId,
              fromPhone: contactPhone,
              toPhone: DEMO_SENDER_PHONE,
              body: msg.body,
              threadKey: contactPhone,
              twilioMessageSid: sid,
              receivedAt: at,
            },
          });
        } else {
          const existing = await this.prisma.outboundMessage.findUnique({ where: { twilioMessageSid: sid } });
          if (existing) continue;
          await this.prisma.outboundMessage.create({
            data: {
              tenantId,
              contactId,
              toPhone: contactPhone,
              fromPhone: DEMO_SENDER_PHONE,
              body: msg.body,
              twilioMessageSid: sid,
              sentAt: at,
            },
          });
        }
      }

      await this.prisma.conversationState.upsert({
        where: { tenantId_contactPhone_channel: { tenantId, contactPhone, channel: MessageChannel.SMS } },
        create: {
          tenantId,
          contactId,
          contactPhone,
          unreadCount: thread.unread,
          resolved: thread.resolved,
          ownerId: thread.claimed ? organiserId : null,
          claimedAt: thread.claimed ? lastMessageAt : null,
          lastMessageAt,
        },
        update: {
          unreadCount: thread.unread,
          resolved: thread.resolved,
          ownerId: thread.claimed ? organiserId : null,
          claimedAt: thread.claimed ? lastMessageAt : null,
          lastMessageAt,
        },
      });
    }
  }

  /**
   * Spread the seeded knocks back over the last ~10 days, relative to now.
   *
   * `recordDoorKnock` stamps `createdAt` at insert, so every knock used to share one instant —
   * which made the dashboard's "doors today" tile read 0 from the day after seeding onwards
   * (campaigns.service counts `DoorKnock.createdAt >= startOfToday()`). The knock is still
   * recorded through the service so dispositions and journey enrolments fire; only the clock is
   * corrected afterwards. `clientCapturedAt` is set to match so the field timeline agrees.
   */
  private async backdateKnocks(tenantId: string): Promise<void> {
    const now = Date.now();
    // Local midnight, matching campaigns.service's startOfToday() — the boundary the tile uses.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    // At least a minute of runway so a seed run in the first seconds of the day still has a
    // window to place knocks into rather than collapsing them all onto midnight exactly.
    const elapsedToday = Math.max(now - midnight.getTime(), 60_000);

    // The recent cohort is spread across the part of today that has elapsed, NOT dated by
    // subtracting its hoursAgo. Subtracting would push all of them into yesterday whenever the
    // seed runs early in the morning, which is the failure this whole change exists to prevent.
    const todays = DEMO_KNOCKS.filter((k) => k.hoursAgo < DEMO_KNOCK_TODAY_WINDOW_HOURS);
    const todayAt = new Map<number, Date>();
    todays.forEach((k, i) => {
      // Oldest first across the window, so the sequence still reads like a morning's work.
      const fraction = (i + 1) / (todays.length + 1);
      todayAt.set(k.contactIndex, new Date(midnight.getTime() + elapsedToday * fraction));
    });

    for (const k of DEMO_KNOCKS) {
      const at = todayAt.get(k.contactIndex) ?? new Date(now - k.hoursAgo * 3_600_000);
      await this.prisma.doorKnock.updateMany({
        where: { tenantId, localId: `demo:knock:${k.contactIndex}` },
        data: { createdAt: at, clientCapturedAt: at },
      });
    }
  }

  /**
   * The surfaces that previously photographed as zero-states: saved searches, extra audiences and
   * their members, sent blasts, opt-outs, the calendar (events + shifts) and contact tags.
   *
   * Saved searches are written as `AudienceSegment` rows directly rather than through
   * `SegmentsService.create`. The service is the nicer path, but `AudiencesModule` pulls in
   * `QueueModule` and `InsightsModule`, and importing that graph into the seeder to write three
   * demo rows is a lot of coupling for the benefit. The envelope written here is the same v2
   * shape (`{ format: 2, filter, policy }`) the service would persist, and the fixture spec
   * asserts its structure.
   *
   * Every step is find-or-create on a natural key, matching the rest of the seeder.
   */
  private async seedDashboardSurfaces(
    tenantId: string,
    contactIds: string[],
    campaignId: string,
    turfId: string,
    volunteerId: string,
    organiserId: string,
  ): Promise<void> {
    const contacts = buildDemoContacts();
    const now = Date.now();
    const at = (days: number, hour: number): Date => {
      const d = new Date(now + days * 86_400_000);
      d.setHours(hour, 0, 0, 0);
      return d;
    };

    // ── Contact tags ──
    for (const t of DEMO_TAGS) {
      const tag = await this.prisma.contactTag.upsert({
        where: { tenantId_key: { tenantId, key: t.key } },
        create: { tenantId, key: t.key, label: t.label, color: t.color },
        update: {},
      });
      for (let i = 0; i < contactIds.length; i += t.everyNth) {
        const exists = await this.prisma.contactTagAssignment.findFirst({
          where: { tenantId, contactId: contactIds[i], tagId: tag.id },
        });
        if (!exists) {
          await this.prisma.contactTagAssignment.create({
            data: { tenantId, contactId: contactIds[i], tagId: tag.id, source: DEMO_TAG },
          });
        }
      }
    }

    // ── Audiences + members ──
    const audienceByName = new Map<string, string>();
    for (const a of DEMO_AUDIENCES) {
      const audience =
        (await this.prisma.audience.findFirst({ where: { tenantId, name: a.name } })) ??
        (await this.prisma.audience.create({
          data: { tenantId, name: a.name, source: AudienceSource.CSV },
        }));
      audienceByName.set(a.name, audience.id);
      const existing = await this.prisma.audienceContact.count({ where: { audienceId: audience.id } });
      if (existing === 0) {
        for (let i = 0; i < contacts.length; i += a.contactStride) {
          const phone = contacts[i].phoneE164;
          if (!phone) continue; // AudienceContact.phoneE164 is required — email-only tier is skipped
          await this.prisma.audienceContact.create({
            data: {
              tenantId,
              audienceId: audience.id,
              contactId: contactIds[i],
              phoneE164: phone,
              fullName: `${contacts[i].firstName} ${contacts[i].lastName}`,
              source: AudienceSource.CSV,
            },
          });
        }
      }
    }

    // ── Saved searches ──
    for (const s of DEMO_SEARCHES) {
      const exists = await this.prisma.audienceSegment.findFirst({ where: { tenantId, name: s.name } });
      if (exists) continue;
      const audienceId = audienceByName.get(DEMO_AUDIENCES[0].name);
      if (!audienceId) continue;
      await this.prisma.audienceSegment.create({
        data: {
          tenantId,
          audienceId,
          name: s.name,
          type: AudienceSegmentType.DYNAMIC,
          version: 2,
          definition: {
            format: 2,
            filter: {
              kind: "all",
              children: s.conditions.map((condition) => ({ kind: "condition", condition })),
            },
            policy: {
              fatigue: { enabled: false, windowHours: 168, maxSends: 2 },
              isActive: {
                enabled: false,
                predicate: { kind: "condition", condition: { type: "activity.lastActiveWithin", op: "within", days: 365 } },
              },
            },
          } as unknown as Prisma.InputJsonValue,
          createdById: organiserId,
        },
      });
    }

    // ── Sent blasts + recipients ──
    for (const b of DEMO_BLASTS) {
      const existing = await this.prisma.blast.findFirst({ where: { tenantId, title: b.title } });
      if (existing) continue;
      const sentAt = new Date(now - b.daysAgo * 86_400_000);
      const blast = await this.prisma.blast.create({
        data: {
          tenantId,
          audienceId: audienceByName.get(b.audienceName) ?? null,
          createdById: organiserId,
          title: b.title,
          bodyTemplate: b.body,
          channel: MessageChannel.SMS,
          status: BlastStatus.SENT,
          startedAt: sentAt,
          completedAt: sentAt,
        },
      });
      for (let i = 0; i < contacts.length; i += b.recipientStride) {
        const phone = contacts[i].phoneE164;
        if (!phone) continue;
        // A believable delivery mix: mostly delivered, a few replies, the odd failure.
        const status =
          i % 17 === 0
            ? BlastRecipientStatus.FAILED
            : i % 5 === 0
              ? BlastRecipientStatus.RESPONDED
              : BlastRecipientStatus.DELIVERED;
        await this.prisma.blastRecipient.create({
          data: {
            blastId: blast.id,
            contactId: contactIds[i],
            phoneE164: phone,
            channel: MessageChannel.SMS,
            renderedBody: b.body.replace("{{first_name}}", contacts[i].firstName),
            status,
            sentAt,
            deliveredAt: status === BlastRecipientStatus.FAILED ? null : sentAt,
          },
        });
      }
    }

    // ── Opt-outs ──
    for (const s of DEMO_SUPPRESSIONS) {
      const phoneE164 = contacts[s.contactIndex]?.phoneE164;
      if (!phoneE164) continue;
      const exists = await this.prisma.suppression.findFirst({ where: { tenantId, phoneE164 } });
      if (!exists) {
        await this.prisma.suppression.create({
          data: { tenantId, phoneE164, reason: s.reason, source: s.source },
        });
      }
    }

    // ── Events + RSVPs ──
    for (const e of DEMO_EVENTS) {
      const exists = await this.prisma.event.findFirst({ where: { tenantId, title: e.title } });
      if (exists) continue;
      const startsAt = at(e.daysFromNow, e.startHour);
      const event = await this.prisma.event.create({
        data: {
          tenantId,
          campaignId,
          title: e.title,
          description: e.description,
          category: e.category,
          location: e.location,
          status: e.published ? EventStatus.PUBLISHED : EventStatus.DRAFT,
          startsAt,
          endsAt: new Date(startsAt.getTime() + e.durationHours * 3_600_000),
          capacity: e.capacity,
          publicRsvpEnabled: e.published,
        },
      });
      for (let i = 0; i < e.goingCount && i < contacts.length; i++) {
        const c = contacts[i * 2] ?? contacts[i];
        await this.prisma.eventRsvp.create({
          data: {
            tenantId,
            eventId: event.id,
            contactId: contactIds[i * 2] ?? contactIds[i],
            name: `${c.firstName} ${c.lastName}`,
            email: c.email ?? null,
            phone: c.phoneE164 ?? null,
            // Past events read as attended; upcoming ones as going.
            status: e.daysFromNow < 0 ? RsvpStatus.ATTENDED : RsvpStatus.GOING,
          },
        });
      }
    }

    // ── Shifts ──
    for (const s of DEMO_SHIFTS) {
      const exists = await this.prisma.shift.findFirst({ where: { tenantId, name: s.name } });
      if (exists) continue;
      const startsAt = at(s.daysFromNow, s.startHour);
      const shift = await this.prisma.shift.create({
        data: {
          tenantId,
          campaignId,
          turfId: s.type === "CANVASS" ? turfId : null,
          type: s.type as ShiftType,
          name: s.name,
          location: s.location,
          capacity: s.capacity,
          startsAt,
          endsAt: new Date(startsAt.getTime() + s.durationHours * 3_600_000),
        },
      });
      await this.prisma.shiftAssignment.create({
        data: { tenantId, shiftId: shift.id, volunteerId, status: ShiftAssignmentStatus.ASSIGNED },
      });
    }

    // ── Extra content ──
    for (const s of DEMO_EXTRA_SURVEYS) {
      const exists = await this.prisma.survey.findFirst({ where: { tenantId, name: s.name } });
      if (exists) continue;
      await this.prisma.survey.create({
        data: {
          tenantId,
          name: s.name,
          questions: {
            create: [
              {
                key: "q0",
                prompt: s.prompt,
                type: "single_choice",
                orderIndex: 0,
                options: { create: s.options.map((label, i) => ({ label, value: `opt${i}`, orderIndex: i })) },
              },
            ],
          },
        },
      });
    }
    for (const s of DEMO_EXTRA_SCRIPTS) {
      const exists = await this.prisma.script.findFirst({ where: { tenantId, name: s.name } });
      if (exists) continue;
      await this.prisma.script.create({
        data: {
          tenantId,
          name: s.name,
          steps: { create: s.steps.map((bodyText, i) => ({ orderIndex: i, bodyText })) },
        },
      });
    }
    for (const cr of DEMO_EXTRA_CANNED) {
      const exists = await this.prisma.cannedResponse.findFirst({ where: { tenantId, title: cr.title } });
      if (!exists) {
        await this.prisma.cannedResponse.create({
          data: { tenantId, title: cr.title, body: cr.body, dispositionCode: cr.dispositionCode },
        });
      }
    }
  }

  async seedDemo(): Promise<SeedResult> {
    const tenantId = await this.org();
    await this.engagement.ensureDefaultDispositions();

    // Bound (not discarded) — the claimed demo inbox threads need an owner.
    const organiserId = await this.upsertUser(tenantId, DEMO_LOGINS.organiser, AppUserRole.ORGANISER);
    const volunteerId = await this.upsertUser(tenantId, DEMO_LOGINS.volunteer, AppUserRole.VOLUNTEER);
    // OWNER as well: `read analytics.all` is owner/admin-only, so an organiser's dashboard shows
    // "Couldn't load — Missing permission" on the messaging card. Marketing captures sign in here.
    await this.upsertUser(tenantId, DEMO_LOGINS.owner, AppUserRole.OWNER);

    // Campaign
    const campaign =
      (await this.prisma.canvassCampaign.findFirst({ where: { tenantId, name: DEMO_CAMPAIGN.name } })) ??
      (await this.prisma.canvassCampaign.create({
        data: { tenantId, name: DEMO_CAMPAIGN.name, status: "ACTIVE", goals: { doors: 500, conversations: 120 } },
      }));

    // Turf
    const turf =
      (await this.prisma.turf.findFirst({ where: { tenantId, name: DEMO_TURF.name } })) ??
      (await this.prisma.turf.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          name: DEMO_TURF.name,
          geometry: DEMO_TURF.geometry as unknown as Prisma.InputJsonValue,
        },
      }));

    // Contacts (inside the turf)
    const contacts = buildDemoContacts();
    const contactIds: string[] = [];
    for (const c of contacts) {
      const found = await this.prisma.contact.findFirst({ where: { tenantId, address: c.address } });
      // Only the canvassable tier belongs to the turf — the email-only contacts are list members
      // in neighbouring suburbs, and pinning them to the turf would inflate its door count.
      const turfIdForContact = c.canvassable ? turf.id : null;
      const row =
        found ??
        (await this.prisma.contact.create({
          data: {
            tenantId,
            turfId: turfIdForContact,
            firstName: c.firstName,
            lastName: c.lastName,
            address: c.address,
            phoneE164: c.phoneE164 ?? null,
            email: c.email ?? null,
            lat: c.lat,
            lng: c.lng,
          },
        }));
      if (!found && row.turfId !== turfIdForContact) {
        await this.prisma.contact.update({ where: { id: row.id }, data: { turfId: turfIdForContact } });
      }
      contactIds.push(row.id);
    }

    // Walk list — a slice of the turf, not all of it. One volunteer's shift is a few dozen doors;
    // a list of every household reads as fake in the field capture and never completes.
    let walkList = await this.prisma.walkList.findFirst({
      where: { tenantId, name: DEMO_WALK_LIST.name },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
    if (!walkList) {
      const created = await this.canvassing.createWalkList(tenantId, {
        name: DEMO_WALK_LIST.name,
        turfId: turf.id,
        campaignId: campaign.id,
        contactIds: contactIds.slice(0, DEMO_WALK_LIST_SIZE),
        listType: WalkListItemListType.STATIC,
      });
      walkList = await this.prisma.walkList.findUnique({
        where: { id: created.id },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });
    }
    const stopId = walkList?.items[0]?.id ?? null;

    // Assign the turf to the demo volunteer (idempotent re-claim).
    await this.canvassing.assignTurf(tenantId, turf.id, volunteerId);

    // Door knocks (idempotent on localId; wires dispositions + journeys).
    for (const k of DEMO_KNOCKS) {
      const contactId = contactIds[k.contactIndex];
      if (!contactId) continue;
      await this.canvassing.recordDoorKnock(tenantId, {
        contactId,
        volunteerId,
        localId: `demo:knock:${k.contactIndex}`,
        dispositionCode: k.dispositionCode,
        walkListItemId: walkList?.items[k.contactIndex]?.id ?? null,
        lat: contacts[k.contactIndex].lat,
        lng: contacts[k.contactIndex].lng,
      });
    }
    await this.backdateKnocks(tenantId);

    // Audience + blast (canonical example, shared with the tour).
    const audience =
      (await this.prisma.audience.findFirst({ where: { tenantId, name: EXAMPLE_AUDIENCE_NAME } })) ??
      (await this.prisma.audience.create({
        data: { tenantId, name: EXAMPLE_AUDIENCE_NAME, source: AudienceSource.CSV },
      }));
    const blast =
      (await this.prisma.blast.findFirst({ where: { tenantId, title: EXAMPLE_BLAST_TITLE } })) ??
      (await this.prisma.blast.create({
        data: {
          tenantId,
          title: EXAMPLE_BLAST_TITLE,
          bodyTemplate: DEFAULT_TOUR_TEMPLATE,
          audienceId: audience.id,
        },
      }));

    // Inbox threads — real two-way exchanges so the shared inbox, its folder counts and the
    // conversation detail pane have something to render. Idempotent on the deterministic
    // twilioMessageSid (a @unique column), so re-seeding never duplicates a message.
    await this.seedThreads(tenantId, contactIds, contacts, organiserId);

    // Survey (dual-channel options)
    const survey =
      (await this.prisma.survey.findFirst({ where: { tenantId, name: DEMO_SURVEY.name } })) ??
      (await this.prisma.survey.create({
        data: {
          tenantId,
          name: DEMO_SURVEY.name,
          questions: {
            create: DEMO_SURVEY.questions.map((q, qi) => ({
              key: `q${qi}`,
              prompt: q.prompt,
              type: q.type,
              orderIndex: qi,
              options: {
                create: q.options.map((o, oi) => ({
                  value: o.value,
                  label: o.label,
                  orderIndex: oi,
                  dispositionCode: o.dispositionCode,
                  supportLevel: o.supportLevel,
                  cannedReplyText: o.cannedReplyText,
                })),
              },
            })),
          },
        },
      }));

    // Script
    const script =
      (await this.prisma.script.findFirst({ where: { tenantId, name: DEMO_SCRIPT.name } })) ??
      (await this.prisma.script.create({
        data: {
          tenantId,
          name: DEMO_SCRIPT.name,
          steps: { create: DEMO_SCRIPT.steps.map((s) => ({ bodyText: s.bodyText, outcomeKey: s.outcomeKey ?? null, orderIndex: s.orderIndex })) },
        },
      }));

    // Journey
    const journey =
      (await this.prisma.journey.findFirst({ where: { tenantId, name: DEMO_JOURNEY.name } })) ??
      (await this.prisma.journey.create({
        data: {
          tenantId,
          name: DEMO_JOURNEY.name,
          triggerType: DEMO_JOURNEY.triggerType,
          triggerConfig: DEMO_JOURNEY.triggerConfig as Prisma.InputJsonValue,
          rungs: { create: DEMO_JOURNEY.rungs.map((r, i) => ({ rungIndex: i, type: r.type, config: r.config as Prisma.InputJsonValue })) },
        },
      }));

    // Canned responses
    for (const cr of DEMO_CANNED) {
      const exists = await this.prisma.cannedResponse.findFirst({ where: { tenantId, title: cr.title } });
      if (!exists) {
        await this.prisma.cannedResponse.create({
          data: { tenantId, title: cr.title, body: cr.body, dispositionCode: cr.dispositionCode },
        });
      }
    }

    await this.seedDashboardSurfaces(tenantId, contactIds, campaign.id, turf.id, volunteerId, organiserId);
    await this.seedGeo(tenantId, contactIds);

    this.logger.log(`Demo seed complete for org ${tenantId}.`);
    return {
      tenantId,
      organiserEmail: DEMO_LOGINS.organiser.email,
      volunteerEmail: DEMO_LOGINS.volunteer.email,
      volunteerId,
      campaignId: campaign.id,
      turfId: turf.id,
      walkListId: walkList?.id ?? "",
      stopId,
      contactId: contactIds[0],
      audienceId: audience.id,
      blastId: blast.id,
      surveyId: survey.id,
      scriptId: script.id,
      journeyId: journey.id,
    };
  }

  /**
   * Minimal geo fixture so /canvass/divisions + /settings/data render in demo without the
   * national G-NAF load: one demo federal/state/LGA division over the Glebe turf, the demo
   * contacts as G-NAF addresses (inside) plus a few cold doors, and the mapping. Idempotent.
   * Skips silently if PostGIS/geo isn't present.
   */
  private async seedGeo(tenantId: string, contactIds: string[]): Promise<void> {
    const poly =
      "MULTIPOLYGON(((151.183 -33.878,151.197 -33.878,151.197 -33.890,151.183 -33.890,151.183 -33.878)))";
    const contacts = buildDemoContacts();
    try {
      for (const [tbl, code, name] of [
        ["geo.ced", "DEMO-FED", "Demo Federal Division"],
        ["geo.sed", "DEMO-STATE", "Demo State Electorate"],
        ["geo.lga", "DEMO-LGA", "Demo City Council"],
      ] as const) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO ${tbl} (code,name,state,geom) VALUES ($1,$2,'NSW',ST_GeomFromText($3,4326))
           ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, geom=EXCLUDED.geom`,
          code,
          name,
          poly,
        );
      }

      // Synthetic ASGS statistical areas over the demo turf so the turf-cut map's
      // clickable MB/SA1/SA2/SA3 layer renders locally (prod has the national load).
      // A nested grid: 1 SA3 ⊃ 2 SA2 ⊃ 4 SA1 ⊃ 16 meshblocks, parent codes wired up.
      const W = 151.183;
      const E = 151.197;
      const S = -33.89;
      const N = -33.878;
      const midX = (W + E) / 2;
      const midY = (S + N) / 2;
      const cell = (x0: number, y0: number, x1: number, y1: number) =>
        `MULTIPOLYGON(((${x0} ${y0},${x1} ${y0},${x1} ${y1},${x0} ${y1},${x0} ${y0})))`;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO geo.sa3 (code,name,sa4_code,geom) VALUES ($1,$2,NULL,ST_GeomFromText($3,4326))
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, geom=EXCLUDED.geom`,
        "DEMO-SA3",
        "Demo Inner West (SA3)",
        cell(W, S, E, N),
      );
      for (const [code, name, x0, x1] of [
        ["DEMO-SA2-1", "Demo Glebe West (SA2)", W, midX],
        ["DEMO-SA2-2", "Demo Glebe East (SA2)", midX, E],
      ] as const) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.sa2 (code,name,sa3_code,geom) VALUES ($1,$2,'DEMO-SA3',ST_GeomFromText($3,4326))
           ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, geom=EXCLUDED.geom`,
          code,
          name,
          cell(x0, S, x1, N),
        );
      }
      for (const [code, sa2, x0, y0, x1, y1] of [
        ["DEMO-SA1-1", "DEMO-SA2-1", W, S, midX, midY],
        ["DEMO-SA1-2", "DEMO-SA2-1", W, midY, midX, N],
        ["DEMO-SA1-3", "DEMO-SA2-2", midX, S, E, midY],
        ["DEMO-SA1-4", "DEMO-SA2-2", midX, midY, E, N],
      ] as const) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.sa1 (code,name,sa2_code,geom) VALUES ($1,$2,$3,ST_GeomFromText($4,4326))
           ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sa2_code=EXCLUDED.sa2_code, geom=EXCLUDED.geom`,
          code,
          `Demo ${code} (SA1)`,
          sa2,
          cell(x0, y0, x1, y1),
        );
      }
      // 4×4 meshblock grid; each cell inherits the SA1/SA2/SA3 quadrant it sits in.
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          const x0 = W + (c * (E - W)) / 4;
          const x1 = W + ((c + 1) * (E - W)) / 4;
          const y0 = S + (r * (N - S)) / 4;
          const y1 = S + ((r + 1) * (N - S)) / 4;
          const sa2 = c < 2 ? "DEMO-SA2-1" : "DEMO-SA2-2";
          const sa1 =
            c < 2 ? (r < 2 ? "DEMO-SA1-1" : "DEMO-SA1-2") : r < 2 ? "DEMO-SA1-3" : "DEMO-SA1-4";
          await this.prisma.$executeRawUnsafe(
            `INSERT INTO geo.meshblock (mb_code,sa1_code,sa2_code,sa3_code,state,geom)
             VALUES ($1,$2,$3,'DEMO-SA3','NSW',ST_GeomFromText($4,4326))
             ON CONFLICT (mb_code) DO UPDATE SET sa1_code=EXCLUDED.sa1_code, sa2_code=EXCLUDED.sa2_code, geom=EXCLUDED.geom`,
            `DEMO-MB-${r}-${c}`,
            sa1,
            sa2,
            cell(x0, y0, x1, y1),
          );
        }
      }
      // Demo contacts → G-NAF addresses (inside the division), linked back to the Contact.
      for (let i = 0; i < contacts.length; i += 1) {
        const c = contacts[i];
        const pid = `demo:gnaf:${i}`;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.gnaf_address (gnaf_pid,address_label,lat,lng,state,mb_code,geom)
           VALUES ($1,$2,$3,$4,'NSW','DEMO-MB',ST_SetSRID(ST_MakePoint($4,$3),4326))
           ON CONFLICT (gnaf_pid) DO NOTHING`,
          pid,
          c.address,
          c.lat,
          c.lng,
        );
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.address_region (gnaf_pid,mb_code,lga_code,ced_code,sed_code)
           VALUES ($1,'DEMO-MB','DEMO-LGA','DEMO-FED','DEMO-STATE') ON CONFLICT (gnaf_pid) DO NOTHING`,
          pid,
        );
        if (contactIds[i]) {
          await this.prisma.$executeRawUnsafe(`UPDATE "Contact" SET "gnafPid"=$1 WHERE id=$2`, pid, contactIds[i]);
        }
      }
      // A few cold doors (no contact) so "without contacts" > 0.
      for (let i = 0; i < 6; i += 1) {
        const pid = `demo:gnaf:cold:${i}`;
        const lng = 151.186 + i * 0.0015;
        const lat = -33.881 - i * 0.0008;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.gnaf_address (gnaf_pid,address_label,lat,lng,state,mb_code,geom)
           VALUES ($1,$2,$3,$4,'NSW','DEMO-MB',ST_SetSRID(ST_MakePoint($4,$3),4326))
           ON CONFLICT (gnaf_pid) DO NOTHING`,
          pid,
          `${10 + i} Cold Door St`,
          lat,
          lng,
        );
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.address_region (gnaf_pid,mb_code,lga_code,ced_code,sed_code)
           VALUES ($1,'DEMO-MB','DEMO-LGA','DEMO-FED','DEMO-STATE') ON CONFLICT (gnaf_pid) DO NOTHING`,
          pid,
        );
      }
      for (const [key, label, rows] of [
        ["gnaf", "G-NAF addresses (demo)", contacts.length + 6],
        ["ced", "Federal divisions (demo)", 1],
        ["sed", "State electorates (demo)", 1],
        ["lga", "Local government areas (demo)", 1],
        ["asgs_mb", "Meshblocks (demo)", 16],
        ["sa1", "Statistical Area 1 (demo)", 4],
        ["sa2", "Statistical Area 2 (demo)", 2],
        ["sa3", "Statistical Area 3 (demo)", 1],
      ] as const) {
        const count = rows;
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO geo.dataset_meta (key,label,source_url,release_date,licence,row_count,status,last_ingested)
           VALUES ($1,$2,'(demo seed)','demo','demo',$3,'loaded',now())
           ON CONFLICT (key) DO UPDATE SET row_count=EXCLUDED.row_count, status='loaded', last_ingested=now()
           WHERE geo.dataset_meta.source_url='(demo seed)'`,
          key,
          label,
          count,
        );
      }
    } catch (err) {
      this.logger.warn(`geo demo seed skipped (PostGIS/geo not available?): ${String(err)}`);
    }
  }

  /** Best-effort removal of demo-labelled rows (FK-safe order). */
  async clearDemo(): Promise<void> {
    const tenantId = await this.org();
    const demoContacts = buildDemoContacts();
    const addresses = demoContacts.map((c) => c.address);
    const demoPhones = [
      ...demoContacts.map((c) => c.phoneE164).filter((p): p is string => Boolean(p)),
      DEMO_SENDER_PHONE,
    ];
    await this.prisma.doorKnock.deleteMany({ where: { tenantId, localId: { startsWith: "demo:knock:" } } });
    // Shifts and their seats, before the campaign/turf they hang off.
    await this.prisma.shiftAssignment.deleteMany({
      where: { tenantId, shift: { name: { in: DEMO_SHIFTS.map((s) => s.name) } } },
    });
    await this.prisma.shift.deleteMany({ where: { tenantId, name: { in: DEMO_SHIFTS.map((s) => s.name) } } });
    await this.prisma.eventRsvp.deleteMany({
      where: { tenantId, event: { title: { in: DEMO_EVENTS.map((e) => e.title) } } },
    });
    await this.prisma.event.deleteMany({ where: { tenantId, title: { in: DEMO_EVENTS.map((e) => e.title) } } });
    // Walk lists and turf assignments were never cleared — they only vanished if a cascade from
    // Turf/Campaign happened to reach them, which left a stale walk list surviving a re-seed and
    // silently pinning the fixture at whatever size it had when first created.
    await this.prisma.walkList.deleteMany({ where: { tenantId, name: DEMO_WALK_LIST.name } });
    await this.prisma.turfAssignment.deleteMany({ where: { turf: { tenantId, name: DEMO_TURF.name } } });
    await this.prisma.contactTagAssignment.deleteMany({ where: { tenantId, source: DEMO_TAG } });
    await this.prisma.contactTag.deleteMany({ where: { tenantId, key: { in: DEMO_TAGS.map((t) => t.key) } } });
    await this.prisma.suppression.deleteMany({ where: { tenantId, source: DEMO_TAG } });
    await this.prisma.audienceSegment.deleteMany({
      where: { tenantId, name: { in: DEMO_SEARCHES.map((s) => s.name) } },
    });
    // Inbox threads: messages by their deterministic demo SID, then the conversation rows. Both
    // before the Contact delete — the FKs are SetNull, so orphans would otherwise survive as
    // phone-only threads cluttering the inbox.
    await this.prisma.inboundMessage.deleteMany({
      where: { tenantId, twilioMessageSid: { startsWith: "demo:thread:" } },
    });
    await this.prisma.outboundMessage.deleteMany({
      where: { tenantId, twilioMessageSid: { startsWith: "demo:thread:" } },
    });
    await this.prisma.conversationState.deleteMany({ where: { tenantId, contactPhone: { in: demoPhones } } });
    await this.prisma.canvassCampaign.deleteMany({ where: { tenantId, name: DEMO_CAMPAIGN.name } });
    await this.prisma.turf.deleteMany({ where: { tenantId, name: DEMO_TURF.name } });
    await this.prisma.contact.deleteMany({ where: { tenantId, address: { in: addresses } } });
    await this.prisma.survey.deleteMany({
      where: { tenantId, name: { in: [DEMO_SURVEY.name, ...DEMO_EXTRA_SURVEYS.map((s) => s.name)] } },
    });
    await this.prisma.script.deleteMany({
      where: { tenantId, name: { in: [DEMO_SCRIPT.name, ...DEMO_EXTRA_SCRIPTS.map((s) => s.name)] } },
    });
    await this.prisma.journey.deleteMany({ where: { tenantId, name: DEMO_JOURNEY.name } });
    await this.prisma.cannedResponse.deleteMany({
      where: {
        tenantId,
        title: { in: [...DEMO_CANNED.map((c) => c.title), ...DEMO_EXTRA_CANNED.map((c) => c.title)] },
      },
    });
    await this.prisma.blast.deleteMany({
      where: { tenantId, title: { in: [EXAMPLE_BLAST_TITLE, ...DEMO_BLASTS.map((b) => b.title)] } },
    });
    await this.prisma.audience.deleteMany({
      where: { tenantId, name: { in: [EXAMPLE_AUDIENCE_NAME, ...DEMO_AUDIENCES.map((a) => a.name)] } },
    });
    const demoEmails = [DEMO_LOGINS.organiser.email, DEMO_LOGINS.volunteer.email, DEMO_LOGINS.owner.email];
    const demoUsers = await this.prisma.user.findMany({
      where: { email: { in: demoEmails } },
      select: { id: true },
    });
    const demoUserIds = demoUsers.map((u) => u.id);
    // Remove this tenant's memberships first, then delete the demo users ONLY if
    // they have no remaining memberships in other tenants (don't orphan shared users).
    await this.prisma.tenantMember.deleteMany({ where: { tenantId, userId: { in: demoUserIds } } });
    await this.prisma.user.deleteMany({
      where: { email: { in: demoEmails }, tenantMembers: { none: {} } },
    });
    try {
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.address_region WHERE gnaf_pid LIKE 'demo:gnaf:%'`);
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.gnaf_address WHERE gnaf_pid LIKE 'demo:gnaf:%'`);
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.ced WHERE code='DEMO-FED'`);
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.sed WHERE code='DEMO-STATE'`);
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.lga WHERE code='DEMO-LGA'`);
      await this.prisma.$executeRawUnsafe(`DELETE FROM geo.dataset_meta WHERE source_url='(demo seed)'`);
    } catch {
      /* geo not present — fine */
    }
    this.logger.log(`Demo seed cleared for org ${tenantId}.`);
  }
}
