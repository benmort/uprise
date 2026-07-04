import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AppUserRole,
  AudienceSource,
  Prisma,
  WalkListItemListType,
} from "@uprise/db";
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
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    const org = await this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
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

  async seedDemo(): Promise<SeedResult> {
    const tenantId = await this.org();
    await this.engagement.ensureDefaultDispositions();

    await this.upsertUser(tenantId, DEMO_LOGINS.organiser, AppUserRole.ORGANISER);
    const volunteerId = await this.upsertUser(tenantId, DEMO_LOGINS.volunteer, AppUserRole.VOLUNTEER);

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
      const row =
        found ??
        (await this.prisma.contact.create({
          data: {
            tenantId,
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
      where: { tenantId, name: DEMO_WALK_LIST.name },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
    if (!walkList) {
      const created = await this.canvassing.createWalkList(tenantId, {
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

    // Assign the turf to the demo volunteer (idempotent re-claim).
    await this.canvassing.assignTurf(tenantId, turf.id, volunteerId);

    // A few door knocks (idempotent on localId; wires dispositions + journeys).
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

    // Survey (dual-channel options)
    const survey =
      (await this.prisma.survey.findFirst({ where: { tenantId, name: DEMO_SURVEY.name } })) ??
      (await this.prisma.survey.create({
        data: {
          tenantId,
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
    const addresses = buildDemoContacts().map((c) => c.address);
    await this.prisma.doorKnock.deleteMany({ where: { tenantId, localId: { startsWith: "demo:knock:" } } });
    await this.prisma.canvassCampaign.deleteMany({ where: { tenantId, name: DEMO_CAMPAIGN.name } });
    await this.prisma.turf.deleteMany({ where: { tenantId, name: DEMO_TURF.name } });
    await this.prisma.contact.deleteMany({ where: { tenantId, address: { in: addresses } } });
    await this.prisma.survey.deleteMany({ where: { tenantId, name: DEMO_SURVEY.name } });
    await this.prisma.script.deleteMany({ where: { tenantId, name: DEMO_SCRIPT.name } });
    await this.prisma.journey.deleteMany({ where: { tenantId, name: DEMO_JOURNEY.name } });
    await this.prisma.cannedResponse.deleteMany({ where: { tenantId, title: { in: DEMO_CANNED.map((c) => c.title) } } });
    await this.prisma.blast.deleteMany({ where: { tenantId, title: EXAMPLE_BLAST_TITLE } });
    await this.prisma.audience.deleteMany({ where: { tenantId, name: EXAMPLE_AUDIENCE_NAME } });
    const demoEmails = [DEMO_LOGINS.organiser.email, DEMO_LOGINS.volunteer.email];
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
