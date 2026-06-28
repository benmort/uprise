import { Injectable, Logger } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import {
  AppUserRole,
  EngagementChannel,
  Prisma,
  SupportLevel,
  TurfAssignmentStatus,
  WalkListItemListType,
  WalkListItemStatus,
} from "@uprise/db";
import { put } from "@vercel/blob";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { pointInGeometry, type LngLat } from "../common/utils/geo.utils";
import { hashPassword } from "../auth/password.util";
import { EngagementService } from "../shared-engagement/engagement.service";
import { GeoService } from "../geo/geo.service";

/** Which addresses a turf should be populated with when it's cut. */
export type TurfUniverse = "existing" | "none" | "hybrid";

const SUPPORT_LEVELS: SupportLevel[] = [
  SupportLevel.STRONG_SUPPORT,
  SupportLevel.LEAN_SUPPORT,
  SupportLevel.UNDECIDED,
  SupportLevel.LEAN_OPPOSE,
  SupportLevel.STRONG_OPPOSE,
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type SurveyAnswerInput = {
  questionId: string;
  optionId?: string | null;
  valueText?: string | null;
};

export type RecordDoorKnockInput = {
  contactId: string;
  volunteerId: string;
  localId: string;
  dispositionCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  clientCapturedAt?: string | null;
  walkListItemId?: string | null;
  photoUrl?: string | null;
  safetyFlag?: boolean | null;
  surveyAnswers?: SurveyAnswerInput[] | null;
};

@Injectable()
export class CanvassingService {
  private readonly logger = new Logger(CanvassingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
    private readonly geo: GeoService,
  ) {}

  // ── Turf assignment (server-owned lock) ─────────────────────────
  /**
   * Claim a turf for a volunteer. The partial unique index
   * (TurfAssignment_one_active_per_turf) guarantees at most one ASSIGNED row per
   * turf, so a second claimant gets a 409 rather than a silent double-assignment.
   */
  async assignTurf(
    tenantId: string,
    turfId: string,
    volunteerId: string,
    lockedUntil?: Date,
  ) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");

    try {
      return await this.prisma.turfAssignment.create({
        data: { turfId, volunteerId, status: TurfAssignmentStatus.ASSIGNED, lockedUntil },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const current = await this.prisma.turfAssignment.findFirst({
          where: { turfId, status: TurfAssignmentStatus.ASSIGNED },
        });
        if (current?.volunteerId === volunteerId) return current; // idempotent re-claim
        throw new ApiHttpException("TURF_LOCKED", "This turf is already assigned to another volunteer");
      }
      throw error;
    }
  }

  async releaseTurf(tenantId: string, turfId: string, volunteerId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    return this.prisma.turfAssignment.updateMany({
      where: { turfId, volunteerId, status: TurfAssignmentStatus.ASSIGNED },
      data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
    });
  }

  /** The turfs (and their walk lists) currently locked to a volunteer. */
  async listAssignments(tenantId: string, volunteerId: string) {
    const assignments = await this.prisma.turfAssignment.findMany({
      where: { volunteerId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId } },
      include: {
        turf: {
          include: { walkLists: { include: { items: { orderBy: { orderIndex: "asc" }, include: { contact: true } } } } },
        },
      },
    });
    return assignments.map((a) => ({
      turfId: a.turfId,
      lockedUntil: a.lockedUntil,
      turf: { id: a.turf.id, name: a.turf.name, geometry: a.turf.geometry, campaignId: a.turf.campaignId },
      walkLists: a.turf.walkLists,
    }));
  }

  // ── Door knocks (idempotent + lock-enforced) ────────────────────
  /**
   * Record a door knock. Idempotent on (org, localId) so a re-synced offline
   * knock is deduped. Enforces the turf lock: a volunteer can only knock a
   * contact whose turf is currently assigned to them (else 409). When a
   * disposition is given it's recorded through the shared engagement layer, so
   * it lands on the contact timeline AND fires journey triggers.
   */
  /**
   * Upload a door-knock photo to blob storage and return its public URL (stored on
   * DoorKnock.photoUrl). Gated on BLOB_READ_WRITE_TOKEN so it degrades clearly when
   * storage isn't configured.
   */
  async uploadDoorPhoto(file?: { buffer?: Buffer; originalname?: string; mimetype?: string }) {
    if (!file?.buffer) throw new ApiHttpException("NO_FILE", "No photo provided");
    // Blob credentials resolve from the env: a static BLOB_READ_WRITE_TOKEN (local/dev) or,
    // in the Vercel runtime, OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID). Require at least one.
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token && !process.env.BLOB_STORE_ID) {
      throw new ApiHttpException("PHOTO_STORAGE_NOT_CONFIGURED", "Photo storage is not configured");
    }
    const ext = (file.originalname?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `door-knocks/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || "jpg"}`;
    const { url } = await put(key, file.buffer, {
      access: "public",
      contentType: file.mimetype,
      ...(token ? { token } : {}),
    });
    return { url };
  }

  /** Create a household/resident at the door (cold "addresses without contacts" universe). */
  async createDoorContact(
    tenantId: string,
    input: {
      volunteerId: string;
      turfId: string;
      firstName?: string;
      lastName?: string;
      address?: string;
      phoneE164?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    // The volunteer must hold this turf's lock to add to it.
    const lock = await this.prisma.turfAssignment.findFirst({
      where: { turfId: input.turfId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId } },
    });
    if (!lock || lock.volunteerId !== input.volunteerId) {
      throw new ApiHttpException("TURF_NOT_ASSIGNED", "This turf is not assigned to you");
    }
    return this.prisma.contact.create({
      data: {
        tenantId,
        turfId: input.turfId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        address: input.address ?? null,
        phoneE164: input.phoneE164 ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
      },
      select: { id: true, firstName: true, lastName: true, address: true },
    });
  }

  async recordDoorKnock(tenantId: string, input: RecordDoorKnockInput) {
    const existing = await this.prisma.doorKnock.findUnique({
      where: { tenantId_localId: { tenantId, localId: input.localId } },
    });
    if (existing) return existing; // idempotent replay

    await this.assertVolunteerOwnsContactTurf(tenantId, input.contactId, input.volunteerId);

    const knock = await this.prisma.doorKnock.create({
      data: {
        tenantId,
        contactId: input.contactId,
        volunteerId: input.volunteerId,
        walkListItemId: input.walkListItemId ?? null,
        localId: input.localId,
        dispositionCode: input.dispositionCode ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        notes: input.notes ?? null,
        photoUrl: input.photoUrl ?? null,
        safetyFlag: input.safetyFlag ?? null,
        clientCapturedAt: input.clientCapturedAt ? new Date(input.clientCapturedAt) : null,
      },
    });

    if (input.walkListItemId) {
      await this.prisma.walkListItem.updateMany({
        where: { id: input.walkListItemId },
        data: { status: WalkListItemStatus.VISITED },
      });
    }

    if (input.dispositionCode) {
      await this.engagement.recordDisposition(tenantId, {
        contactId: input.contactId,
        code: input.dispositionCode,
        channel: EngagementChannel.DOOR,
        recordedById: input.volunteerId,
      });
    }

    // Persist survey answers collected at the door as structured QuestionResponses
    // (each option that maps a disposition also records one). Runs only on first
    // create — the idempotent-replay return above means a re-synced knock can't
    // double-insert these. The knock + disposition are already committed above, so a
    // single bad answer (e.g. a question/option deleted after offline capture, hitting
    // a QuestionResponse FK) must NOT 500 the request and orphan the knock: we record
    // each answer best-effort and log failures rather than abort. The web only sends
    // ids from the live campaign survey, so this is an edge-case guard.
    if (input.surveyAnswers?.length) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: input.contactId, tenantId },
        select: { turf: { select: { campaignId: true } } },
      });
      const campaignId = contact?.turf?.campaignId ?? null;
      for (const answer of input.surveyAnswers) {
        try {
          await this.engagement.recordSurveyAnswer(tenantId, {
            contactId: input.contactId,
            questionId: answer.questionId,
            optionId: answer.optionId ?? null,
            valueText: answer.valueText ?? null,
            channel: EngagementChannel.DOOR,
            campaignId,
            recordedById: input.volunteerId,
          });
        } catch (error) {
          this.logger.warn(
            `Skipped survey answer for knock ${input.localId} (question ${answer.questionId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return knock;
  }

  private async assertVolunteerOwnsContactTurf(
    tenantId: string,
    contactId: string,
    volunteerId: string,
  ): Promise<void> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { turfId: true },
    });
    if (!contact) throw new ApiHttpException("CONTACT_NOT_FOUND", "Contact not found");
    if (!contact.turfId) return; // contact not in any turf — no lock to enforce

    const lock = await this.prisma.turfAssignment.findFirst({
      where: { turfId: contact.turfId, status: TurfAssignmentStatus.ASSIGNED },
    });
    if (!lock || lock.volunteerId !== volunteerId) {
      throw new ApiHttpException(
        "TURF_NOT_ASSIGNED",
        "This contact's turf is not assigned to you",
      );
    }
  }

  /** Volunteers (and organisers) available for turf assignment. */
  async listVolunteers(tenantId: string) {
    // Identity (User) and membership (TenantMember) are separate tables: the
    // role lives on the membership, name/email on the user.
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      select: { userId: true, role: true },
    });
    if (members.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true },
    });
    const roleByUser = new Map(members.map((m) => [m.userId, m.role]));
    return users.map((u) => ({ ...u, role: roleByUser.get(u.id) ?? AppUserRole.VOLUNTEER }));
  }

  /**
   * Provision a field login: create a User (identity) + a TenantMember (the
   * tenant-scoped role) with a hashed password. Used by the volunteer-management
   * invite flow. Email is unique; a clash returns 409.
   */
  async createVolunteer(
    tenantId: string,
    input: { displayName: string; email: string; password: string; role?: AppUserRole },
  ) {
    const passwordHash = await hashPassword(input.password);
    const role = input.role ?? AppUserRole.VOLUNTEER;
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            displayName: input.displayName,
            email: input.email.toLowerCase(),
            passwordHash,
          },
          select: { id: true, displayName: true, email: true },
        });
        await tx.tenantMember.create({ data: { tenantId, userId: u.id, role } });
        return u;
      });
      return { ...user, role };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiHttpException("EMAIL_TAKEN", "A user with that email already exists");
      }
      throw error;
    }
  }

  /** Edit a volunteer/organiser: rename, change role, or reset the password. */
  async updateVolunteer(
    tenantId: string,
    id: string,
    input: { displayName?: string; role?: AppUserRole; password?: string },
  ) {
    const membership = await this.prisma.tenantMember.findFirst({ where: { userId: id, tenantId } });
    if (!membership) throw new ApiHttpException("USER_NOT_FOUND", "User not found");
    const userData: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) userData.displayName = input.displayName;
    if (input.password) userData.passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u =
          Object.keys(userData).length > 0
            ? await tx.user.update({
                where: { id },
                data: userData,
                select: { id: true, displayName: true, email: true },
              })
            : await tx.user.findUniqueOrThrow({
                where: { id },
                select: { id: true, displayName: true, email: true },
              });
        let role = membership.role;
        if (input.role !== undefined) {
          const updated = await tx.tenantMember.update({
            where: { tenantId_userId: { tenantId, userId: id } },
            data: { role: input.role },
          });
          role = updated.role;
        }
        return { ...u, role };
      });
    } catch (error) {
      // The FK + cascade make an orphaned membership impossible, but map the
      // record-not-found error to the API contract defensively.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ApiHttpException("USER_NOT_FOUND", "User not found");
      }
      throw error;
    }
  }

  /** Contacts that fall in a turf, route-orderable for a walk list. */
  async listTurfContacts(tenantId: string, turfId: string) {
    return this.prisma.contact.findMany({
      where: { tenantId, turfId },
      orderBy: { createdAt: "asc" },
      select: { id: true, firstName: true, lastName: true, address: true, lat: true, lng: true },
    });
  }

  // ── Authoring (organiser) ───────────────────────────────────────
  /** Turfs for an org with their active assignment + door counts. */
  async listTurfs(tenantId: string, campaignId?: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        assignments: { where: { status: TurfAssignmentStatus.ASSIGNED }, include: { volunteer: true } },
        _count: { select: { contacts: true, walkLists: true } },
        walkLists: { select: { items: { select: { status: true } } } },
      },
    });
    return turfs.map((t) => {
      const items = t.walkLists.flatMap((w) => w.items);
      const totalStops = items.length;
      const visitedStops = items.filter((i) => i.status === WalkListItemStatus.VISITED).length;
      return {
        id: t.id,
        name: t.name,
        campaignId: t.campaignId,
        geometry: t.geometry,
        contactCount: t._count.contacts,
        walkListCount: t._count.walkLists,
        totalStops,
        visitedStops,
        assignedTo: t.assignments[0]
          ? { volunteerId: t.assignments[0].volunteerId, name: t.assignments[0].volunteer.displayName }
          : null,
      };
    });
  }

  /**
   * Cut a turf straight from an electoral/LGA division boundary (geo schema).
   * When `universe` is "none"/"hybrid", cold doors inside the boundary are
   * materialised into the turf (see loadUniverseIntoTurf).
   */
  async createTurfFromDivision(
    tenantId: string,
    input: {
      type: "ced" | "sed" | "lga";
      code: string;
      name?: string;
      campaignId?: string | null;
      universe?: TurfUniverse;
    },
  ) {
    const table = { ced: "geo.ced", sed: "geo.sed", lga: "geo.lga" }[input.type];
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT name, ST_AsGeoJSON(geom) AS geojson FROM ${table} WHERE code = $1`,
      input.code,
    )) as Array<{ name: string; geojson: string | null }>;
    if (rows.length === 0 || !rows[0].geojson) {
      throw new ApiHttpException("DIVISION_NOT_FOUND", "Division boundary not found");
    }
    const turf = await this.createTurf(tenantId, {
      name: input.name || rows[0].name,
      geometry: JSON.parse(rows[0].geojson),
      campaignId: input.campaignId ?? null,
    });
    if (input.universe && input.universe !== "existing") {
      await this.loadUniverseIntoTurf(tenantId, turf.id, { universe: input.universe });
    }
    return turf;
  }

  /**
   * Cut a turf from a mixed selection of statistical areas (meshblock / SA1-3)
   * and/or free-drawn polygons. The boundary is the PostGIS union of every
   * selected piece, so the saved geometry is full-precision regardless of what
   * the map rendered. Existing-contact bucketing + cold-door loading are left to
   * the caller (rebucket + load-universe), matching the polygon path.
   */
  async createTurfFromAreas(
    tenantId: string,
    input: {
      name: string;
      campaignId?: string | null;
      areas: Array<{ layer: "mb" | "sa1" | "sa2" | "sa3"; code: string }>;
      polygons?: Record<string, unknown>[];
    },
  ) {
    const geometry = await this.geo.unionAreas(input.areas ?? [], input.polygons ?? []);
    if (!geometry) {
      throw new ApiHttpException("EMPTY_SELECTION", "Select at least one area or draw a polygon");
    }
    return this.createTurf(tenantId, {
      name: input.name,
      geometry,
      campaignId: input.campaignId ?? null,
    });
  }

  /**
   * Materialise the "addresses without contacts" universe for a turf: pull cold
   * G-NAF addresses inside the turf polygon (via GeoService) and create Contact
   * rows so they become canvassable stops in walk lists. Cold doors carry a
   * `gnafPid` + `metadata.coldDoor`, so the geo "withoutContacts" filter excludes
   * them on re-run — and we also skip any gnafPid already on a contact for the
   * org, making this idempotent. Degrades to a no-op (0 materialised) when no geo
   * data is loaded. "existing" never adds cold doors (rebucketTurf covers those).
   */
  async loadUniverseIntoTurf(
    tenantId: string,
    turfId: string,
    opts: { universe: TurfUniverse; limit?: number },
  ): Promise<{ materialised: number; total: number }> {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");

    let materialised = 0;
    if (opts.universe !== "existing") {
      const addresses = (await this.geo.addresses(tenantId, {
        turfId,
        withoutContacts: true,
        limit: opts.limit ?? 2000,
      })) as Array<{ gnafPid: string; address: string | null; lat: number | null; lng: number | null }>;

      const pids = addresses.map((a) => a.gnafPid).filter(Boolean);
      const seen = new Set(
        pids.length
          ? (
              await this.prisma.contact.findMany({
                where: { tenantId, gnafPid: { in: pids } },
                select: { gnafPid: true },
              })
            ).map((c) => c.gnafPid)
          : [],
      );
      const fresh = addresses.filter((a) => a.gnafPid && !seen.has(a.gnafPid));
      if (fresh.length) {
        await this.prisma.contact.createMany({
          data: fresh.map((a) => ({
            tenantId,
            turfId,
            gnafPid: a.gnafPid,
            address: a.address ?? null,
            lat: a.lat ?? null,
            lng: a.lng ?? null,
            metadata: { coldDoor: true } as Prisma.InputJsonValue,
          })),
        });
        materialised = fresh.length;
      }
    }

    const total = await this.prisma.contact.count({ where: { tenantId, turfId } });
    return { materialised, total };
  }

  async createTurf(tenantId: string, input: { name: string; geometry: unknown; campaignId?: string | null }) {
    return this.prisma.turf.create({
      data: {
        tenantId,
        name: input.name,
        geometry: input.geometry as Prisma.InputJsonValue,
        campaignId: input.campaignId ?? null,
      },
    });
  }

  async createWalkList(
    tenantId: string,
    input: {
      name: string;
      turfId?: string | null;
      campaignId?: string | null;
      contactIds: string[];
      listType?: WalkListItemListType;
    },
  ) {
    return this.prisma.walkList.create({
      data: {
        tenantId,
        name: input.name,
        turfId: input.turfId ?? null,
        campaignId: input.campaignId ?? null,
        listType: input.listType ?? WalkListItemListType.STATIC,
        items: {
          create: input.contactIds.map((contactId, orderIndex) => ({ contactId, orderIndex })),
        },
      },
      include: { items: { orderBy: { orderIndex: "asc" } } },
    });
  }

  /** Rename a walk list / switch its STATIC↔DYNAMIC mode. */
  async updateWalkList(
    tenantId: string,
    id: string,
    input: { name?: string; listType?: WalkListItemListType },
  ) {
    const existing = await this.prisma.walkList.findFirst({ where: { id, tenantId } });
    if (!existing) throw new ApiHttpException("WALK_LIST_NOT_FOUND", "Walk list not found");
    const data: Prisma.WalkListUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.listType !== undefined) data.listType = input.listType;
    return this.prisma.walkList.update({ where: { id }, data });
  }

  /** Rename / reshape a turf boundary. Geometry changes don't auto-rebucket. */
  async updateTurf(
    tenantId: string,
    turfId: string,
    input: { name?: string; geometry?: unknown },
  ) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    const data: Prisma.TurfUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.geometry !== undefined) data.geometry = input.geometry as Prisma.InputJsonValue;
    return this.prisma.turf.update({ where: { id: turfId }, data });
  }

  /**
   * Re-bucket contacts against a turf's current boundary: claim every
   * geocoded org contact that now falls inside, and release contacts
   * previously in this turf that fall outside. Point-in-polygon runs in-process
   * via the shared geo util (GeoJSON [lng, lat] order). Returns the deltas.
   */
  async rebucketTurf(tenantId: string, turfId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    const geometry = turf.geometry as { type?: string; coordinates?: unknown } | null;

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        lat: { not: null },
        lng: { not: null },
        OR: [{ turfId: null }, { turfId }],
      },
      select: { id: true, lat: true, lng: true, turfId: true },
    });

    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const c of contacts) {
      const point: LngLat = [c.lng as number, c.lat as number];
      const inside = pointInGeometry(point, geometry);
      if (inside && c.turfId !== turfId) toAdd.push(c.id);
      else if (!inside && c.turfId === turfId) toRemove.push(c.id);
    }

    if (toAdd.length) {
      await this.prisma.contact.updateMany({ where: { id: { in: toAdd } }, data: { turfId } });
    }
    if (toRemove.length) {
      await this.prisma.contact.updateMany({ where: { id: { in: toRemove } }, data: { turfId: null } });
    }

    const total = await this.prisma.contact.count({ where: { tenantId, turfId } });
    return { added: toAdd.length, removed: toRemove.length, total };
  }

  // ── Shifts (G8) ─────────────────────────────────────────────────
  async listShifts(tenantId: string, campaignId?: string) {
    return this.prisma.shift.findMany({
      where: { tenantId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { startsAt: "asc" },
    });
  }

  async createShift(
    tenantId: string,
    input: { campaignId: string; name: string; startsAt: string; endsAt: string; location?: string },
  ) {
    return this.prisma.shift.create({
      data: {
        tenantId,
        campaignId: input.campaignId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        location: input.location ?? null,
      },
    });
  }

  async deleteShift(tenantId: string, id: string) {
    const res = await this.prisma.shift.deleteMany({ where: { id, tenantId } });
    if (res.count === 0) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found");
    return { deleted: true };
  }

  async updateShift(
    tenantId: string,
    id: string,
    input: { name?: string; location?: string | null; startsAt?: string; endsAt?: string },
  ) {
    const existing = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!existing) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found");
    const data: Prisma.ShiftUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.location !== undefined) data.location = input.location;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
    return this.prisma.shift.update({ where: { id }, data });
  }

  // ── QA review (G10): flag suspicious knocks ─────────────────────
  /** Knocks that look suspect: too-fast cadence or missing GPS. Read-only heuristic. */
  async qaReview(tenantId: string, campaignId: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, campaignId },
      select: { id: true },
    });
    const turfIds = turfs.map((t) => t.id);
    if (turfIds.length === 0) return { flags: [] };

    const knocks = await this.prisma.doorKnock.findMany({
      where: { tenantId, contact: { turfId: { in: turfIds } } },
      orderBy: [{ volunteerId: "asc" }, { createdAt: "asc" }],
      include: { volunteer: { select: { displayName: true } } },
    });

    const flags: Array<{ id: string; volunteer: string | null; reason: string; at: Date }> = [];
    let prev: { volunteerId: string | null; at: Date } | null = null;
    for (const k of knocks) {
      if (k.lat == null || k.lng == null) {
        flags.push({ id: k.id, volunteer: k.volunteer?.displayName ?? null, reason: "No GPS captured", at: k.createdAt });
      }
      if (prev && prev.volunteerId === k.volunteerId) {
        const gapSec = (k.createdAt.getTime() - prev.at.getTime()) / 1000;
        if (gapSec >= 0 && gapSec < 20) {
          flags.push({
            id: k.id,
            volunteer: k.volunteer?.displayName ?? null,
            reason: `Knocked ${Math.round(gapSec)}s after previous`,
            at: k.createdAt,
          });
        }
      }
      prev = { volunteerId: k.volunteerId, at: k.createdAt };
    }
    return { flags };
  }

  /** Walk lists for an org, optionally filtered to one turf, with item stats + lock. */
  async listWalkLists(tenantId: string, turfId?: string) {
    const walkLists = await this.prisma.walkList.findMany({
      where: { tenantId, ...(turfId ? { turfId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } },
        items: { where: { status: WalkListItemStatus.VISITED }, select: { id: true } },
        turf: {
          select: {
            id: true,
            name: true,
            assignments: {
              where: { status: TurfAssignmentStatus.ASSIGNED },
              include: { volunteer: { select: { id: true, displayName: true } } },
            },
          },
        },
      },
    });
    return walkLists.map((w) => {
      const lock = w.turf?.assignments[0];
      return {
        id: w.id,
        name: w.name,
        turfId: w.turfId,
        campaignId: w.campaignId,
        listType: w.listType,
        stopCount: w._count.items,
        visitedCount: w.items.length,
        assignedTo: lock
          ? {
              volunteerId: lock.volunteerId,
              name: lock.volunteer.displayName,
              lockedSince: lock.assignedAt,
              lockedUntil: lock.lockedUntil,
            }
          : null,
        createdAt: w.createdAt,
      };
    });
  }
}
