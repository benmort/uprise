import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AppUserRole,
  AudienceSource,
  Prisma,
  WalkListItemListType,
} from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/password.util";
import { EngagementService } from "../shared-engagement/engagement.service";
import { CanvassingService } from "../canvassing/canvassing.service";
import {
  DEFAULT_TOUR_TEMPLATE,
  DEMO_CAMPAIGN,
  DEMO_CANNED,
  DEMO_JOURNEY,
  DEMO_KNOCKS,
  DEMO_LOGINS,
  DEMO_SCRIPT,
  DEMO_SURVEY,
  DEMO_TURF,
  DEMO_WALK_LIST,
  EXAMPLE_AUDIENCE_NAME,
  EXAMPLE_BLAST_TITLE,
  buildDemoContacts,
} from "./seed-data";

export type SeedResult = {
  organizationId: string;
  organiserEmail: string;
  canvasserEmail: string;
  canvasserId: string;
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
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    const org = await this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
    return org.id;
  }

  private async upsertUser(
    organizationId: string,
    login: { email: string; password: string; displayName: string },
    role: AppUserRole,
  ): Promise<string> {
    const existing = await this.prisma.appUser.findUnique({ where: { email: login.email } });
    if (existing) return existing.id;
    const user = await this.prisma.appUser.create({
      data: {
        organizationId,
        email: login.email,
        displayName: login.displayName,
        passwordHash: await hashPassword(login.password),
        role,
      },
    });
    return user.id;
  }

  async seedDemo(): Promise<SeedResult> {
    const organizationId = await this.org();
    await this.engagement.ensureDefaultDispositions();

    await this.upsertUser(organizationId, DEMO_LOGINS.organiser, AppUserRole.ORGANISER);
    const canvasserId = await this.upsertUser(organizationId, DEMO_LOGINS.canvasser, AppUserRole.CANVASSER);

    // Campaign
    const campaign =
      (await this.prisma.canvassCampaign.findFirst({ where: { organizationId, name: DEMO_CAMPAIGN.name } })) ??
      (await this.prisma.canvassCampaign.create({
        data: { organizationId, name: DEMO_CAMPAIGN.name, status: "ACTIVE", goals: { doors: 500, conversations: 120 } },
      }));

    // Turf
    const turf =
      (await this.prisma.turf.findFirst({ where: { organizationId, name: DEMO_TURF.name } })) ??
      (await this.prisma.turf.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          name: DEMO_TURF.name,
          geometry: DEMO_TURF.geometry as unknown as Prisma.InputJsonValue,
        },
      }));

    // Contacts (inside the turf)
    const contacts = buildDemoContacts();
    const contactIds: string[] = [];
    for (const c of contacts) {
      const found = await this.prisma.contact.findFirst({ where: { organizationId, address: c.address } });
      const row =
        found ??
        (await this.prisma.contact.create({
          data: {
            organizationId,
            turfId: turf.id,
            firstName: c.firstName,
            lastName: c.lastName,
            address: c.address,
            phoneE164: c.phoneE164,
            lat: c.lat,
            lng: c.lng,
          },
        }));
      if (!found && row.turfId !== turf.id) {
        await this.prisma.contact.update({ where: { id: row.id }, data: { turfId: turf.id } });
      }
      contactIds.push(row.id);
    }

    // Walk list
    let walkList = await this.prisma.walkList.findFirst({
      where: { organizationId, name: DEMO_WALK_LIST.name },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
    if (!walkList) {
      const created = await this.canvassing.createWalkList(organizationId, {
        name: DEMO_WALK_LIST.name,
        turfId: turf.id,
        campaignId: campaign.id,
        contactIds,
        listType: WalkListItemListType.STATIC,
      });
      walkList = await this.prisma.walkList.findUnique({
        where: { id: created.id },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });
    }
    const stopId = walkList?.items[0]?.id ?? null;

    // Assign the turf to the demo canvasser (idempotent re-claim).
    await this.canvassing.assignTurf(organizationId, turf.id, canvasserId);

    // A few door knocks (idempotent on localId; wires dispositions + journeys).
    for (const k of DEMO_KNOCKS) {
      const contactId = contactIds[k.contactIndex];
      if (!contactId) continue;
      await this.canvassing.recordDoorKnock(organizationId, {
        contactId,
        canvasserId,
        localId: `demo:knock:${k.contactIndex}`,
        dispositionCode: k.dispositionCode,
        walkListItemId: walkList?.items[k.contactIndex]?.id ?? null,
        lat: contacts[k.contactIndex].lat,
        lng: contacts[k.contactIndex].lng,
      });
    }

    // Audience + blast (canonical example, shared with the tour).
    const audience =
      (await this.prisma.audience.findFirst({ where: { organizationId, name: EXAMPLE_AUDIENCE_NAME } })) ??
      (await this.prisma.audience.create({
        data: { organizationId, name: EXAMPLE_AUDIENCE_NAME, source: AudienceSource.CSV },
      }));
    const blast =
      (await this.prisma.blast.findFirst({ where: { organizationId, title: EXAMPLE_BLAST_TITLE } })) ??
      (await this.prisma.blast.create({
        data: {
          organizationId,
          title: EXAMPLE_BLAST_TITLE,
          bodyTemplate: DEFAULT_TOUR_TEMPLATE,
          audienceId: audience.id,
        },
      }));

    // Survey (dual-channel options)
    const survey =
      (await this.prisma.survey.findFirst({ where: { organizationId, name: DEMO_SURVEY.name } })) ??
      (await this.prisma.survey.create({
        data: {
          organizationId,
          name: DEMO_SURVEY.name,
          questions: {
            create: DEMO_SURVEY.questions.map((q, qi) => ({
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
      (await this.prisma.script.findFirst({ where: { organizationId, name: DEMO_SCRIPT.name } })) ??
      (await this.prisma.script.create({
        data: {
          organizationId,
          name: DEMO_SCRIPT.name,
          steps: { create: DEMO_SCRIPT.steps.map((s) => ({ bodyText: s.bodyText, outcomeKey: s.outcomeKey ?? null, orderIndex: s.orderIndex })) },
        },
      }));

    // Journey
    const journey =
      (await this.prisma.journey.findFirst({ where: { organizationId, name: DEMO_JOURNEY.name } })) ??
      (await this.prisma.journey.create({
        data: {
          organizationId,
          name: DEMO_JOURNEY.name,
          triggerType: DEMO_JOURNEY.triggerType,
          triggerConfig: DEMO_JOURNEY.triggerConfig as Prisma.InputJsonValue,
          rungs: { create: DEMO_JOURNEY.rungs.map((r, i) => ({ rungIndex: i, type: r.type, config: r.config as Prisma.InputJsonValue })) },
        },
      }));

    // Canned responses
    for (const cr of DEMO_CANNED) {
      const exists = await this.prisma.cannedResponse.findFirst({ where: { organizationId, title: cr.title } });
      if (!exists) {
        await this.prisma.cannedResponse.create({
          data: { organizationId, title: cr.title, body: cr.body, dispositionCode: cr.dispositionCode },
        });
      }
    }

    this.logger.log(`Demo seed complete for org ${organizationId}.`);
    return {
      organizationId,
      organiserEmail: DEMO_LOGINS.organiser.email,
      canvasserEmail: DEMO_LOGINS.canvasser.email,
      canvasserId,
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

  /** Best-effort removal of demo-labelled rows (FK-safe order). */
  async clearDemo(): Promise<void> {
    const organizationId = await this.org();
    const addresses = buildDemoContacts().map((c) => c.address);
    await this.prisma.doorKnock.deleteMany({ where: { organizationId, localId: { startsWith: "demo:knock:" } } });
    await this.prisma.canvassCampaign.deleteMany({ where: { organizationId, name: DEMO_CAMPAIGN.name } });
    await this.prisma.turf.deleteMany({ where: { organizationId, name: DEMO_TURF.name } });
    await this.prisma.contact.deleteMany({ where: { organizationId, address: { in: addresses } } });
    await this.prisma.survey.deleteMany({ where: { organizationId, name: DEMO_SURVEY.name } });
    await this.prisma.script.deleteMany({ where: { organizationId, name: DEMO_SCRIPT.name } });
    await this.prisma.journey.deleteMany({ where: { organizationId, name: DEMO_JOURNEY.name } });
    await this.prisma.cannedResponse.deleteMany({ where: { organizationId, title: { in: DEMO_CANNED.map((c) => c.title) } } });
    await this.prisma.blast.deleteMany({ where: { organizationId, title: EXAMPLE_BLAST_TITLE } });
    await this.prisma.audience.deleteMany({ where: { organizationId, name: EXAMPLE_AUDIENCE_NAME } });
    await this.prisma.appUser.deleteMany({
      where: { organizationId, email: { in: [DEMO_LOGINS.organiser.email, DEMO_LOGINS.canvasser.email] } },
    });
    this.logger.log(`Demo seed cleared for org ${organizationId}.`);
  }
}
