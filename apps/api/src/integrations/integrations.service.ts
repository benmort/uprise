import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { UnrecoverableError } from "bullmq";
import {
  AudienceSource,
  ConsentState,
  type Contact,
  IntegrationConnectionStatus,
  IntegrationJobStatus,
  IntegrationType,
  MessageChannel,
  Prisma,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../contacts/contacts.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { sanitizeMetadata, withDefaultContactable } from "../common/utils/metadata.utils";
import { CONTACT_TAG_PORT, type ContactTagPort } from "../tags/tag.port";
import { ConsentService } from "../messaging/consent.service";
import { parseDataSyncSettings } from "./data-sync-settings";
import { CredentialCryptoService, CredentialDecryptionError } from "./credential-crypto.service";
import { ActionNetworkConnector } from "./action-network.connector";
import { InternalSourceConnector } from "./internal-source.connector";
import { NationBuilderConnector } from "./nation-builder.connector";
import {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";
import { IntegrationNotConnectedError, IntegrationValidationError } from "./integration.errors";
import type { RemoteAudienceList } from "./connectors.types";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { getIntegrationSyncJobId, QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { IntegrationSyncJobPayload } from "../common/queue/queue.payloads";

type IntegrationConnectionType = "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";
type SyncReasonCounts = Record<string, number>;

/** How many people a sync page persists at once. High enough to hide the per-row round-trip
 *  latency, low enough that one import can't monopolise the connection pool. */
const SYNC_ROW_CONCURRENCY = 20;

/**
 * A connection resolved for use, with its provenance. `shared` / `ownerTenantId` /
 * `networkId` are always own-tenant today; they exist so the network-sharing resolver
 * can populate them without changing every call site, and so the UI can always say
 * whose external account a sync is actually reading from.
 */
type ResolvedConnection = {
  id: string;
  type: IntegrationConnectionType;
  name: string;
  apiKey: string;
  baseUrl?: string;
  shared: boolean;
  ownerTenantId: string;
  networkId: string | null;
};
type MappedExternalContact = {
  source: AudienceSource;
  phoneE164: string;
  fullName: string | null;
  email: string | null;
  externalId: string | null;
  metadata: Prisma.InputJsonValue;
  contactable: boolean;
  nonContactableReason: string | null;
};

type SyncCheckpointState = {
  provider: IntegrationConnectionType;
  listId: string;
  listName?: string;
  audienceName: string;
  pagesFetched: number;
  processedItems: number;
  returnedContacts: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  failedPersist: number;
  reasonCounts: SyncReasonCounts;
  sampleErrors: string[];
  nextCursorUrl?: string | null;
  runCount: number;
};

@Injectable()
export class IntegrationsService {
  private readonly queue: DispatchQueue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly actionNetwork: ActionNetworkConnector,
    private readonly internalSource: InternalSourceConnector,
    private readonly nationBuilder: NationBuilderConnector,
    private readonly logger: DomainLogger,
    private readonly contacts: ContactsService,
    private readonly outbox: OutboxService,
    @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
    /** Optional cross-domain seams (existing specs construct positionally; DI supplies them):
     *  the tag port mirrors NB person tags onto contact tags, consent mirrors NB-side
     *  opt-outs. Both best-effort — a missing seam skips the mirror, never the sync. */
    @Optional() @Inject(CONTACT_TAG_PORT) private readonly contactTags?: ContactTagPort,
    @Optional() private readonly consent?: ConsentService,
  ) {
    this.queue = queue ?? {
      enqueue: async (job) => ({ jobId: job.id, queued: true }),
    };
  }

  private connector(type: IntegrationConnectionType) {
    if (type === "ACTION_NETWORK") return this.actionNetwork;
    if (type === "NATION_BUILDER") return this.nationBuilder;
    return this.internalSource;
  }

  private defaultConnectionName(type: IntegrationConnectionType) {
    if (type === "ACTION_NETWORK") return "Action Network";
    if (type === "NATION_BUILDER") return "NationBuilder";
    return "Internal Source";
  }

  /** The audience source column value a connection type's syncs write. */
  private audienceSourceOf(type: IntegrationConnectionType): AudienceSource {
    if (type === "ACTION_NETWORK") return AudienceSource.ACTION_NETWORK;
    if (type === "NATION_BUILDER") return AudienceSource.NATION_BUILDER;
    return AudienceSource.INTERNAL;
  }

  private baseUrlFromSettings(settings: unknown): string | undefined {
    const raw = (settings as Record<string, unknown> | null)?.baseUrl;
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    return trimmed || undefined;
  }

  /**
   * The platform-wide base URL default for a provider. Deliberately the ONLY thing still
   * read from env on the credential path: a base URL is public, a key is not.
   *
   * There used to be an `ACTION_NETWORK_API_KEY` / `INTERNAL_SOURCE_API_KEY` fallback here.
   * It meant one platform key stood in for every tenant that hadn't connected an account,
   * so every tenant reached the same external org's data. Do not reintroduce it — a tenant
   * uses a credential it supplied, or (once network sharing lands) one another tenant has
   * explicitly granted it through a network. Nothing else.
   */
  private envBaseUrl(type: IntegrationConnectionType): string | undefined {
    // NationBuilder has no platform-wide default on purpose — every nation has its own
    // endpoint, derived from the nation slug at connect time.
    if (type === "NATION_BUILDER") return undefined;
    const key = type === "ACTION_NETWORK" ? "ACTION_NETWORK_API_BASE_URL" : "INTERNAL_SOURCE_API_BASE_URL";
    return (this.config.get<string>(key) || "").trim() || undefined;
  }

  /** Validate a caller-supplied credential pair. No env fallback for the key. */
  private resolveCredentials(
    type: IntegrationConnectionType,
    input: { apiKey?: string; baseUrl?: string },
  ): { apiKey: string; baseUrl?: string } {
    const apiKey = input.apiKey?.trim() || "";
    const baseUrl = input.baseUrl?.trim() || this.envBaseUrl(type);

    if (!apiKey) {
      throw new IntegrationValidationError("An API key is required to connect this integration");
    }
    if (type === "INTERNAL" && !baseUrl) {
      throw new IntegrationValidationError("A base URL is required for an internal source");
    }
    if (type === "NATION_BUILDER" && !baseUrl) {
      throw new IntegrationValidationError("A nation slug is required to connect NationBuilder");
    }

    return { apiKey, baseUrl };
  }

  /**
   * Resolve the connection a read/sync should run through. Purely a read — it never
   * creates and never mutates, which is what makes Disconnect durable. Callers may pin
   * an explicit `connectionId`; otherwise the tenant's own ACTIVE row for the type wins.
   */
  private async requireConnection(
    tenantId: string,
    input: { type?: IntegrationConnectionType; connectionId?: string },
  ): Promise<ResolvedConnection> {
    const row = input.connectionId
      ? await this.prisma.integrationConnection.findFirst({
          where: {
            id: input.connectionId,
            tenantId,
            status: IntegrationConnectionStatus.ACTIVE,
          },
        })
      : await this.prisma.integrationConnection.findFirst({
          where: {
            tenantId,
            type: input.type as IntegrationType,
            status: IntegrationConnectionStatus.ACTIVE,
          },
          orderBy: { updatedAt: "desc" },
        });

    if (!row) {
      throw new IntegrationNotConnectedError(
        input.connectionId
          ? "That integration connection is not available to this organisation"
          : `No active ${this.defaultConnectionName(input.type ?? "ACTION_NETWORK")} connection. Connect one in Settings → Integrations.`,
      );
    }

    return {
      id: row.id,
      type: row.type as IntegrationConnectionType,
      name: row.name,
      apiKey: this.crypto.decrypt(row.encryptedCredential),
      baseUrl: this.baseUrlFromSettings(row.settings) ?? this.envBaseUrl(row.type as IntegrationConnectionType),
      // Set by the network-sharing resolver once that lands; own connections are never shared.
      shared: false,
      ownerTenantId: row.tenantId,
      networkId: null,
    };
  }

  async upsertConnection(tenantId: string, dto: UpsertIntegrationConnectionDto) {
    // Action Network keys and NationBuilder tokens are per-group/per-nation; everything
    // else collapses to the "" group so it keeps its one-per-type upsert behaviour.
    const externalGroup =
      dto.type === "ACTION_NETWORK" || dto.type === "NATION_BUILDER" ? (dto.group?.trim() ?? "") : "";
    if (dto.type === "NATION_BUILDER") {
      // The nation slug doubles as the group AND derives the endpoint — it is not optional.
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(externalGroup)) {
        throw new IntegrationValidationError(
          "A NationBuilder connection needs its nation slug (the <slug> in <slug>.nationbuilder.com)",
        );
      }
    }
    const existing = await this.prisma.integrationConnection.findUnique({
      where: { tenantId_type_externalGroup: { tenantId, type: dto.type as IntegrationType, externalGroup } },
      select: { id: true, encryptedCredential: true, settings: true },
    });

    // Blank key on update keeps the stored one; blank key on create is rejected. It used
    // to silently mean "use the platform env key", which is how tenants ended up connected
    // to someone else's account while the UI reported success.
    const suppliedKey = dto.apiKey?.trim() || "";
    const apiKey = suppliedKey || (existing ? this.crypto.decrypt(existing.encryptedCredential) : "");
    const credentials = this.resolveCredentials(dto.type, {
      apiKey,
      // NationBuilder: the nation slug derives the default endpoint, but a supplied base
      // URL wins — some clients run the API on a custom (white-labelled) domain.
      baseUrl:
        dto.type === "NATION_BUILDER"
          ? dto.baseUrl?.trim() ||
            this.baseUrlFromSettings(existing?.settings) ||
            `https://${externalGroup.toLowerCase()}.nationbuilder.com`
          : dto.baseUrl?.trim() || this.baseUrlFromSettings(existing?.settings),
    });
    const encrypted = suppliedKey ? this.crypto.encrypt(credentials.apiKey) : existing!.encryptedCredential;

    const row = await this.prisma.integrationConnection.upsert({
      where: { tenantId_type_externalGroup: { tenantId, type: dto.type as IntegrationType, externalGroup } },
      create: {
        tenantId,
        type: dto.type as IntegrationType,
        name: dto.name,
        externalGroup,
        encryptedCredential: encrypted,
        status: IntegrationConnectionStatus.ACTIVE,
        settings: credentials.baseUrl ? { baseUrl: credentials.baseUrl } : undefined,
      },
      // Reconnecting is an explicit user action, so it may reactivate. No READ path is
      // allowed to do this — that is what kept undoing Disconnect.
      update: {
        name: dto.name,
        encryptedCredential: encrypted,
        status: IntegrationConnectionStatus.ACTIVE,
        settings: credentials.baseUrl ? { baseUrl: credentials.baseUrl } : undefined,
      },
    });
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      group: row.externalGroup,
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  /** Test a candidate key, or (with connectionId) the tenant's stored one. Never env. */
  async testConnection(tenantId: string, dto: TestIntegrationConnectionDto) {
    const connector = this.connector(dto.type);
    const credentials = dto.apiKey?.trim()
      ? this.resolveCredentials(dto.type, { apiKey: dto.apiKey, baseUrl: dto.baseUrl })
      : await this.requireConnection(tenantId, { type: dto.type, connectionId: dto.connectionId });
    const result = await connector.testConnection(credentials.apiKey, credentials.baseUrl);
    return { ...result, type: dto.type };
  }

  async searchLists(tenantId: string, dto: SearchIntegrationListsDto) {
    const connection = await this.requireConnection(tenantId, {
      type: dto.type,
      connectionId: dto.connectionId,
    });
    const lists = await this.connector(connection.type).searchLists(
      connection.apiKey,
      { query: dto.query, limit: 25, kind: dto.kind },
      connection.baseUrl,
    );
    return { lists: await this.fillCountsFromLastSync(tenantId, connection.id, lists) };
  }

  /**
   * Action Network's list resource carries no membership count, and its items collection
   * deliberately omits `total_records` – there is no cheap remote count at all. For any
   * list the provider left uncounted, fall back to what THIS tenant's last successful
   * sync of that exact list counted, labelled `countSource: "last_sync"` so the UI can
   * say how fresh the number is. Never-synced lists stay uncounted.
   */
  private async fillCountsFromLastSync(
    tenantId: string,
    connectionId: string,
    lists: RemoteAudienceList[],
  ): Promise<RemoteAudienceList[]> {
    const uncounted = lists.filter((list) => typeof list.count !== "number");
    if (uncounted.length === 0) return lists;
    const jobs = await this.prisma.integrationSyncJob.findMany({
      where: {
        tenantId,
        integrationConnectionId: connectionId,
        status: IntegrationJobStatus.SUCCEEDED,
        remoteListId: { in: uncounted.map((list) => list.id) },
      },
      orderBy: { createdAt: "desc" },
      distinct: ["remoteListId"],
      select: { remoteListId: true, syncedCount: true },
    });
    const lastSynced = new Map(jobs.map((job) => [job.remoteListId, job.syncedCount]));
    return lists.map((list) => {
      if (typeof list.count === "number") return list;
      const count = lastSynced.get(list.id);
      return typeof count === "number" ? { ...list, count, countSource: "last_sync" as const } : list;
    });
  }

  async sampleList(tenantId: string, dto: SampleIntegrationListDto) {
    const connection = await this.requireConnection(tenantId, {
      type: dto.type,
      connectionId: dto.connectionId,
    });
    const sample = await this.connector(connection.type).sampleListContacts(
      connection.apiKey,
      dto.listId,
      connection.baseUrl,
    );
    return { contacts: sample };
  }

  private mapExternalContact(type: IntegrationConnectionType, contact: any): MappedExternalContact {
    const source = this.audienceSourceOf(type);
    const rawMetadata =
      contact?.metadata && typeof contact.metadata === "object"
        ? (contact.metadata as Record<string, unknown>)
        : {};
    // Providers whose people can legitimately lack a phone (email-only members) keep
    // those rows as non-contactable audience entries — the synthetic phone key makes
    // the upsert work and `contactable: false` keeps them out of every send path.
    // Previously NationBuilder took the strict branch below, so an email-only nation
    // imported as zero members.
    if (type === "ACTION_NETWORK" || type === "NATION_BUILDER") {
      const externalId = String(contact.externalId || "").trim() || null;
      const requestedContactable =
        rawMetadata.contactable !== false && String(contact.phone ?? "").trim() !== "";
      let contactable = requestedContactable;
      let nonContactableReason: string | null = null;
      let phoneE164 = "__noncontactable__:missing-external-id";
      try {
        if (contactable) {
          phoneE164 = normalizePhoneE164(contact.phone);
        }
      } catch {
        contactable = false;
        nonContactableReason = "invalid_phone_format";
      }
      if (!contactable) {
        if (!nonContactableReason) {
          nonContactableReason = "missing_phone_number";
        }
        const fallbackId = createHash("sha1").update(JSON.stringify(contact || {})).digest("hex").slice(0, 16);
        phoneE164 = `__noncontactable__:${externalId || fallbackId}`;
      }
      const email =
        type === "ACTION_NETWORK"
          ? this.emailFromActionNetwork(rawMetadata)
          : typeof rawMetadata.email === "string"
            ? rawMetadata.email.trim().toLowerCase() || null
            : null;
      return {
        source,
        phoneE164,
        fullName: contact.name || null,
        email,
        externalId,
        contactable,
        nonContactableReason,
        metadata: this.toJsonBlob({
          ...rawMetadata,
          contactable,
          nonContactableReason,
        }),
      };
    }
    const phoneE164 = normalizePhoneE164(contact.phone);
    return {
      source,
      phoneE164,
      fullName: contact.name || null,
      email: typeof contact.email === "string" ? contact.email.trim() || null : null,
      externalId: contact.externalId || null,
      contactable: true,
      nonContactableReason: null,
      metadata:
        withDefaultContactable(sanitizeMetadata(rawMetadata)) as Prisma.InputJsonValue,
    };
  }

  /** NB person tags from the connector metadata blob — capped so a pathological person
   *  can't turn one row into hundreds of tag writes. */
  private nationBuilderTagsOf(mapped: MappedExternalContact): string[] {
    const meta = mapped.metadata as Record<string, unknown> | null;
    const nb = meta && typeof meta === "object" ? (meta as Record<string, unknown>).nationBuilder : undefined;
    const tags =
      nb && typeof nb === "object" && !Array.isArray(nb)
        ? (nb as Record<string, unknown>).tags
        : undefined;
    if (!Array.isArray(tags)) return [];
    return tags
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, 100);
  }

  /** True when the NB person blob carries an explicit do-not-contact signal. */
  private nationBuilderOptedOut(mapped: MappedExternalContact): boolean {
    const meta = mapped.metadata as Record<string, unknown> | null;
    const nb = meta && typeof meta === "object" ? (meta as Record<string, unknown>).nationBuilder : undefined;
    if (!nb || typeof nb !== "object" || Array.isArray(nb)) return false;
    const person = nb as Record<string, unknown>;
    return person.do_not_contact === true || person.do_not_call === true || person.mobile_opt_in === false;
  }

  /**
   * The contact rows a sync page will ask for, in one read, keyed by phone.
   *
   * Nothing here creates or enriches – it only saves `getOrCreateByPhone` its opening
   * `findFirst` for the (very common) case where the person already exists. A phone the
   * prime misses just falls through to the per-row lookup, so a contact created between
   * the prime and the row is found normally.
   */
  private async primeContactSpines(tenantId: string, phones: string[]): Promise<Map<string, Contact>> {
    if (phones.length === 0) return new Map();
    const rows = await this.prisma.contact.findMany({ where: { tenantId, phoneE164: { in: phones } } });
    return new Map(rows.filter((r): r is Contact & { phoneE164: string } => !!r.phoneE164).map((r) => [r.phoneE164, r]));
  }

  /**
   * Mirror an NB-side opt-out into uprise consent (SMS + WhatsApp, mirroring the STOP
   * keyword's behaviour). One-way by design: uprise never writes an opt-IN from a pull,
   * so a nation flag can only ever tighten contactability here.
   */
  private async mirrorNationBuilderOptOut(
    tenantId: string,
    mapped: MappedExternalContact,
    contactId: string | null,
  ): Promise<void> {
    if (!this.consent || !mapped.contactable || !this.nationBuilderOptedOut(mapped)) return;
    for (const channel of [MessageChannel.SMS, MessageChannel.WHATSAPP]) {
      await this.consent.setState({
        tenantId,
        phoneE164: mapped.phoneE164,
        channel,
        state: ConsentState.OPTED_OUT,
        contactId,
        source: "nation_builder_sync",
      });
    }
  }

  /**
   * Provenance source-system key for a connection (drives ContactSourceRecord).
   * NationBuilder keys are NATION-SCOPED (`nation_builder:<slug>`): NB person ids are
   * per-nation sequential integers, so the bare constant collapsed person 123 of two
   * nations connected by one tenant onto a single mapping row — harmless-ish for pull,
   * catastrophic for a push (activity written to the WRONG nation's person). Segment
   * resolvers treat the whole `nation_builder*` family as one source; the backfill
   * migration (20260806190000) scoped legacy rows for single-nation tenants.
   */
  private sourceSystemFor(type: IntegrationConnectionType, externalGroup?: string | null): string {
    if (type === "ACTION_NETWORK") return "action_network";
    if (type === "NATION_BUILDER") {
      const slug = String(externalGroup ?? "").trim();
      return slug ? `nation_builder:${slug}` : "nation_builder";
    }
    return "internal_source";
  }

  /**
   * Best-effort email from an Action Network person blob carried in the connector
   * metadata (`actionNetwork.person.email_addresses[]`). Prefers the primary
   * address. Returns null when none is present — identity resolution then falls
   * back to phone alone.
   */
  private emailFromActionNetwork(rawMetadata: Record<string, unknown>): string | null {
    const an = rawMetadata?.actionNetwork;
    const person =
      an && typeof an === "object" && !Array.isArray(an)
        ? (an as Record<string, unknown>).person
        : undefined;
    const addresses =
      person && typeof person === "object" && !Array.isArray(person)
        ? (person as Record<string, unknown>).email_addresses
        : undefined;
    if (!Array.isArray(addresses)) return null;
    const records = addresses.filter(
      (a): a is Record<string, unknown> => Boolean(a) && typeof a === "object",
    );
    const primary = records.find((a) => a.primary === true && typeof a.address === "string");
    const fallback = records.find((a) => typeof a.address === "string");
    const chosen = primary ?? fallback;
    const email = chosen ? String(chosen.address).trim().toLowerCase() : "";
    return email || null;
  }

  private toJsonBlob(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) return {};
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      return {};
    }
  }

  private bumpReason(reasonCounts: SyncReasonCounts, reason: string) {
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }

  private classifySyncError(error: unknown): string {
    const text = String(error || "").toLowerCase();
    if (text.includes("invalid_phone") || text.includes("e.164")) {
      return "invalid_phone_format";
    }
    if (text.includes("unique constraint") || text.includes("constraint")) {
      return "database_constraint_error";
    }
    return "persistence_error";
  }

  private getSyncPagesPerRun(): number {
    const envPages = Number(this.config.get<string>("ACTION_NETWORK_SYNC_PAGES_PER_RUN", "950"));
    const fallback = Number.isFinite(envPages) ? envPages : 950;
    return Math.min(Math.max(1, Math.trunc(fallback)), 1000);
  }

  private buildAudienceName(dto: {
    type: IntegrationConnectionType;
    listId: string;
    listName?: string;
    audienceName?: string;
  }): string {
    if (dto.type === "ACTION_NETWORK" || dto.type === "NATION_BUILDER") {
      const label = dto.type === "ACTION_NETWORK" ? "Action Network" : "NationBuilder";
      const candidate = dto.listName?.trim() || dto.audienceName?.trim() || dto.listId;
      const cleaned = candidate.replace(new RegExp(`^${label}:\\s*`, "i"), "").trim() || dto.listId;
      return `${label}: ${cleaned}`;
    }
    return dto.audienceName?.trim() || dto.listName?.trim() || `Internal: ${dto.listId}`;
  }

  private createInitialCheckpointState(payload: IntegrationSyncJobPayload): SyncCheckpointState {
    return {
      provider: payload.type,
      listId: payload.listId,
      listName: payload.listName,
      audienceName: payload.audienceName,
      pagesFetched: 0,
      processedItems: 0,
      returnedContacts: 0,
      skippedNoPhone: 0,
      skippedInvalidPhone: 0,
      failedPersist: 0,
      reasonCounts: {},
      sampleErrors: [],
      nextCursorUrl: payload.cursorUrl ?? null,
      runCount: payload.run ?? 0,
    };
  }

  private parseCheckpointState(
    raw: unknown,
    fallbackPayload: IntegrationSyncJobPayload,
  ): SyncCheckpointState {
    const fallback = this.createInitialCheckpointState(fallbackPayload);
    if (!raw) return fallback;
    try {
      // The dedicated `checkpoint` column arrives as a parsed object; the legacy
      // errorSummary overload arrives as a JSON string. Accept both.
      const parsed = (
        typeof raw === "string" ? JSON.parse(raw) : raw
      ) as Partial<SyncCheckpointState>;
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        ...fallback,
        ...parsed,
        reasonCounts:
          parsed.reasonCounts && typeof parsed.reasonCounts === "object"
            ? { ...parsed.reasonCounts }
            : fallback.reasonCounts,
        sampleErrors: Array.isArray(parsed.sampleErrors)
          ? parsed.sampleErrors.map((item) => String(item))
          : fallback.sampleErrors,
      };
    } catch {
      return fallback;
    }
  }

  private mergeReasonCounts(base: SyncReasonCounts, addition?: Record<string, number>): SyncReasonCounts {
    const merged = { ...base };
    for (const [reason, count] of Object.entries(addition || {})) {
      merged[reason] = (merged[reason] || 0) + Number(count || 0);
    }
    return merged;
  }

  private chunkKeyForPayload(payload: IntegrationSyncJobPayload): string {
    const raw = `${payload.run ?? 0}:${payload.cursorUrl || "start"}`;
    return createHash("sha1").update(raw).digest("hex").slice(0, 12);
  }

  private async enqueueSyncChunk(payload: IntegrationSyncJobPayload): Promise<{ jobId: string; queued: boolean }> {
    const chunkKey = this.chunkKeyForPayload(payload);
    return this.queue.enqueue({
      id: getIntegrationSyncJobId(payload.syncJobId, chunkKey),
      queue: QUEUE_NAMES.INTEGRATION_SYNC,
      type: QUEUE_JOB_TYPES.INTEGRATION_SYNC_LIST,
      payload,
      removeOnComplete: true,
    });
  }

  async syncList(tenantId: string, dto: SyncIntegrationListDto) {
    return this.requestSyncList(tenantId, dto);
  }

  async requestSyncList(tenantId: string, dto: SyncIntegrationListDto) {
    const connection = await this.requireConnection(tenantId, {
      type: dto.type,
      connectionId: dto.connectionId,
    });
    const audienceName = this.buildAudienceName({
      type: connection.type,
      listId: dto.listId,
      listName: dto.listName,
      audienceName: dto.audienceName,
    });
    const source = this.audienceSourceOf(connection.type);

    const initialPayload: IntegrationSyncJobPayload = {
      syncJobId: "",
      type: connection.type,
      listId: dto.listId,
      audienceName,
      listName: dto.listName,
      query: dto.query,
      run: 1,
    };
    const initialState = this.createInitialCheckpointState(initialPayload);

    // Create the audience up-front and stamp it on the sync job in one transaction,
    // so the UI can show the row and its live status immediately instead of waiting
    // for the worker to lazily create it (and so a failed sync still leaves a
    // visible, FAILED-badged row rather than nothing). Idempotent on
    // (tenant, list, source): a re-sync reuses the audience instead of spawning a
    // duplicate — the old lazy path created a fresh audience on every run.
    //
    // NB: there is no unique index on (tenantId, externalListId, source) yet (it is
    // deferred — prod likely has legacy duplicates that would block CREATE UNIQUE
    // INDEX). A concurrent double-click can therefore still create two audiences;
    // when the index lands, add the P2002 re-read OUTSIDE this transaction (a
    // constraint error aborts the whole interactive tx, so it can't be caught here).
    const { syncJob, audienceId } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.audience.findFirst({
        where: { tenantId, externalListId: dto.listId, source },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (existing) {
        // Re-sync may run through a different connection than last time (a tenant
        // reconnected, or switched from its own account to a network-shared one).
        // Keep the provenance stamp current.
        await tx.audience.update({
          where: { id: existing.id },
          data: { integrationConnectionId: connection.id },
        });
      }
      const audience =
        existing ??
        (await tx.audience.create({
          data: {
            tenantId,
            name: audienceName,
            source,
            externalListId: dto.listId,
            integrationConnectionId: connection.id,
            status: "ACTIVE",
          },
          select: { id: true },
        }));
      const job = await tx.integrationSyncJob.create({
        data: {
          tenantId,
          integrationConnectionId: connection.id,
          status: IntegrationJobStatus.QUEUED,
          query: dto.query,
          remoteListId: dto.listId,
          audienceId: audience.id,
          // checkpoint owns the resume state; errorSummary keeps a copy while the
          // admin surfaces still parse stats out of it (dual-write, retired later).
          checkpoint: initialState as unknown as Prisma.InputJsonValue,
          errorSummary: JSON.stringify(initialState),
        },
      });
      return { syncJob: job, audienceId: audience.id };
    });

    const payload: IntegrationSyncJobPayload = {
      ...initialPayload,
      syncJobId: syncJob.id,
    };
    let queued: { jobId: string; queued: boolean };
    try {
      queued = await this.enqueueSyncChunk(payload);
    } catch (error) {
      await this.prisma.integrationSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: IntegrationJobStatus.FAILED,
          completedAt: new Date(),
          errorSummary: JSON.stringify({
            ...initialState,
            failedAt: new Date().toISOString(),
            error: String(error),
          }),
        },
      });
      throw error;
    }
    return {
      syncJobId: syncJob.id,
      audienceId,
      queued: queued.queued,
      queueJobId: queued.jobId,
      status: IntegrationJobStatus.QUEUED,
      audienceName,
      listId: dto.listId,
      type: connection.type,
    };
  }

  async processSyncQueueJob(payload: IntegrationSyncJobPayload) {
    const syncJob = await this.prisma.integrationSyncJob.findUnique({
      where: { id: payload.syncJobId },
      include: {
        connection: {
          select: {
            id: true,
            type: true,
            encryptedCredential: true,
            settings: true,
            // NB nation slug — scopes ContactSourceRecord.sourceSystem per nation.
            externalGroup: true,
          },
        },
      },
    });
    if (!syncJob) {
      throw new NotFoundException("Integration sync job not found");
    }
    if (syncJob.status === IntegrationJobStatus.SUCCEEDED) {
      return {
        syncJobId: syncJob.id,
        status: syncJob.status,
        syncedCount: syncJob.syncedCount,
        failedCount: syncJob.failedCount,
      };
    }

    const connectionType = syncJob.connection.type as IntegrationConnectionType;
    // checkpoint column first; errorSummary keeps legacy in-flight rows resumable.
    const checkpoint = this.parseCheckpointState(syncJob.checkpoint ?? syncJob.errorSummary, payload);
    const audienceId = syncJob.audienceId;
    let ensuredAudienceId = audienceId;
    // Resolving the endpoint, decrypting the credential and the RUNNING stamp itself all
    // sit INSIDE this try. They used to run above it, and anything that threw there never
    // reached the catch that records the failure: the row kept status QUEUED with a null
    // startedAt and no errorSummary, so the audience page reported "queued but hasn't
    // started — the background importer isn't processing it" while the worker was in fact
    // picking the job up on every retry and dying on the same line. A worker whose
    // INTEGRATION_CREDENTIAL_SECRET has drifted from the API's hits exactly that.
    try {
      const baseUrl = this.baseUrlFromSettings(syncJob.connection.settings) || this.envBaseUrl(connectionType);
      const apiKey = this.crypto.decrypt(syncJob.connection.encryptedCredential);
      const cursorUrl = payload.cursorUrl || checkpoint.nextCursorUrl || undefined;
      const startedAt = syncJob.startedAt ?? new Date();
      await this.prisma.integrationSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: IntegrationJobStatus.RUNNING,
          startedAt,
          completedAt: null,
        },
      });

      const remoteSync = await this.connector(connectionType).syncList(
        apiKey,
        {
          listId: payload.listId,
          query: payload.query,
          listName: payload.listName,
          cursorUrl,
          maxPages: this.getSyncPagesPerRun(),
        },
        baseUrl,
      );
      const remoteContacts = remoteSync.contacts;
      if (!ensuredAudienceId) {
        const audience = await this.prisma.audience.create({
          data: {
            tenantId: syncJob.tenantId,
            name: checkpoint.audienceName,
            source: this.audienceSourceOf(connectionType),
            externalListId: payload.listId,
            status: "ACTIVE",
          },
        });
        ensuredAudienceId = audience.id;
      }

      let syncedDelta = 0;
      let failedDelta = 0;
      let skippedInvalidPhone = 0;
      let failedPersist = 0;
      const errors: string[] = [];
      const reasonCounts = this.mergeReasonCounts(
        checkpoint.reasonCounts,
        remoteSync.stats.reasonCounts,
      );
      const dataSync = parseDataSyncSettings(syncJob.connection.settings);
      // Invariant for the whole page – it was recomputed once per contactable row.
      const sourceSystem = this.sourceSystemFor(connectionType, syncJob.connection.externalGroup);

      const recordRowFailure = (error: unknown) => {
        failedDelta += 1;
        const reason = this.classifySyncError(error);
        this.bumpReason(reasonCounts, reason);
        if (reason === "invalid_phone_format") skippedInvalidPhone += 1;
        else failedPersist += 1;
        errors.push(String(error));
      };

      // Map first. It is pure, it is where an unusable phone surfaces (so its failure still
      // lands in the same per-row accounting), and it yields the phone key the pool groups on.
      const groups = new Map<string, MappedExternalContact[]>();
      for (const contact of remoteContacts) {
        try {
          const mapped = this.mapExternalContact(connectionType, contact);
          const group = groups.get(mapped.phoneE164);
          if (group) group.push(mapped);
          else groups.set(mapped.phoneE164, [mapped]);
        } catch (error) {
          recordRowFailure(error);
        }
      }

      // Prime the contact spine for the whole page in one read. `getOrCreateByPhone` opens
      // with a `findFirst` on (tenantId, phoneE164); on a re-sync nearly every one of them
      // hits, so a page of a thousand people paid for a thousand lookups of rows a single
      // `IN` could have fetched.
      const primedSpines = await this.primeContactSpines(syncJob.tenantId, [...groups.keys()]);

      // The pool's closure cannot see the flow analysis that proved the audience exists
      // above, so pin it once here.
      const audienceIdForRows = ensuredAudienceId;

      const persistRow = async (mapped: MappedExternalContact) => {
        try {
          if (!mapped.contactable && mapped.nonContactableReason) {
            if (mapped.nonContactableReason === "invalid_phone_format") {
              this.bumpReason(reasonCounts, mapped.nonContactableReason);
              skippedInvalidPhone += 1;
            }
          }

          // Resolve the Contact spine for contactable rows (meld doc 10) so an
          // imported contact shares the one person record as door/text history.
          let resolvedContactId: string | null = null;
          if (mapped.contactable) {
            const spine = await this.contacts.getOrCreateByPhone(
              syncJob.tenantId,
              mapped.phoneE164,
              { fullName: mapped.fullName, email: mapped.email },
              primedSpines.get(mapped.phoneE164),
            );
            resolvedContactId = spine.id;
          }

          await this.prisma.audienceContact.upsert({
            where: {
              audienceId_phoneE164: {
                audienceId: audienceIdForRows,
                phoneE164: mapped.phoneE164,
              },
            },
            update: {
              fullName: mapped.fullName,
              metadata: mapped.metadata,
              externalId: mapped.externalId,
              source: mapped.source,
              ...(resolvedContactId ? { contactId: resolvedContactId } : {}),
            },
            create: {
              tenantId: syncJob.tenantId,
              audienceId: audienceIdForRows,
              phoneE164: mapped.phoneE164,
              fullName: mapped.fullName,
              metadata: mapped.metadata,
              externalId: mapped.externalId,
              source: mapped.source,
              ...(resolvedContactId ? { contactId: resolvedContactId } : {}),
            },
          });

          // Provenance + cross-source identity (meld doc 10). recordSourceRecord
          // makes the `hasSource` clause real; resolveIdentity (email present)
          // collapses the same person across sources onto one canonicalContactId.
          if (resolvedContactId) {
            if (mapped.externalId) {
              await this.contacts.recordSourceRecord({
                tenantId: syncJob.tenantId,
                contactId: resolvedContactId,
                sourceSystem,
                externalId: mapped.externalId,
              });
            }
            if (mapped.email) {
              await this.contacts.resolveIdentity(syncJob.tenantId, {
                email: mapped.email,
                phoneE164: mapped.phoneE164,
              });
            }
            // NB person tags → contact tags, so `tag.tagged` segments see them. Source
            // "nation_builder" is load-bearing: the future push reaction filters on it
            // so an imported tag never echoes back to the nation. Best-effort — a tag
            // failure is counted, never fatal to the row.
            if (connectionType === "NATION_BUILDER" && dataSync.pull.importTags && this.contactTags) {
              for (const tag of this.nationBuilderTagsOf(mapped)) {
                try {
                  await this.contactTags.applyTag(syncJob.tenantId, resolvedContactId, tag, "nation_builder");
                } catch {
                  this.bumpReason(reasonCounts, "tag_apply_failed");
                }
              }
            }
          }
          // Mirror an NB do-not-contact flag into uprise consent (one-way tighten only).
          if (connectionType === "NATION_BUILDER") {
            try {
              await this.mirrorNationBuilderOptOut(syncJob.tenantId, mapped, resolvedContactId);
            } catch {
              this.bumpReason(reasonCounts, "consent_mirror_failed");
            }
          }
          syncedDelta += 1;
        } catch (error) {
          recordRowFailure(error);
        }
      };

      // A page of people used to be one long serial chain – spine, audience upsert,
      // provenance, identity and the consent mirror, each awaited before the next person
      // started. The rows are independent, so they run through a small bounded pool instead.
      // The unit of work is a PHONE GROUP, not a row: the contact spine (tenantId, phoneE164)
      // and the audience row (audienceId, phoneE164) are both unique on the phone, so two
      // copies of the same person in flight would collide on the index where, serially, the
      // second simply updated the first. Same-phone rows therefore stay in order with one
      // another while different people run SYNC_ROW_CONCURRENCY wide.
      const phoneKeys = [...groups.keys()];
      let nextKey = 0;
      await Promise.all(
        Array.from({ length: Math.min(SYNC_ROW_CONCURRENCY, phoneKeys.length) }, async () => {
          while (nextKey < phoneKeys.length) {
            const group = groups.get(phoneKeys[nextKey++]!) ?? [];
            for (const mapped of group) await persistRow(mapped);
          }
        }),
      );

      const nextState: SyncCheckpointState = {
        ...checkpoint,
        provider: connectionType,
        listId: payload.listId,
        listName: payload.listName || remoteSync.stats.listName || checkpoint.listName,
        pagesFetched: checkpoint.pagesFetched + remoteSync.stats.pagesFetched,
        processedItems: checkpoint.processedItems + remoteSync.stats.processedItems,
        returnedContacts: checkpoint.returnedContacts + remoteSync.stats.returnedContacts,
        skippedNoPhone: checkpoint.skippedNoPhone + remoteSync.stats.skippedNoPhone,
        skippedInvalidPhone: checkpoint.skippedInvalidPhone + skippedInvalidPhone,
        failedPersist: checkpoint.failedPersist + failedPersist,
        reasonCounts,
        sampleErrors: [...checkpoint.sampleErrors, ...errors].slice(-20),
        nextCursorUrl: remoteSync.stats.nextCursorUrl ?? null,
        runCount: Math.max(checkpoint.runCount, payload.run ?? 0),
      };
      const syncedCount = syncJob.syncedCount + syncedDelta;
      const failedCount = syncJob.failedCount + failedDelta;

      if (nextState.nextCursorUrl) {
        await this.prisma.integrationSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: IntegrationJobStatus.RUNNING,
            syncedCount,
            failedCount,
            checkpoint: nextState as unknown as Prisma.InputJsonValue,
            errorSummary: JSON.stringify(nextState),
            audienceId: ensuredAudienceId,
          completedAt: null,
          },
        });

        const nextPayload: IntegrationSyncJobPayload = {
          ...payload,
          cursorUrl: nextState.nextCursorUrl,
          run: (payload.run ?? 1) + 1,
        };
        const queued = await this.enqueueSyncChunk(nextPayload);
        return {
          syncJobId: syncJob.id,
          status: IntegrationJobStatus.RUNNING,
          syncedCount,
          failedCount,
          queuedNext: queued.queued,
          nextQueueJobId: queued.jobId,
          nextCursorUrl: nextState.nextCursorUrl,
        };
      }

      const finalStats = {
        provider: connectionType,
        listId: payload.listId,
        listName: nextState.listName,
        pagesFetched: nextState.pagesFetched,
        processedItems: nextState.processedItems,
        returnedContacts: nextState.returnedContacts,
        skippedNoPhone: nextState.skippedNoPhone,
        skippedInvalidPhone: nextState.skippedInvalidPhone,
        failedPersist: nextState.failedPersist,
        syncedCount,
        failedCount,
        reasonCounts: nextState.reasonCounts,
        sampleErrors: nextState.sampleErrors.slice(0, 10),
        completedRuns: nextState.runCount,
      };

      // Capture into a const so the closure keeps the non-null narrowing the loop
      // guarantees (a `let` reassignable outside the closure would widen back).
      const finalAudienceId = ensuredAudienceId;
      if (!finalAudienceId) throw new Error("Sync completed without an ensured audience");
      await this.prisma.$transaction(async (tx) => {
        await tx.integrationSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: IntegrationJobStatus.SUCCEEDED,
            syncedCount,
            failedCount,
            // Done — no resume state left. errorSummary keeps the final stats record
            // (that IS its real meaning here, and the audience page parses it).
            checkpoint: Prisma.DbNull,
            errorSummary: JSON.stringify(finalStats),
            completedAt: new Date(),
            audienceId: finalAudienceId,
          },
        });
        await tx.audience.update({
          where: { id: finalAudienceId },
          data: { syncedAt: new Date() },
        });
        // Durable domain event committed atomically with the sync close (doc 05).
        await this.outbox.append(tx, {
          tenantId: syncJob.tenantId,
          eventType: "audience.imported",
          aggregateId: finalAudienceId,
          payload: {
            audienceId: finalAudienceId,
            tenantId: syncJob.tenantId,
            count: syncedCount,
          },
        });
      });

      this.logger.log("integrations", "Sync finished", {
        type: connectionType,
        listId: payload.listId,
        syncedCount,
        failedCount,
      });

      return {
        audienceId: ensuredAudienceId,
        syncJobId: syncJob.id,
        syncedCount,
        failedCount,
        stats: finalStats,
      };
    } catch (error) {
      await this.prisma.integrationSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: IntegrationJobStatus.FAILED,
          completedAt: new Date(),
          errorSummary: JSON.stringify({
            ...checkpoint,
            failedAt: new Date().toISOString(),
            error: String(error),
          }),
          audienceId: ensuredAudienceId ?? undefined,
        },
      });
      // A credential this process cannot decrypt is permanent — the key will not change
      // between attempts. Left retryable it burns all 19 attempts on an exponential
      // backoff from 9.5 min (attempt 14 lands ~54 days out) and, because the job is
      // enqueued with removeOnFail: false, it parks in `delayed` where no failure count
      // ever surfaces it. UnrecoverableError sends it straight to `failed` instead.
      if (error instanceof CredentialDecryptionError) {
        this.logger.error("integrations", "Sync credential could not be decrypted", undefined, {
          syncJobId: syncJob.id,
          connectionId: syncJob.connection.id,
          type: connectionType,
        });
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  /**
   * The audience page's sync feed. Explicitly selected so the two JSON blobs on the row –
   * `checkpoint` (the resumable cursor plus accumulated stats) and `query` – stay on the
   * server: nothing in the UI reads them, and a hundred in-flight imports would otherwise
   * ship a hundred accumulated-stats documents to render a status badge.
   */
  async getSyncJobs(tenantId: string, limit = 20) {
    return this.prisma.integrationSyncJob.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
      select: {
        id: true,
        tenantId: true,
        integrationConnectionId: true,
        audienceId: true,
        status: true,
        remoteListId: true,
        syncedCount: true,
        failedCount: true,
        errorSummary: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Scheduled re-sync: keep provider-sourced audiences fresh without anyone clicking
   * Sync again. Finds audiences whose connection has `pull.autoRefresh` on and whose
   * `syncedAt` is older than that connection's interval, skips any with a live job
   * (the new `[audienceId, status]` index), and re-runs `requestSyncList` — which
   * find-or-creates onto the SAME audience via `(tenantId, externalListId, source)`,
   * so a refresh is a top-up, never a duplicate.
   *
   * Cron-dispatched (CRON_SECRET) like `/audiences/dispatch-imports`. Bounded per tick
   * so one giant tenant can't starve the rest; the next tick picks up the remainder.
   */
  async dispatchDueRefreshes(limit = 20) {
    const cap = Math.min(Math.max(1, limit), 50);
    // The finest interval is 1 h — anything synced within the last hour can't be due.
    const coarseCutoff = new Date(Date.now() - 60 * 60 * 1000);
    const candidates = await this.prisma.audience.findMany({
      where: {
        status: "ACTIVE",
        source: { in: [AudienceSource.NATION_BUILDER, AudienceSource.ACTION_NETWORK] },
        integrationConnectionId: { not: null },
        externalListId: { not: null },
        OR: [{ syncedAt: null }, { syncedAt: { lt: coarseCutoff } }],
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        source: true,
        externalListId: true,
        integrationConnectionId: true,
        syncedAt: true,
      },
      orderBy: { syncedAt: "asc" },
      take: cap * 3, // headroom for the per-connection filters below
    });
    if (candidates.length === 0) return { dispatched: 0, considered: 0 };

    const connections = await this.prisma.integrationConnection.findMany({
      where: {
        id: { in: [...new Set(candidates.map((a) => a.integrationConnectionId!))] },
        status: IntegrationConnectionStatus.ACTIVE,
      },
      select: { id: true, type: true, settings: true },
    });
    const connectionById = new Map(connections.map((c) => [c.id, c]));

    // One query answers "which candidates already have a live job".
    const liveJobs = await this.prisma.integrationSyncJob.findMany({
      where: {
        audienceId: { in: candidates.map((a) => a.id) },
        status: { in: [IntegrationJobStatus.QUEUED, IntegrationJobStatus.RUNNING] },
      },
      select: { audienceId: true },
    });
    const busyAudienceIds = new Set(liveJobs.map((j) => j.audienceId));

    let dispatched = 0;
    for (const audience of candidates) {
      if (dispatched >= cap) break;
      if (busyAudienceIds.has(audience.id)) continue;
      const connection = connectionById.get(audience.integrationConnectionId!);
      if (!connection) continue; // disconnected or deactivated — never refresh through it
      const refresh = parseDataSyncSettings(connection.settings).pull.autoRefresh;
      if (!refresh.enabled) continue;
      const due =
        !audience.syncedAt ||
        Date.now() - audience.syncedAt.getTime() >= refresh.intervalHours * 60 * 60 * 1000;
      if (!due) continue;
      try {
        await this.requestSyncList(audience.tenantId, {
          type: connection.type as IntegrationConnectionType,
          listId: audience.externalListId!,
          audienceName: audience.name,
          connectionId: connection.id,
        });
        dispatched += 1;
      } catch (error) {
        // One audience's failure (revoked token, deleted remote list) must not stop
        // the sweep — log and keep walking.
        this.logger.warn("integrations", "Scheduled refresh dispatch failed", {
          audienceId: audience.id,
          connectionId: connection.id,
          error: String(error),
        });
      }
    }
    return { dispatched, considered: candidates.length };
  }

  /**
   * Merge a partial data-sync settings patch into the connection's `settings.dataSync`
   * blob. Absent fields keep their stored value; the response is the fully defaulted
   * shape (what every reader — the pull loop, the push worker, the UI — will see).
   */
  async updateDataSyncSettings(
    tenantId: string,
    connectionId: string,
    patch: {
      pull?: { importTags?: boolean; autoRefreshEnabled?: boolean; autoRefreshIntervalHours?: number };
      push?: {
        enabled?: boolean;
        streams?: Partial<Record<"dispositions" | "surveyAnswers" | "tags" | "textReplies" | "rsvps", boolean>>;
        supportLevelsEnabled?: boolean;
        createMissingPeople?: boolean;
        tagPrefix?: string;
        nbSenderId?: number | null;
      };
    },
  ) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, tenantId },
      select: { id: true, settings: true },
    });
    if (!connection) throw new NotFoundException("Integration connection not found");
    const current = parseDataSyncSettings(connection.settings);
    const next = {
      pull: {
        importTags: patch.pull?.importTags ?? current.pull.importTags,
        autoRefresh: {
          enabled: patch.pull?.autoRefreshEnabled ?? current.pull.autoRefresh.enabled,
          intervalHours: patch.pull?.autoRefreshIntervalHours ?? current.pull.autoRefresh.intervalHours,
        },
      },
      push: {
        enabled: patch.push?.enabled ?? current.push.enabled,
        streams: { ...current.push.streams, ...(patch.push?.streams ?? {}) },
        supportLevelsEnabled: patch.push?.supportLevelsEnabled ?? current.push.supportLevelsEnabled,
        // Not configurable — the per-row consent gate on support levels always applies.
        supportLevelRequiresConsent: true as const,
        createMissingPeople: patch.push?.createMissingPeople ?? current.push.createMissingPeople,
        tagPrefix: patch.push?.tagPrefix ?? current.push.tagPrefix,
        nbSenderId: patch.push?.nbSenderId !== undefined ? patch.push.nbSenderId : current.push.nbSenderId,
      },
    };
    const priorSettings =
      connection.settings && typeof connection.settings === "object"
        ? (connection.settings as Record<string, unknown>)
        : {};
    await this.prisma.integrationConnection.update({
      where: { id: connection.id },
      data: { settings: { ...priorSettings, dataSync: next } as Prisma.InputJsonValue },
    });
    return next;
  }

  /** Flip a connection ACTIVE↔INACTIVE (disconnect / reconnect). Scoped to the org. */
  async setConnectionStatus(tenantId: string, id: string, status: IntegrationConnectionStatus) {
    const res = await this.prisma.integrationConnection.updateMany({
      where: { id, tenantId },
      data: { status },
    });
    if (res.count === 0) throw new NotFoundException("Integration connection not found");
    return { id, status };
  }

  /** Remove a connection entirely (sync jobs cascade). Scoped to the org. */
  async deleteConnection(tenantId: string, id: string) {
    const res = await this.prisma.integrationConnection.deleteMany({ where: { id, tenantId } });
    if (res.count === 0) throw new NotFoundException("Integration connection not found");
    return { deleted: true };
  }

  /** Configured connections for the settings/integrations surface. Never returns the credential. */
  async listConnections(tenantId: string) {
    const rows = await this.prisma.integrationConnection.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        type: true,
        name: true,
        externalGroup: true,
        status: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map(({ externalGroup, ...row }) => ({ ...row, group: externalGroup }));
  }
}
