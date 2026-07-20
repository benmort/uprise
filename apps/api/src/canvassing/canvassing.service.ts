import { Inject, Injectable, Logger } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import {
  AppUserRole,
  EngagementChannel,
  Prisma,
  ShiftAssignmentStatus,
  ShiftType,
  SupportLevel,
  TurfAssignmentStatus,
  WalkListItemListType,
  WalkListItemStatus,
} from "@uprise/db";
import { ImageUploadService } from "../common/storage/image-upload.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { ApiHttpException } from "../common/http/api-response";
import { geometryBbox, pointInGeometry, type LngLat } from "../common/utils/geo.utils";
import { hashPassword } from "../auth/password.util";
import { EngagementService } from "../shared-engagement/engagement.service";
import { EvaluationService } from "./evaluation.service";
import { HeatService } from "./heat.service";
import {
  GeoService,
  DIVISION_TABLES,
  type BoundarySource,
  type DivisionType,
  type TurfDivisionType,
} from "../geo/geo.service";
import { assertTurfAssignmentTransition } from "./turf-assignment-state.machine";
import { assertShiftAssignmentTransition } from "./shift-assignment-state.machine";
import { rankTurfsByPrefs, type CanvassPrefs } from "./recommend-turf";
import { MapboxDirectionsClient } from "./mapbox-directions.client";
import { optimiseRoute, haversineM, type Stop } from "./route-math";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { QUEUE_JOB_TYPES, QUEUE_NAMES, getTurfEstimateJobId } from "../common/queue/queue.constants";
import type { TurfEstimateRunJobPayload } from "../common/queue/queue.payloads";

/** Which addresses a turf should be populated with when it's cut. */
export type TurfUniverse = "existing" | "none" | "hybrid";

/** Outcome of (re)building a turf's canonical walk list. */
type ReconcileResult = { turfId: string; walkListId: string | null; items: number; added: number; removed: number };

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

/** Disposition codes that count as a conversation (the canvasser spoke to someone). */
const SPOKE_TO_CODES = ["spoke_to_target", "spoke_to_other"];

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
  /** APP 5 door consent — true only when the resident affirmatively agreed at the door. */
  consent?: boolean | null;
};

@Injectable()
export class CanvassingService {
  private readonly logger = new Logger(CanvassingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engagement: EngagementService,
    private readonly geo: GeoService,
    @Inject(DISPATCH_QUEUE_TOKEN) private readonly queue: DispatchQueue,
    private readonly images: ImageUploadService,
    private readonly directions: MapboxDirectionsClient,
    private readonly outbox: OutboxService,
    /** Optional tail deps (existing specs construct positionally); DI supplies them. */
    private readonly evaluation?: EvaluationService,
    private readonly heat?: HeatService,
  ) {}

  /**
   * Ask the `turf-estimate` worker to price this turf.
   *
   * Fired twice per cut — once when the polygon is saved, once when its doors are loaded —
   * and collapsed by the stable job id into a single run. `removeOnComplete` matters: the
   * dispatcher refuses any id it can still find, and BullMQ keeps the last thousand
   * completed jobs, so without it a re-cut of the same turf would silently never re-price.
   *
   * Never awaited for its result, and never allowed to fail a cut. A turf without a price is
   * one the UI stays quiet about; a cut that 500s because Redis hiccuped is a bug.
   */
  private async queueTurfEstimate(tenantId: string, turfId: string): Promise<void> {
    const payload: TurfEstimateRunJobPayload = { tenantId, turfId };
    await this.queue
      .enqueue({
        id: getTurfEstimateJobId(turfId),
        queue: QUEUE_NAMES.TURF_ESTIMATE,
        type: QUEUE_JOB_TYPES.TURF_ESTIMATE_RUN,
        payload,
        removeOnComplete: true,
      })
      .catch(() => undefined);
  }

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

  /** The walk-list item include shared by the single-turf payload: the per-item contact is
   *  narrowed to only the fields the field UI renders — the full Contact row (esp. the
   *  `metadata` JSON blob) times up to ~2000 doors/turf was the dominant payload cost on the
   *  canvasser's hot path. */
  private static readonly WALK_ITEMS_INCLUDE = {
    items: {
      orderBy: { orderIndex: "asc" as const },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            address: true,
            lat: true,
            lng: true,
            phoneE164: true,
            // gnafPid lets the canvasser-preview / field door popover fetch the
            // address's containing regions (null for non-cold-door contacts).
            gnafPid: true,
          },
        },
      },
    },
  };

  /** The turfs (and their walk lists) currently locked to a volunteer — the field BOOT payload.
   *  Deliberately slim: the turf ships a [w,s,e,n] bbox instead of its boundary GeoJSON, and
   *  each walk list ships door COUNTS instead of its items — the items (one narrowed contact
   *  each, up to ~2000 doors/turf) were still the dominant boot cost. The walk view fetches
   *  the ONE turf being walked in full via getAssignment (geometry + items). */
  async listAssignments(tenantId: string, volunteerId: string) {
    const include = {
      turf: {
        include: {
          walkLists: {
            select: { id: true, name: true, items: { select: { status: true } } },
          },
        },
      },
    };
    const load = () =>
      this.prisma.turfAssignment.findMany({
        where: { volunteerId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId } },
        include,
      });
    let assignments = await load();

    // Self-heal: a turf can be assigned before anyone built a walk-list from its bucketed contacts,
    // which would show the canvasser "0 doors · 0 min" and give them nothing to walk. Materialise a
    // default walk-list from the turf's contacts on first fetch, then reload so the payload carries it.
    const missing = assignments.filter((a) => a.turf.walkLists.length === 0);
    if (missing.length > 0) {
      await Promise.all(missing.map((a) => this.rebuildTurfWalkList(tenantId, a.turf.id).catch(() => undefined)));
      assignments = await load();
    }

    return assignments.map((a) => ({
      turfId: a.turfId,
      lockedUntil: a.lockedUntil,
      turf: {
        id: a.turf.id,
        name: a.turf.name,
        campaignId: a.turf.campaignId,
        // Enough for the assignment card's SVG thumbnail; the real boundary rides on getAssignment.
        bbox: geometryBbox(a.turf.geometry),
      },
      walkLists: a.turf.walkLists.map((w) => {
        const total = w.items.length;
        const pending = w.items.filter((i) => i.status === WalkListItemStatus.PENDING).length;
        const visited = w.items.filter((i) => i.status === WalkListItemStatus.VISITED).length;
        return { id: w.id, name: w.name, total, pending, visited };
      }),
    }));
  }

  /** ONE assigned turf in full — boundary geometry + walk lists WITH their items — for the
   *  walk view and door screen. Split from listAssignments so the boot path stays light and
   *  the heavy payload is fetched (and offline-cached under its own per-turf URL) only for
   *  the turf actually being walked. Self-heals a missing walk list like the list endpoint.
   *  404s when the turf isn't currently locked to this volunteer. */
  async getAssignment(tenantId: string, turfId: string, volunteerId: string) {
    const include = {
      turf: { include: { walkLists: { include: CanvassingService.WALK_ITEMS_INCLUDE } } },
    };
    const load = () =>
      this.prisma.turfAssignment.findFirst({
        where: { turfId, volunteerId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId } },
        include,
      });
    let assignment = await load();
    if (!assignment) {
      throw new ApiHttpException(
        "TURF_NOT_ASSIGNED",
        "This turf is not assigned to you",
        HttpStatus.NOT_FOUND,
      );
    }
    if (assignment.turf.walkLists.length === 0) {
      await this.rebuildTurfWalkList(tenantId, turfId).catch(() => undefined);
      assignment = (await load()) ?? assignment;
    }
    return {
      turfId: assignment.turfId,
      lockedUntil: assignment.lockedUntil,
      turf: {
        id: assignment.turf.id,
        name: assignment.turf.name,
        geometry: assignment.turf.geometry,
        campaignId: assignment.turf.campaignId,
      },
      walkLists: assignment.turf.walkLists,
    };
  }

  /** Contacts of a turf ordered as a walking route — server nearest-neighbour + 2-opt via
   *  route-math.optimiseRoute (NO external calls). Unlocated contacts (no lat/lng) sort to the end. */
  private async orderedTurfContactIds(tenantId: string, turfId: string): Promise<string[]> {
    const contacts =
      (await this.prisma.contact.findMany({
        where: { tenantId, turfId },
        select: { id: true, lat: true, lng: true },
      })) ?? [];
    const stops: Stop[] = contacts.map((c) => ({
      id: c.id,
      lat: typeof c.lat === "number" ? c.lat : Number.NaN,
      lng: typeof c.lng === "number" ? c.lng : Number.NaN,
    }));
    return optimiseRoute(stops).map((s) => s.id);
  }

  /**
   * (Re)build a turf's ONE canonical walk list as the OPTIMISED route over its current addresses —
   * the walk-lists page is where route optimisation is applied + persisted. Looks the list up BY TURF
   * (not by a hardcoded id) so a turf that already has a list — whatever its id — is reconciled in
   * place, never duplicated (duplicating it would double-count doors in the field). Reconcile preserves
   * each door's status + knocks: re-index kept items, add newly-bucketed contacts, drop departed ones.
   * Creates a fresh `wl_turf_<id>` list only when the turf has none; no-op when it has no contacts.
   * Concurrent CREATE races are handled (deterministic-id collision → re-find + reconcile). Concurrent
   * RECONCILE of the SAME turf is NOT fully serialised: the contact snapshot is read outside the write
   * transaction, so a rare interleave (two population steps racing) could drop a just-added door —
   * recoverable by re-running rebuild. Fast-follow if it matters: front the reconcile with a per-turf
   * `pg_advisory_xact_lock` inside one interactive transaction (see claimTurfInCampaign).
   */
  async rebuildTurfWalkList(tenantId: string, turfId: string): Promise<ReconcileResult> {
    const turf = await this.prisma.turf.findFirst({
      where: { id: turfId, tenantId },
      select: { id: true, name: true, tenantId: true, campaignId: true },
    });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");

    const orderedIds = await this.orderedTurfContactIds(tenantId, turfId);
    const findList = () =>
      this.prisma.walkList.findFirst({
        where: { turfId, tenantId },
        select: { id: true, items: { select: { id: true, contactId: true } } },
        orderBy: { createdAt: "asc" },
      });

    const existing = await findList();
    if (existing) return this.reconcileWalkListItems(existing, orderedIds, turfId);

    if (orderedIds.length === 0) return { turfId, walkListId: null, items: 0, added: 0, removed: 0 };
    try {
      await this.prisma.walkList.create({
        data: {
          id: `wl_turf_${turfId}`,
          tenantId,
          name: turf.name,
          turfId,
          campaignId: turf.campaignId,
          // Score provenance: which targeting run ranked the world this list was cut in.
          heatRunId: turf.campaignId ? await this.heat?.currentRunId(turf.campaignId) : null,
          listType: WalkListItemListType.STATIC,
          items: { create: orderedIds.map((contactId, orderIndex) => ({ contactId, orderIndex })) },
        },
      });
      return { turfId, walkListId: `wl_turf_${turfId}`, items: orderedIds.length, added: orderedIds.length, removed: 0 };
    } catch (error) {
      // A concurrent rebuild (or the field self-heal) created the list first — reconcile it instead of
      // 500ing on the deterministic-id collision.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const now = await findList();
        if (now) return this.reconcileWalkListItems(now, orderedIds, turfId);
      }
      throw error;
    }
  }

  /** Sync a walk list's items to `orderedIds` IN PLACE: re-index kept items (preserving status +
   *  knocks), create newly-present contacts, delete departed ones. Keyed on the list's OWN id. */
  private async reconcileWalkListItems(
    list: { id: string; items: Array<{ id: string; contactId: string }> },
    orderedIds: string[],
    turfId: string,
  ): Promise<ReconcileResult> {
    const itemIdByContact = new Map(list.items.map((i) => [i.contactId, i.id]));
    const wanted = new Set(orderedIds);
    const removeIds = list.items.filter((i) => !wanted.has(i.contactId)).map((i) => i.id);
    const addIds = orderedIds.filter((cid) => !itemIdByContact.has(cid));

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const addRows: Array<{ walkListId: string; contactId: string; orderIndex: number }> = [];
    orderedIds.forEach((cid, orderIndex) => {
      const existingItemId = itemIdByContact.get(cid);
      if (existingItemId) ops.push(this.prisma.walkListItem.update({ where: { id: existingItemId }, data: { orderIndex } }));
      else addRows.push({ walkListId: list.id, contactId: cid, orderIndex });
    });
    // Bulk-insert new doors with skipDuplicates so a concurrent add of the same contact no-ops on the
    // @@unique([walkListId, contactId]) rather than throwing (which would 500 the rebuild endpoint).
    if (addRows.length) ops.push(this.prisma.walkListItem.createMany({ data: addRows, skipDuplicates: true }));
    if (removeIds.length) ops.push(this.prisma.walkListItem.deleteMany({ where: { id: { in: removeIds } } }));
    await this.prisma.$transaction(ops);
    return { turfId, walkListId: list.id, items: orderedIds.length, added: addIds.length, removed: removeIds.length };
  }

  /** Batch wrapper for the walk-lists rebuild tool — rebuilds each turf, isolating per-turf failures so
   *  one bad turf doesn't sink the batch. The caller chunks a large selection for progress feedback. */
  async rebuildWalkLists(
    tenantId: string,
    turfIds: string[],
  ): Promise<{ results: Array<{ turfId: string; walkListId?: string | null; items?: number; error?: string }> }> {
    const results: Array<{ turfId: string; walkListId?: string | null; items?: number; error?: string }> = [];
    for (const id of turfIds) {
      try {
        results.push(await this.rebuildTurfWalkList(tenantId, id));
      } catch (e) {
        results.push({ turfId: id, error: e instanceof Error ? e.message : "Rebuild failed" });
      }
    }
    return { results };
  }

  /**
   * Volunteer tallies for the "My turf" header — doors knocked, conversations
   * (spoke-to dispositions), and surveys completed (distinct residents surveyed at
   * the door), both for today and all-time. "Today" is from server midnight (UTC).
   */
  async getVolunteerMetrics(tenantId: string, volunteerId: string) {
    const since = startOfToday();
    const knock = (today: boolean): Prisma.DoorKnockWhereInput => ({
      tenantId,
      volunteerId,
      ...(today ? { createdAt: { gte: since } } : {}),
    });
    const convo = (today: boolean): Prisma.DoorKnockWhereInput => ({
      ...knock(today),
      dispositionCode: { in: SPOKE_TO_CODES },
    });
    const resp = (today: boolean): Prisma.QuestionResponseWhereInput => ({
      tenantId,
      channel: EngagementChannel.DOOR,
      recordedById: volunteerId,
      ...(today ? { createdAt: { gte: since } } : {}),
    });
    // Surveys = distinct residents with door responses (group by contact), not raw answers.
    const surveyContacts = (today: boolean) =>
      this.prisma.questionResponse.groupBy({ by: ["contactId"], where: resp(today) });

    const [doorsToday, doorsTotal, conversationsToday, conversationsTotal, surveysTodayRows, surveysTotalRows] =
      await Promise.all([
        this.prisma.doorKnock.count({ where: knock(true) }),
        this.prisma.doorKnock.count({ where: knock(false) }),
        this.prisma.doorKnock.count({ where: convo(true) }),
        this.prisma.doorKnock.count({ where: convo(false) }),
        surveyContacts(true),
        surveyContacts(false),
      ]);

    return {
      doorsToday,
      doorsTotal,
      conversationsToday,
      conversationsTotal,
      surveysToday: surveysTodayRows.length,
      surveysTotal: surveysTotalRows.length,
    };
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
    if (!this.images.enabled) {
      throw new ApiHttpException("PHOTO_STORAGE_NOT_CONFIGURED", "Photo storage is not configured");
    }
    const { url } = await this.images.put(file.buffer, {
      key: this.images.randomKey("door-knocks", this.images.extFrom(file.originalname, "jpg")),
      contentType: file.mimetype,
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

    // Resolve the contact's campaign once so BOTH the disposition and survey answers
    // carry it — campaign-scoped journeys match on campaignId (a null here silently
    // skips them).
    let campaignId: string | null = null;
    if (input.dispositionCode || input.surveyAnswers?.length) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: input.contactId, tenantId },
        select: { turf: { select: { campaignId: true } } },
      });
      campaignId = contact?.turf?.campaignId ?? null;
    }

    if (input.dispositionCode) {
      await this.engagement.recordDisposition(tenantId, {
        contactId: input.contactId,
        code: input.dispositionCode,
        channel: EngagementChannel.DOOR,
        campaignId,
        recordedById: input.volunteerId,
        // Consent at the door is verbal and affirmative-only (APP 5) — absent/false
        // records nothing.
        consentMethod: input.consent === true ? "verbal_door" : null,
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
      // mobile powers the click-to-call button on the Volunteers roster (phone-first
      // volunteers sign up with it); null for email/password field logins.
      select: { id: true, displayName: true, email: true, mobile: true },
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
    input: { displayName?: string; role?: AppUserRole; password?: string; mobile?: string },
  ) {
    const membership = await this.prisma.tenantMember.findFirst({ where: { userId: id, tenantId } });
    if (!membership) throw new ApiHttpException("USER_NOT_FOUND", "User not found");
    const userData: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) userData.displayName = input.displayName;
    if (input.password) userData.passwordHash = await hashPassword(input.password);
    // Trim; an empty string clears the number (→ null).
    if (input.mobile !== undefined) userData.mobile = input.mobile.trim() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const u =
          Object.keys(userData).length > 0
            ? await tx.user.update({
                where: { id },
                data: userData,
                select: { id: true, displayName: true, email: true, mobile: true },
              })
            : await tx.user.findUniqueOrThrow({
                where: { id },
                select: { id: true, displayName: true, email: true, mobile: true },
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

  /**
   * Contacts that fall in a turf, route-orderable for a walk list. Left-joins the G-NAF address
   * universe (raw `geo.gnaf_address`, no Prisma relation) by `gnafPid` so each stop carries its
   * real street + suburb + postcode for a complete address and street grouping — the enriched
   * `address_label` overrides the stored `Contact.address` ("96 · 3121"); we fall back to the
   * stored value when there's no gnafPid (non-cold contacts). Coordinates likewise COALESCE the
   * stored `Contact.lat/lng` with the G-NAF row's, so a cold door with a gnafPid but no
   * backfilled coords still gets a map pin. Cross-schema, hence `$queryRaw`.
   */
  async listTurfContacts(tenantId: string, turfId: string) {
    return this.prisma.$queryRaw`
      SELECT c.id,
             c."firstName" AS "firstName",
             c."lastName"  AS "lastName",
             c."gnafPid"   AS "gnafPid",
             COALESCE(a.address_label, c.address) AS address,
             a.street   AS street,
             a.locality AS locality,
             a.postcode AS postcode,
             COALESCE(c.lat, a.lat) AS lat,
             COALESCE(c.lng, a.lng) AS lng
        FROM "public"."Contact" c
        LEFT JOIN geo.gnaf_address a ON a.gnaf_pid = c."gnafPid"
       WHERE c."tenantId" = ${tenantId} AND c."turfId" = ${turfId}
       ORDER BY c."createdAt" ASC
    ` as Promise<
      Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        /** The contact's G-NAF address id (null for non-cold contacts) — lets the walk-list
         *  preview's door popover fetch the address detail (regions, nearest polling). */
        gnafPid: string | null;
        address: string | null;
        street: string | null;
        locality: string | null;
        postcode: string | null;
        lat: number | null;
        lng: number | null;
      }>
    >;
  }

  /**
   * The optimised walk order for a turf + the walking leg between each consecutive located stop.
   * Orders with the same nearest-neighbour + 2-opt used to price a turf, then asks Mapbox for the
   * real per-leg walking distance/time (batched in 25-coord windows, server token). Falls back to
   * straight-line legs (haversine ÷ 1.25 m/s) when Mapbox is unconfigured, flagged in `source` so
   * the UI can say so. Unlocated contacts (no coords) sort to the end and get no leg.
   */
  async turfRoute(tenantId: string, turfId: string, origin?: { lat: number; lng: number }) {
    const contacts = (await this.listTurfContacts(tenantId, turfId)) as Array<{
      id: string;
      lat: number | null;
      lng: number | null;
    }>;
    const stops: Stop[] = contacts.map((c) => ({
      id: c.id,
      lat: typeof c.lat === "number" ? c.lat : Number.NaN,
      lng: typeof c.lng === "number" ? c.lng : Number.NaN,
    }));
    // When the volunteer sends their GPS, order from where they're standing (route-math starts at
    // the door nearest the origin) and price the from-here first leg below.
    const start = origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? origin : undefined;
    const ordered = optimiseRoute(stops, start);
    const orderedIds = ordered.map((s) => s.id);
    const located = ordered.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

    type Leg = { fromId: string; toId: string; distanceM: number; durationS: number };
    let legs: Leg[] = [];
    let source: "directions" | "crowflies" = "crowflies";
    // The street-following walk line through the located stops (Mapbox walking geometry). Null
    // when Mapbox is unconfigured/failed → the map falls back to a straight beeline.
    let geometry: GeoJSON.LineString | null = null;
    let totalM = 0;
    let totalS = 0;

    // Prepend the origin (when given) so the Mapbox geometry + totals include the walk from where
    // the volunteer is standing to the first door; the per-stop `legs` stay stop-to-stop.
    const waypoints = [
      ...(start ? [{ lat: start.lat, lng: start.lng }] : []),
      ...located.map((s) => ({ lat: s.lat, lng: s.lng })),
    ];
    const priced =
      waypoints.length >= 2 ? await this.directions.routeLegsAndGeometry(waypoints) : null;
    if (priced && priced.legs.length === waypoints.length - 1) {
      source = "directions";
      geometry = priced.geometry;
      // With an origin prepended, priced.legs[0] is origin→firstStop; the rest are stop-to-stop.
      const stopLegs = start ? priced.legs.slice(1) : priced.legs;
      legs = stopLegs.map((leg, i) => ({
        fromId: located[i].id,
        toId: located[i + 1].id,
        distanceM: leg.distance,
        durationS: leg.duration,
      }));
      // Totals cover the whole walk, INCLUDING the from-here first leg.
      totalM = priced.legs.reduce((sum, l) => sum + l.distance, 0);
      totalS = priced.legs.reduce((sum, l) => sum + l.duration, 0);
    } else {
      // Straight-line fallback at the model's walking pace (1.25 m/s), so the list still shows a leg.
      for (let i = 1; i < located.length; i += 1) {
        const distanceM = haversineM(located[i - 1], located[i]);
        legs.push({ fromId: located[i - 1].id, toId: located[i].id, distanceM, durationS: distanceM / 1.25 });
      }
      totalM = legs.reduce((sum, l) => sum + l.distanceM, 0);
      totalS = legs.reduce((sum, l) => sum + l.durationS, 0);
      // Fold the from-here first segment into the totals when an origin was given.
      if (start && located.length > 0) {
        const d = haversineM(start, located[0]);
        totalM += d;
        totalS += d / 1.25;
      }
    }

    return { ordered: orderedIds, legs, totalM, totalS, source, geometry };
  }

  /**
   * Walk route for a field volunteer, ordered from their current GPS (`origin`). Gated the same
   * way as the door-knock path: the turf must be ASSIGNED to this volunteer, else TURF_NOT_ASSIGNED.
   */
  async walkRouteForVolunteer(
    tenantId: string,
    turfId: string,
    volunteerId: string,
    origin?: { lat: number; lng: number },
  ) {
    const lock = await this.prisma.turfAssignment.findFirst({
      where: { turfId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId } },
    });
    if (!lock || lock.volunteerId !== volunteerId) {
      throw new ApiHttpException("TURF_NOT_ASSIGNED", "This turf is not assigned to you");
    }
    return this.turfRoute(tenantId, turfId, origin);
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
        // The cached doors/hour estimate. Null until the turf has been priced; `source`
        // says whether the walk came from Mapbox footpaths or from straight lines.
        estimate: true,
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
        estimate: t.estimate
          ? {
              doors: t.estimate.doors,
              buildings: t.estimate.buildings,
              doorsPerBuilding: t.estimate.doorsPerBuilding,
              doorsPerHour: t.estimate.doorsPerHour,
              doorsPerShift: t.estimate.doorsPerShift,
              shifts: t.estimate.shifts,
              // "crowflies" is an optimistic lower bound on the walk. The UI must say so.
              source: t.estimate.source,
              computedAt: t.estimate.computedAt,
            }
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
      type: DivisionType;
      code: string;
      name?: string;
      campaignId?: string | null;
      universe?: TurfUniverse;
    },
  ) {
    const table = DIVISION_TABLES[input.type];
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT name, ST_AsGeoJSON(geom) AS geojson FROM ${table} WHERE code = $1`,
      input.code,
    )) as Array<{ name: string; geojson: string | null }>;
    if (rows.length === 0 || !rows[0].geojson) {
      throw new ApiHttpException("DIVISION_NOT_FOUND", "Division boundary not found");
    }
    const clipped = await this.clipToCampaign(tenantId, input.campaignId, JSON.parse(rows[0].geojson));
    if (!clipped) {
      throw new ApiHttpException(
        "OUTSIDE_BOUNDARY",
        "The division is outside the campaign boundary or overlaps already-claimed turf",
      );
    }
    const turf = await this.createTurf(tenantId, {
      name: input.name || rows[0].name,
      geometry: clipped,
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
      areas: Array<{ layer: "mb" | "sa1" | "sa2" | "sa3" | "sa4"; code: string }>;
      polygons?: Record<string, unknown>[];
      universe?: TurfUniverse;
    },
  ) {
    const raw = await this.geo.unionAreas(input.areas ?? [], input.polygons ?? []);
    if (!raw) {
      throw new ApiHttpException("EMPTY_SELECTION", "Select at least one area or draw a polygon");
    }
    // Bound to the campaign: clip to the boundary + subtract already-claimed turf.
    const geometry = await this.clipToCampaign(tenantId, input.campaignId, raw);
    if (!geometry) {
      throw new ApiHttpException(
        "OUTSIDE_BOUNDARY",
        "The selection is outside the campaign boundary or overlaps already-claimed turf",
      );
    }
    const turf = await this.createTurf(tenantId, {
      name: input.name,
      geometry,
      campaignId: input.campaignId ?? null,
    });
    if (input.universe && input.universe !== "existing") {
      await this.loadUniverseIntoTurf(tenantId, turf.id, { universe: input.universe });
    }
    return turf;
  }

  /**
   * Cut ONE turf from a stacked "my turf" basket — any mix of whole divisions,
   * ASGS areas, drawn polygons and individually-picked G-NAF doors. The boundary
   * is the PostGIS union of every part (doors buffered ~55 m); clip + cold-door
   * loading match the areas/division paths.
   */
  async createTurfFromSources(
    tenantId: string,
    input: {
      name: string;
      campaignId?: string | null;
      divisions?: Array<{ type: TurfDivisionType; code: string }>;
      areas?: Array<{ layer: "mb" | "sa1" | "sa2" | "sa3" | "sa4"; code: string }>;
      polygons?: Record<string, unknown>[];
      gnafPids?: string[];
      universe?: TurfUniverse;
    },
  ) {
    const sources: BoundarySource[] = [
      ...(input.divisions ?? []).map((d) => ({ kind: "division" as const, type: d.type, code: d.code })),
      ...(input.areas ?? []).map((a) => ({ kind: "area" as const, layer: a.layer, code: a.code })),
      ...(input.polygons ?? []).map((geometry) => ({ kind: "polygon" as const, geometry })),
    ];
    const gnafPids = (input.gnafPids ?? []).filter(Boolean);
    if (sources.length === 0 && gnafPids.length === 0) {
      throw new ApiHttpException("EMPTY_SELECTION", "Add at least one division, area, polygon or address");
    }
    const raw = await this.geo.unionSources(sources, gnafPids);
    if (!raw) {
      throw new ApiHttpException("EMPTY_SELECTION", "Nothing resolved from the selection");
    }
    const geometry = await this.clipToCampaign(tenantId, input.campaignId, raw);
    if (!geometry) {
      throw new ApiHttpException(
        "OUTSIDE_BOUNDARY",
        "The selection is outside the campaign boundary or overlaps already-claimed turf",
      );
    }
    const turf = await this.createTurf(tenantId, {
      name: input.name,
      geometry,
      campaignId: input.campaignId ?? null,
    });
    if (input.universe && input.universe !== "existing") {
      await this.loadUniverseIntoTurf(tenantId, turf.id, { universe: input.universe });
    }
    return turf;
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
    // The doors just changed, so last cut's price is stale even though the polygon is not.
    await this.queueTurfEstimate(tenantId, turfId);
    // The turf now has its addresses — (re)build the default walk list so it's canvassable
    // immediately. RECONCILES the wl_turf list (not create-once), so when a turf is populated in two
    // steps (cold doors here + existing contacts via rebucket) the second step's doors are ADDED, not
    // dropped. Best-effort: never fail the cut on a walk-list hiccup.
    await this.rebuildTurfWalkList(tenantId, turfId).catch((e) =>
      this.logger.warn(`Auto walk-list build failed for turf ${turfId}: ${e instanceof Error ? e.message : e}`),
    );
    return { materialised, total };
  }

  async createTurf(tenantId: string, input: { name: string; geometry: unknown; campaignId?: string | null }) {
    // Evaluation guard: a turf substantially inside a holdout SA1 would break the
    // campaign's experiment — refuse before anything is written.
    await this.evaluation?.assertTurfOutsideHoldout(input.campaignId, input.geometry);
    const turf = await this.prisma.turf.create({
      data: {
        tenantId,
        name: input.name,
        geometry: input.geometry as Prisma.InputJsonValue,
        campaignId: input.campaignId ?? null,
      },
    });
    await this.syncTurfGeom(turf.id, input.geometry);
    await this.queueTurfEstimate(tenantId, turf.id);
    return turf;
  }

  /**
   * Keep the PostGIS `geom` mirror in sync with the GeoJSON `geometry` (source of truth)
   * so server-side spatial ops (boundary clip, non-overlap subtract) can use the GIST
   * index. `geom` is a derived column — never fail a turf write on a bad mirror.
   */
  async syncTurfGeom(id: string, geometry: unknown): Promise<void> {
    if (!geometry) return;
    try {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "canvass"."Turf"
           SET "geom" = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3))
         WHERE "id" = $2`,
        JSON.stringify(geometry),
        id,
      );
    } catch {
      /* geom is derived; ignore a bad mirror */
    }
  }

  /**
   * Bound a proposed turf geometry to a campaign: clip to the campaign boundary (if one is
   * set) and subtract the union of already-CLAIMED (assigned) turf in the campaign, so cuts
   * stay in-bounds and never overlap claimed turf. Returns the resulting GeoJSON, or null if
   * nothing is left (fully outside / fully overlapping). No campaign ⇒ unchanged.
   */
  async clipToCampaign(
    tenantId: string,
    campaignId: string | null | undefined,
    geometry: unknown,
    subtractAssigned = true,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<unknown | null> {
    if (!campaignId) return geometry;
    const rows = (await db.$queryRawUnsafe(
      `WITH cut AS (
         SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g
       ),
       camp AS (
         SELECT CASE WHEN "boundary" IS NULL THEN NULL
                ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON("boundary"::text), 4326)) END AS g
         FROM "canvass"."CanvassCampaign" WHERE "id" = $2 AND "tenantId" = $3
       ),
       assigned AS (
         SELECT ST_Union(t."geom") AS g
         FROM "canvass"."Turf" t
         JOIN "canvass"."TurfAssignment" a ON a."turfId" = t."id" AND a."status" = 'ASSIGNED'
         WHERE t."campaignId" = $2 AND t."geom" IS NOT NULL
       ),
       clipped AS (
         SELECT CASE WHEN (SELECT g FROM camp) IS NULL THEN (SELECT g FROM cut)
                ELSE ST_Intersection((SELECT g FROM cut), (SELECT g FROM camp)) END AS g
       ),
       final AS (
         SELECT CASE WHEN $4::boolean AND (SELECT g FROM assigned) IS NOT NULL
                THEN ST_Difference((SELECT g FROM clipped), (SELECT g FROM assigned))
                ELSE (SELECT g FROM clipped) END AS g
       )
       SELECT ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(g, 3))) AS geojson, ST_IsEmpty(g) AS empty FROM final`,
      JSON.stringify(geometry),
      campaignId,
      tenantId,
      subtractAssigned,
    )) as Array<{ geojson: string | null; empty: boolean }>;
    const r = rows[0];
    if (!r || r.empty || !r.geojson) return null;
    return JSON.parse(r.geojson);
  }

  // ── Volunteer self-serve turf (gated by CanvassCampaign.volunteerCanSelfClaimTurf) ──

  private async assertSelfClaim(tenantId: string, campaignId: string, mode?: string) {
    const c = await this.prisma.canvassCampaign.findFirst({
      where: { id: campaignId, tenantId },
      select: {
        id: true,
        boundary: true,
        volunteerCanSelfClaimTurf: true,
        selfClaimModes: true,
        turfClaimRequiresApproval: true,
      },
    });
    if (!c) throw new ApiHttpException("CAMPAIGN_NOT_FOUND", "Campaign not found");
    if (!c.volunteerCanSelfClaimTurf) {
      throw new ApiHttpException("SELF_CLAIM_DISABLED", "Volunteer self-serve turf is off for this campaign");
    }
    const modes = Array.isArray(c.selfClaimModes) ? (c.selfClaimModes as string[]) : null;
    if (mode && modes && modes.length > 0 && !modes.includes(mode)) {
      throw new ApiHttpException("SELF_CLAIM_DISABLED", `Self-serve "${mode}" is off for this campaign`);
    }
    return c;
  }

  /** What a volunteer can self-claim in a campaign: the boundary (for the map), the allowed
   *  modes, and the ready-made unassigned turfs (mode C). The boundary GeoJSON stays (the
   *  get-turf map draws it), but each ready turf ships only a bbox + door count — its card
   *  is a small SVG thumbnail, and 100 full boundary geometries dwarfed the payload. */
  async selfServeAvailable(tenantId: string, campaignId: string) {
    const c = await this.assertSelfClaim(tenantId, campaignId);
    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, campaignId, assignments: { none: { status: TurfAssignmentStatus.ASSIGNED } } },
      select: { id: true, name: true, geometry: true, _count: { select: { contacts: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const modes =
      Array.isArray(c.selfClaimModes) && (c.selfClaimModes as string[]).length
        ? (c.selfClaimModes as string[])
        : ["area", "draw", "existing"];
    return {
      boundary: c.boundary,
      modes,
      readyTurfs: turfs.map((t) => ({
        id: t.id,
        name: t.name,
        bbox: geometryBbox(t.geometry),
        contactCount: t._count.contacts,
      })),
    };
  }

  /** Recommended ready-made turf for a volunteer across the tenant's self-serve campaigns —
   *  the field homepage surfaces these when the volunteer has no assignment yet. Unassigned
   *  turfs only, each carrying its own campaign (the empty state has no campaign context),
   *  ranked by the volunteer's advisory canvass prefs (walk wants + session length).
   *  Ranking needs only the door count, so the candidate query never loads geometry — a
   *  [w,s,e,n] bbox (for the card thumbnail) is resolved by a second narrow query over just
   *  the returned rows, never 100 boundary geometries on the boot path. */
  async recommendedTurf(tenantId: string, volunteerId: string, limit = 6) {
    const [member, campaigns] = await Promise.all([
      this.prisma.tenantMember.findFirst({
        where: { tenantId, userId: volunteerId },
        select: { canvassPrefs: true },
      }),
      this.prisma.canvassCampaign.findMany({
        where: { tenantId, volunteerCanSelfClaimTurf: true },
        select: { id: true, name: true, selfClaimModes: true },
      }),
    ]);
    // Mode C (claim a ready-made turf) must be allowed — an empty selfClaimModes means all modes.
    const eligible = campaigns.filter((c) => {
      const modes = Array.isArray(c.selfClaimModes) ? (c.selfClaimModes as string[]) : null;
      return !modes || modes.length === 0 || modes.includes("existing");
    });
    if (eligible.length === 0) return [];
    const nameById = new Map(eligible.map((c) => [c.id, c.name]));
    const turfs = await this.prisma.turf.findMany({
      where: {
        tenantId,
        campaignId: { in: eligible.map((c) => c.id) },
        assignments: { none: { status: TurfAssignmentStatus.ASSIGNED } },
      },
      select: {
        id: true,
        name: true,
        campaignId: true,
        _count: { select: { contacts: true } },
      },
      take: 100,
    });
    const mapped = turfs
      .filter((t): t is typeof t & { campaignId: string } => !!t.campaignId && nameById.has(t.campaignId))
      .map((t) => ({
        id: t.id,
        name: t.name,
        contactCount: t._count.contacts,
        campaignId: t.campaignId,
        campaignName: nameById.get(t.campaignId) ?? "",
      }));
    const prefs = (member?.canvassPrefs ?? null) as CanvassPrefs | null;
    const ranked = rankTurfsByPrefs(mapped, prefs).slice(0, limit);
    if (ranked.length === 0) return [];
    const geoms = await this.prisma.turf.findMany({
      where: { id: { in: ranked.map((t) => t.id) } },
      select: { id: true, geometry: true },
    });
    const bboxById = new Map(geoms.map((g) => [g.id, geometryBbox(g.geometry)]));
    return ranked.map((t) => ({ ...t, bbox: bboxById.get(t.id) ?? null }));
  }

  /** Mode A: claim unclaimed ASGS areas within the campaign boundary. */
  async claimAreaSelfServe(
    tenantId: string,
    campaignId: string,
    volunteerId: string,
    areas: Array<{ layer: "mb" | "sa1" | "sa2" | "sa3" | "sa4"; code: string }>,
  ) {
    const c = await this.assertSelfClaim(tenantId, campaignId, "area");
    const raw = await this.geo.unionAreas(areas ?? [], []);
    if (!raw) throw new ApiHttpException("EMPTY_SELECTION", "Pick at least one area");
    return this.claimTurfInCampaign(tenantId, campaignId, volunteerId, raw, c.turfClaimRequiresApproval);
  }

  /** Mode B: claim a self-drawn polygon within the campaign boundary. */
  async claimDrawSelfServe(tenantId: string, campaignId: string, volunteerId: string, polygon: unknown) {
    const c = await this.assertSelfClaim(tenantId, campaignId, "draw");
    const raw = await this.geo.unionSources([{ kind: "polygon", geometry: polygon }]);
    if (!raw) throw new ApiHttpException("INVALID_POLYGON", "Draw a valid area");
    return this.claimTurfInCampaign(tenantId, campaignId, volunteerId, raw, c.turfClaimRequiresApproval);
  }

  /** Mode C: claim a ready-made unassigned organiser turf. */
  async claimExistingTurfSelfServe(tenantId: string, campaignId: string, volunteerId: string, turfId: string) {
    const c = await this.assertSelfClaim(tenantId, campaignId, "existing");
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId, campaignId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found in this campaign");
    if (c.turfClaimRequiresApproval) return this.requestTurf(turfId, volunteerId);
    return this.assignTurf(tenantId, turfId, volunteerId);
  }

  /**
   * Create + claim a turf inside a campaign atomically: a per-campaign advisory lock
   * serialises concurrent claims (so two volunteers can't carve overlapping turf); inside
   * it we clip to the boundary + subtract already-claimed turf, create, and assign. Cold
   * doors are loaded after the (short) lock txn.
   */
  private async claimTurfInCampaign(
    tenantId: string,
    campaignId: string,
    volunteerId: string,
    rawGeometry: unknown,
    requiresApproval = false,
  ) {
    // Approval-required campaigns land the claim as a pending REQUESTED assignment (an
    // organiser approves it later); otherwise it takes the instant ASSIGNED lock.
    const status = requiresApproval ? TurfAssignmentStatus.REQUESTED : TurfAssignmentStatus.ASSIGNED;
    const turf = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, campaignId);
      const clipped = await this.clipToCampaign(tenantId, campaignId, rawGeometry, true, tx);
      if (!clipped) {
        throw new ApiHttpException(
          "AREA_ALREADY_CLAIMED",
          "That area is outside the campaign boundary or already claimed",
        );
      }
      const name = `My turf · ${new Date().toLocaleDateString("en-AU")}`;
      const created = await tx.turf.create({
        data: { tenantId, name, geometry: clipped as Prisma.InputJsonValue, campaignId },
      });
      await tx.$executeRawUnsafe(
        `UPDATE "canvass"."Turf"
           SET "geom" = ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 3))
         WHERE "id" = $2`,
        JSON.stringify(clipped),
        created.id,
      );
      await tx.turfAssignment.create({
        data: { turfId: created.id, volunteerId, status },
      });
      return created;
    });
    // Cold doors are expensive to load; defer for a pending request until it's approved.
    if (status === TurfAssignmentStatus.ASSIGNED) {
      await this.loadUniverseIntoTurf(tenantId, turf.id, { universe: "hybrid" }).catch(() => undefined);
    }
    return turf;
  }

  // ── Turf requests + approval (volunteer requests, organiser approves) ────────

  /** A pending self-claim on an approval-required campaign. REQUESTED does NOT take the
   *  ASSIGNED lock, so several volunteers can queue on one turf; approving one promotes it
   *  and denies the rest. Idempotent — reuses an existing pending/active row for this pair. */
  private async requestTurf(turfId: string, volunteerId: string) {
    const existing = await this.prisma.turfAssignment.findFirst({
      where: {
        turfId,
        volunteerId,
        status: { in: [TurfAssignmentStatus.REQUESTED, TurfAssignmentStatus.ASSIGNED] },
      },
    });
    if (existing) return existing;
    return this.prisma.turfAssignment.create({
      data: { turfId, volunteerId, status: TurfAssignmentStatus.REQUESTED },
    });
  }

  /** Organiser approves a pending request → the volunteer holds the turf. Promotes
   *  REQUESTED→ASSIGNED (FSM-guarded, row locked FOR UPDATE), denies the losing requests
   *  on the same turf, then loads its cold doors. The DB partial-unique index makes a
   *  double-approval a clean 409 rather than two owners. */
  async approveTurfRequest(tenantId: string, assignmentId: string) {
    const req = await this.prisma.turfAssignment.findFirst({
      where: { id: assignmentId, turf: { tenantId } },
      select: { id: true, status: true, turfId: true },
    });
    if (!req) throw new ApiHttpException("ASSIGNMENT_NOT_FOUND", "Turf request not found", HttpStatus.NOT_FOUND);
    assertTurfAssignmentTransition(req.status, TurfAssignmentStatus.ASSIGNED);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT id FROM "canvass"."TurfAssignment" WHERE id = $1 FOR UPDATE`,
          assignmentId,
        );
        await tx.turfAssignment.update({
          where: { id: assignmentId },
          data: { status: TurfAssignmentStatus.ASSIGNED },
        });
        await tx.turfAssignment.updateMany({
          where: {
            turfId: req.turfId,
            status: TurfAssignmentStatus.REQUESTED,
            id: { not: assignmentId },
          },
          data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApiHttpException("TURF_LOCKED", "This turf is already assigned to another volunteer");
      }
      throw error;
    }
    await this.loadUniverseIntoTurf(tenantId, req.turfId, { universe: "hybrid" }).catch(() => undefined);
    return { id: assignmentId, status: TurfAssignmentStatus.ASSIGNED };
  }

  /** Organiser denies a pending request (or releases an assignment). FSM-guarded. */
  async denyTurfRequest(tenantId: string, assignmentId: string) {
    const req = await this.prisma.turfAssignment.findFirst({
      where: { id: assignmentId, turf: { tenantId } },
      select: { id: true, status: true },
    });
    if (!req) throw new ApiHttpException("ASSIGNMENT_NOT_FOUND", "Turf request not found", HttpStatus.NOT_FOUND);
    assertTurfAssignmentTransition(req.status, TurfAssignmentStatus.RELEASED);
    await this.prisma.turfAssignment.update({
      where: { id: assignmentId },
      data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
    });
    return { id: assignmentId, status: TurfAssignmentStatus.RELEASED };
  }

  /** Pending self-claims awaiting approval in a campaign — the organiser's request queue. */
  async listTurfRequests(tenantId: string, campaignId: string) {
    const rows = await this.prisma.turfAssignment.findMany({
      where: { status: TurfAssignmentStatus.REQUESTED, turf: { tenantId, campaignId } },
      include: {
        turf: { select: { id: true, name: true, _count: { select: { contacts: true } } } },
        volunteer: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: { assignedAt: "asc" },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      requestedAt: r.assignedAt,
      turf: { id: r.turf.id, name: r.turf.name, contactCount: r.turf._count.contacts },
      volunteer: { id: r.volunteer.id, name: r.volunteer.displayName, email: r.volunteer.email },
    }));
  }

  /** The campaign roster: every volunteer with their held turfs, pending-request count, and
   *  door/conversation tallies — the Volunteers-page overview (one query set, no N+1). */
  async getVolunteerRoster(tenantId: string, campaignId: string) {
    const [volunteers, assignments, doorAgg, convoAgg] = await Promise.all([
      this.listVolunteers(tenantId),
      this.prisma.turfAssignment.findMany({
        where: {
          status: { in: [TurfAssignmentStatus.ASSIGNED, TurfAssignmentStatus.REQUESTED] },
          turf: { tenantId, campaignId },
        },
        include: { turf: { select: { id: true, name: true, _count: { select: { contacts: true } } } } },
      }),
      this.prisma.doorKnock.groupBy({ by: ["volunteerId"], where: { tenantId }, _count: { _all: true } }),
      this.prisma.doorKnock.groupBy({
        by: ["volunteerId"],
        where: { tenantId, dispositionCode: { in: SPOKE_TO_CODES } },
        _count: { _all: true },
      }),
    ]);

    type Held = { id: string; name: string; contactCount: number };
    const held = new Map<string, { turfs: Held[]; requested: number; contacts: number }>();
    for (const a of assignments) {
      const v = held.get(a.volunteerId) ?? { turfs: [], requested: 0, contacts: 0 };
      if (a.status === TurfAssignmentStatus.ASSIGNED) {
        v.turfs.push({ id: a.turf.id, name: a.turf.name, contactCount: a.turf._count.contacts });
        v.contacts += a.turf._count.contacts;
      } else {
        v.requested += 1;
      }
      held.set(a.volunteerId, v);
    }
    const doors = new Map(
      doorAgg.filter((d) => d.volunteerId).map((d) => [d.volunteerId as string, d._count._all]),
    );
    const convos = new Map(
      convoAgg.filter((d) => d.volunteerId).map((d) => [d.volunteerId as string, d._count._all]),
    );

    return volunteers.map((vol) => {
      const v = held.get(vol.id);
      return {
        id: vol.id,
        name: vol.displayName,
        email: vol.email,
        role: vol.role,
        turfs: v?.turfs ?? [],
        turfCount: v?.turfs.length ?? 0,
        requestedCount: v?.requested ?? 0,
        contactCount: v?.contacts ?? 0,
        doorsKnocked: doors.get(vol.id) ?? 0,
        conversations: convos.get(vol.id) ?? 0,
      };
    });
  }

  /** Every contact across the turfs a volunteer currently holds in a campaign — the
   *  "view all their contacts" drill-through. Reuses listTurfContacts per held turf. */
  async listVolunteerContacts(tenantId: string, campaignId: string, volunteerId: string) {
    const held = await this.prisma.turfAssignment.findMany({
      where: { volunteerId, status: TurfAssignmentStatus.ASSIGNED, turf: { tenantId, campaignId } },
      select: { turfId: true },
    });
    const perTurf = await Promise.all(held.map((h) => this.listTurfContacts(tenantId, h.turfId)));
    return perTurf.flat();
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
        heatRunId: input.campaignId ? await this.heat?.currentRunId(input.campaignId) : null,
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

  /** Delete a walk list. Its WalkListItems cascade (schema onDelete: Cascade); contacts,
   *  the turf and door-knock history are untouched (delete-list ≠ unassign-turf). */
  async deleteWalkList(tenantId: string, id: string) {
    const res = await this.prisma.walkList.deleteMany({ where: { id, tenantId } });
    if (res.count === 0) throw new ApiHttpException("WALK_LIST_NOT_FOUND", "Walk list not found");
    return { deleted: true };
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

  /** Delete a turf: release its contacts (turfId → null) and drop assignments, then delete.
   *  Walk lists SetNull their turfId via the schema relation. */
  async deleteTurf(tenantId: string, turfId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({ where: { tenantId, turfId }, data: { turfId: null } });
      await tx.turfAssignment.deleteMany({ where: { turfId } });
      await tx.turf.delete({ where: { id: turfId } });
      return { deleted: true };
    });
  }

  /** Organiser-side unassign: release the active lock on a turf (no volunteerId needed). */
  async unassignTurf(tenantId: string, turfId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    const res = await this.prisma.turfAssignment.updateMany({
      where: { turfId, status: TurfAssignmentStatus.ASSIGNED },
      data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
    });
    return { released: res.count };
  }

  /** Move a turf's assignment to another volunteer: release the current lock, then assign.
   *  Releasing first keeps the one-active-per-turf partial unique index satisfied. */
  async reassignTurf(tenantId: string, turfId: string, volunteerId: string) {
    const turf = await this.prisma.turf.findFirst({ where: { id: turfId, tenantId } });
    if (!turf) throw new ApiHttpException("TURF_NOT_FOUND", "Turf not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.turfAssignment.updateMany({
        where: { turfId, status: TurfAssignmentStatus.ASSIGNED },
        data: { status: TurfAssignmentStatus.RELEASED, releasedAt: new Date() },
      });
      return tx.turfAssignment.create({
        data: { turfId, volunteerId, status: TurfAssignmentStatus.ASSIGNED },
      });
    });
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
    // Existing contacts are now bucketed — reconcile the default walk list (add the newly-bucketed
    // doors, drop any released) so it stays complete after this second population step. Best-effort.
    await this.rebuildTurfWalkList(tenantId, turfId).catch((e) =>
      this.logger.warn(`Auto walk-list build failed for turf ${turfId}: ${e instanceof Error ? e.message : e}`),
    );
    return { added: toAdd.length, removed: toRemove.length, total };
  }

  // ── Shifts (generalised: canvass / polling booth / event / general) ──────────
  /** A shift row plus its derived seat counts, with the raw assignment rows stripped. */
  private withSeatCounts<
    T extends { capacity: number | null; assignments: { status: ShiftAssignmentStatus }[] },
  >(s: T) {
    const assignedCount = s.assignments.filter((a) => a.status === ShiftAssignmentStatus.ASSIGNED).length;
    const requestedCount = s.assignments.filter((a) => a.status === ShiftAssignmentStatus.REQUESTED).length;
    const { assignments: _assignments, ...rest } = s;
    return {
      ...rest,
      assignedCount,
      requestedCount,
      isFull: s.capacity != null && assignedCount >= s.capacity,
    };
  }

  async listShifts(tenantId: string, campaignId?: string) {
    const shifts = await this.prisma.shift.findMany({
      where: { tenantId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { startsAt: "asc" },
      include: { assignments: { select: { status: true } } },
    });
    return shifts.map((s) => this.withSeatCounts(s));
  }

  async createShift(
    tenantId: string,
    input: {
      campaignId?: string | null;
      type?: ShiftType;
      name: string;
      startsAt: string;
      endsAt: string;
      location?: string;
      eventId?: string;
      pollingPlaceId?: string;
      capacity?: number;
      notes?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.create({
        data: {
          tenantId,
          campaignId: input.campaignId ?? null,
          type: (input.type as ShiftType | undefined) ?? ShiftType.CANVASS,
          name: input.name,
          location: input.location ?? null,
          eventId: input.eventId ?? null,
          pollingPlaceId: input.pollingPlaceId ?? null,
          capacity: input.capacity ?? null,
          notes: input.notes ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "canvass.shift.scheduled",
        aggregateId: shift.id,
        payload: {
          shiftId: shift.id,
          tenantId,
          campaignId: shift.campaignId,
          type: shift.type,
          startsAt: shift.startsAt.toISOString(),
        },
      });
      return shift;
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
    input: {
      type?: ShiftType;
      name?: string;
      location?: string | null;
      startsAt?: string;
      endsAt?: string;
      eventId?: string | null;
      pollingPlaceId?: string | null;
      capacity?: number | null;
      notes?: string | null;
    },
  ) {
    const existing = await this.prisma.shift.findFirst({ where: { id, tenantId } });
    if (!existing) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found");
    const data: Prisma.ShiftUpdateInput = {};
    if (input.type !== undefined) data.type = input.type as ShiftType;
    if (input.name !== undefined) data.name = input.name;
    if (input.location !== undefined) data.location = input.location;
    if (input.eventId !== undefined) data.eventId = input.eventId;
    if (input.pollingPlaceId !== undefined) data.pollingPlaceId = input.pollingPlaceId;
    if (input.capacity !== undefined) data.capacity = input.capacity;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
    return this.prisma.shift.update({ where: { id }, data });
  }

  // ── Shift roster: organiser assign + volunteer self-signup (mirrors turf) ────

  /** Throws SHIFT_FULL if a bounded shift has no seat left (a volunteer already
   *  holding a seat can always be re-confirmed). Run inside the per-shift advisory lock. */
  private async assertShiftCapacity(
    tx: Prisma.TransactionClient,
    shiftId: string,
    capacity: number | null,
    volunteerId: string,
  ) {
    if (capacity == null) return;
    const [assigned, mine] = await Promise.all([
      tx.shiftAssignment.count({ where: { shiftId, status: ShiftAssignmentStatus.ASSIGNED } }),
      tx.shiftAssignment.findFirst({
        where: { shiftId, volunteerId, status: ShiftAssignmentStatus.ASSIGNED },
        select: { id: true },
      }),
    ]);
    if (!mine && assigned >= capacity) throw new ApiHttpException("SHIFT_FULL", "This shift is full");
  }

  /** Create the seat, or promote an existing REQUESTED one to ASSIGNED. Idempotent for a
   *  volunteer who already holds the target status. Run inside the per-shift advisory lock. */
  private async takeSeat(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shiftId: string,
    volunteerId: string,
    status: ShiftAssignmentStatus,
  ) {
    const existing = await tx.shiftAssignment.findFirst({
      where: {
        shiftId,
        volunteerId,
        status: { in: [ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED] },
      },
    });
    if (existing) {
      // Already holding the target (or a stronger) seat — no downgrade ASSIGNED→REQUESTED.
      if (existing.status === status || existing.status === ShiftAssignmentStatus.ASSIGNED) return existing;
      return tx.shiftAssignment.update({ where: { id: existing.id }, data: { status } });
    }
    return tx.shiftAssignment.create({ data: { tenantId, shiftId, volunteerId, status } });
  }

  private isSeatConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  /** Organiser assigns a volunteer to a shift (instant ASSIGNED). */
  async assignShift(tenantId: string, shiftId: string, volunteerId: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, tenantId },
      select: { id: true, capacity: true },
    });
    if (!shift) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found", HttpStatus.NOT_FOUND);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, shiftId);
        await this.assertShiftCapacity(tx, shiftId, shift.capacity, volunteerId);
        const row = await this.takeSeat(tx, tenantId, shiftId, volunteerId, ShiftAssignmentStatus.ASSIGNED);
        await this.outbox.append(tx, {
          tenantId,
          eventType: "canvass.shift.assigned",
          aggregateId: shiftId,
          payload: { shiftId, tenantId, volunteerId, status: ShiftAssignmentStatus.ASSIGNED },
        });
        return row;
      });
    } catch (error) {
      if (this.isSeatConflict(error)) {
        throw new ApiHttpException("SHIFT_SEAT_CONFLICT", "That volunteer already has a seat on this shift");
      }
      throw error;
    }
  }

  /** Volunteer self-signup, gated by the campaign self-serve switch (reuses turf gating).
   *  Lands REQUESTED on approval-required campaigns, else instant ASSIGNED (capacity-bounded). */
  async signUpShift(tenantId: string, campaignId: string, shiftId: string, volunteerId: string) {
    const campaign = await this.assertSelfClaim(tenantId, campaignId);
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, tenantId, campaignId },
      select: { id: true, capacity: true },
    });
    if (!shift) throw new ApiHttpException("SHIFT_NOT_FOUND", "Shift not found in this campaign", HttpStatus.NOT_FOUND);
    const status = campaign.turfClaimRequiresApproval
      ? ShiftAssignmentStatus.REQUESTED
      : ShiftAssignmentStatus.ASSIGNED;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, shiftId);
        if (status === ShiftAssignmentStatus.ASSIGNED) {
          await this.assertShiftCapacity(tx, shiftId, shift.capacity, volunteerId);
        }
        const row = await this.takeSeat(tx, tenantId, shiftId, volunteerId, status);
        await this.outbox.append(tx, {
          tenantId,
          eventType: "canvass.shift.assigned",
          aggregateId: shiftId,
          payload: { shiftId, tenantId, volunteerId, status },
        });
        return row;
      });
    } catch (error) {
      if (this.isSeatConflict(error)) {
        throw new ApiHttpException("SHIFT_SEAT_CONFLICT", "You already have a seat on this shift");
      }
      throw error;
    }
  }

  /** Organiser approves a pending self-signup → ASSIGNED (capacity-guarded, FSM-guarded). */
  async approveShiftRequest(tenantId: string, assignmentId: string) {
    const req = await this.prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true, status: true, shiftId: true, volunteerId: true, shift: { select: { capacity: true } } },
    });
    if (!req) throw new ApiHttpException("ASSIGNMENT_NOT_FOUND", "Shift request not found", HttpStatus.NOT_FOUND);
    assertShiftAssignmentTransition(req.status, ShiftAssignmentStatus.ASSIGNED);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, req.shiftId);
        await this.assertShiftCapacity(tx, req.shiftId, req.shift.capacity, req.volunteerId);
        await tx.shiftAssignment.update({
          where: { id: assignmentId },
          data: { status: ShiftAssignmentStatus.ASSIGNED },
        });
        await this.outbox.append(tx, {
          tenantId,
          eventType: "canvass.shift.assigned",
          aggregateId: req.shiftId,
          payload: { shiftId: req.shiftId, tenantId, volunteerId: req.volunteerId, status: ShiftAssignmentStatus.ASSIGNED },
        });
      });
    } catch (error) {
      if (this.isSeatConflict(error)) {
        throw new ApiHttpException("SHIFT_SEAT_CONFLICT", "That volunteer already has a seat on this shift");
      }
      throw error;
    }
    return { id: assignmentId, status: ShiftAssignmentStatus.ASSIGNED };
  }

  /** Release a seat (organiser release, deny a request, or a volunteer dropping out). */
  private async releaseAssignmentTo(tenantId: string, assignmentId: string) {
    const req = await this.prisma.shiftAssignment.findFirst({
      where: { id: assignmentId, tenantId },
      select: { id: true, status: true, shiftId: true, volunteerId: true },
    });
    if (!req) throw new ApiHttpException("ASSIGNMENT_NOT_FOUND", "Shift assignment not found", HttpStatus.NOT_FOUND);
    assertShiftAssignmentTransition(req.status, ShiftAssignmentStatus.RELEASED);
    await this.prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.update({
        where: { id: assignmentId },
        data: { status: ShiftAssignmentStatus.RELEASED },
      });
      await this.outbox.append(tx, {
        tenantId,
        eventType: "canvass.shift.released",
        aggregateId: req.shiftId,
        payload: { shiftId: req.shiftId, tenantId, volunteerId: req.volunteerId },
      });
    });
    return { id: assignmentId, status: ShiftAssignmentStatus.RELEASED };
  }

  denyShiftRequest(tenantId: string, assignmentId: string) {
    return this.releaseAssignmentTo(tenantId, assignmentId);
  }

  releaseShiftAssignment(tenantId: string, assignmentId: string) {
    return this.releaseAssignmentTo(tenantId, assignmentId);
  }

  /** A volunteer drops their own seat on a shift. */
  async releaseOwnShift(tenantId: string, shiftId: string, volunteerId: string) {
    const active = await this.prisma.shiftAssignment.findFirst({
      where: {
        tenantId,
        shiftId,
        volunteerId,
        status: { in: [ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED] },
      },
      select: { id: true },
    });
    if (!active) throw new ApiHttpException("ASSIGNMENT_NOT_FOUND", "You have no seat on this shift", HttpStatus.NOT_FOUND);
    return this.releaseAssignmentTo(tenantId, active.id);
  }

  /** The roster for one shift — active seats + pending requests, with volunteer detail. */
  async listShiftAssignments(tenantId: string, shiftId: string) {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        tenantId,
        shiftId,
        status: { in: [ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED] },
      },
      include: { volunteer: { select: { id: true, displayName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      status: r.status,
      volunteer: { id: r.volunteer.id, name: r.volunteer.displayName, email: r.volunteer.email },
    }));
  }

  /** Upcoming, self-serve-eligible shifts in a campaign for the "pick a shift" field screen —
   *  each with its seat counts and whether this volunteer already holds/requested a seat. */
  async listAvailableShifts(tenantId: string, campaignId: string, volunteerId: string) {
    await this.assertSelfClaim(tenantId, campaignId);
    const shifts = await this.prisma.shift.findMany({
      where: { tenantId, campaignId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      include: { assignments: { select: { status: true, volunteerId: true } } },
    });
    return shifts.map((s) => {
      const assignedCount = s.assignments.filter((a) => a.status === ShiftAssignmentStatus.ASSIGNED).length;
      const mine = s.assignments.find(
        (a) =>
          a.volunteerId === volunteerId &&
          (a.status === ShiftAssignmentStatus.ASSIGNED || a.status === ShiftAssignmentStatus.REQUESTED),
      );
      const { assignments: _a, ...rest } = s;
      return {
        ...rest,
        assignedCount,
        isFull: s.capacity != null && assignedCount >= s.capacity,
        mine: mine ? mine.status : null,
      };
    });
  }

  /** A volunteer's own upcoming shifts (assigned or pending), tenant-wide. */
  async listMyShifts(tenantId: string, volunteerId: string) {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        tenantId,
        volunteerId,
        status: { in: [ShiftAssignmentStatus.REQUESTED, ShiftAssignmentStatus.ASSIGNED] },
        shift: { endsAt: { gte: new Date() } },
      },
      include: { shift: true },
      orderBy: { shift: { startsAt: "asc" } },
    });
    return rows.map((r) => ({ assignmentId: r.id, status: r.status, shift: r.shift }));
  }

  // ── QA review (G10): flag suspicious knocks ─────────────────────
  /** Knocks that look suspect: too-fast cadence or missing GPS. Read-only heuristic.
   *  Tenant-wide when no campaign id (the "All campaigns" view). */
  async qaReview(tenantId: string, campaignId?: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { tenantId, ...(campaignId ? { campaignId } : {}) },
      select: { id: true },
    });
    const turfIds = turfs.map((t) => t.id);
    if (turfIds.length === 0) return { flags: [] };

    const knocks = await this.prisma.doorKnock.findMany({
      where: { tenantId, contact: { turfId: { in: turfIds } } },
      orderBy: [{ volunteerId: "asc" }, { createdAt: "asc" }],
      include: { volunteer: { select: { displayName: true } } },
    });

    const flags: Array<{
      id: string;
      doorKnockId: string;
      kind: "NO_GPS" | "FAST_CADENCE";
      volunteer: string | null;
      reason: string;
      at: Date;
      resolved: boolean;
      state: string | null;
    }> = [];
    let prev: { volunteerId: string | null; at: Date } | null = null;
    for (const k of knocks) {
      if (k.lat == null || k.lng == null) {
        flags.push({
          id: `${k.id}:NO_GPS`,
          doorKnockId: k.id,
          kind: "NO_GPS",
          volunteer: k.volunteer?.displayName ?? null,
          reason: "No GPS captured",
          at: k.createdAt,
          resolved: false,
          state: null,
        });
      }
      if (prev && prev.volunteerId === k.volunteerId) {
        const gapSec = (k.createdAt.getTime() - prev.at.getTime()) / 1000;
        if (gapSec >= 0 && gapSec < 20) {
          flags.push({
            id: `${k.id}:FAST_CADENCE`,
            doorKnockId: k.id,
            kind: "FAST_CADENCE",
            volunteer: k.volunteer?.displayName ?? null,
            reason: `Knocked ${Math.round(gapSec)}s after previous`,
            at: k.createdAt,
            resolved: false,
            state: null,
          });
        }
      }
      prev = { volunteerId: k.volunteerId, at: k.createdAt };
    }

    // Annotate with any organiser resolutions (keyed by doorKnockId:kind).
    const resolutions = await this.prisma.qaFlagResolution.findMany({
      where: { tenantId, ...(campaignId ? { campaignId } : {}) },
      select: { doorKnockId: true, kind: true, state: true },
    });
    const resByKey = new Map(resolutions.map((r) => [`${r.doorKnockId}:${r.kind}`, r.state]));
    for (const f of flags) {
      const state = resByKey.get(f.id);
      if (state) {
        f.resolved = true;
        f.state = state;
      }
    }
    return { flags };
  }

  /** Record (or clear) an organiser's action on a computed QA flag. */
  async setQaFlagResolution(
    tenantId: string,
    campaignId: string,
    input: {
      doorKnockId: string;
      kind: "NO_GPS" | "FAST_CADENCE";
      resolved?: boolean;
      state?: "RESOLVED" | "DISMISSED";
      note?: string;
      resolvedById?: string;
    },
  ) {
    if (input.resolved === false) {
      await this.prisma.qaFlagResolution.deleteMany({
        where: { tenantId, campaignId, doorKnockId: input.doorKnockId, kind: input.kind },
      });
      return { resolved: false };
    }
    const state = input.state ?? "RESOLVED";
    await this.prisma.qaFlagResolution.upsert({
      where: { doorKnockId_kind: { doorKnockId: input.doorKnockId, kind: input.kind } },
      create: {
        tenantId,
        campaignId,
        doorKnockId: input.doorKnockId,
        kind: input.kind,
        state,
        note: input.note ?? null,
        resolvedById: input.resolvedById ?? null,
      },
      update: { state, note: input.note ?? null, resolvedById: input.resolvedById ?? null, resolvedAt: new Date() },
    });
    return { resolved: true, state };
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
