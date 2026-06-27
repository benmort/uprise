import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import {
  AudienceSource,
  IntegrationConnectionStatus,
  IntegrationJobStatus,
  IntegrationType,
  Prisma,
} from "@uprise/db";
import { PrismaService } from "../prisma/prisma.service";
import { ContactsService } from "../contacts/contacts.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { normalizePhoneE164 } from "../common/utils/phone.utils";
import { sanitizeMetadata, withDefaultContactable } from "../common/utils/metadata.utils";
import { CredentialCryptoService } from "./credential-crypto.service";
import { ActionNetworkConnector } from "./action-network.connector";
import { InternalSourceConnector } from "./internal-source.connector";
import {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";
import { IntegrationValidationError } from "./integration.errors";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { DispatchQueue } from "../common/queue/dispatch-queue";
import { getIntegrationSyncJobId, QUEUE_JOB_TYPES, QUEUE_NAMES } from "../common/queue/queue.constants";
import { DISPATCH_QUEUE_TOKEN } from "../common/queue/queue.tokens";
import { IntegrationSyncJobPayload } from "../common/queue/queue.payloads";

type IntegrationConnectionType = "ACTION_NETWORK" | "INTERNAL";
type SyncReasonCounts = Record<string, number>;
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
    private readonly logger: DomainLogger,
    private readonly contacts: ContactsService,
    private readonly outbox: OutboxService,
    @Inject(DISPATCH_QUEUE_TOKEN) queue?: DispatchQueue,
  ) {
    this.queue = queue ?? {
      enqueue: async (job) => ({ jobId: job.id, queued: true }),
    };
  }

  private connector(type: IntegrationConnectionType) {
    return type === "ACTION_NETWORK" ? this.actionNetwork : this.internalSource;
  }

  private defaultConnectionName(type: IntegrationConnectionType) {
    return type === "ACTION_NETWORK" ? "Action Network" : "Internal Source";
  }

  private baseUrlFromSettings(settings: unknown): string | undefined {
    const raw = (settings as Record<string, unknown> | null)?.baseUrl;
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    return trimmed || undefined;
  }

  private envCredentials(type: IntegrationConnectionType): { apiKey: string; baseUrl?: string } {
    if (type === "ACTION_NETWORK") {
      const apiKey = (this.config.get<string>("ACTION_NETWORK_API_KEY") || "").trim();
      const baseUrl = (this.config.get<string>("ACTION_NETWORK_API_BASE_URL") || "").trim();
      return { apiKey, baseUrl: baseUrl || undefined };
    }
    const apiKey = (this.config.get<string>("INTERNAL_SOURCE_API_KEY") || "").trim();
    const baseUrl = (this.config.get<string>("INTERNAL_SOURCE_API_BASE_URL") || "").trim();
    return { apiKey, baseUrl: baseUrl || undefined };
  }

  private resolveCredentials(
    type: IntegrationConnectionType,
    input: { apiKey?: string; baseUrl?: string },
  ): { apiKey: string; baseUrl?: string } {
    const env = this.envCredentials(type);
    const apiKey = input.apiKey?.trim() || env.apiKey;
    const baseUrl = input.baseUrl?.trim() || env.baseUrl;

    if (!apiKey) {
      const envKeyName = type === "ACTION_NETWORK" ? "ACTION_NETWORK_API_KEY" : "INTERNAL_SOURCE_API_KEY";
      throw new IntegrationValidationError(`${envKeyName} is not configured`);
    }
    if (type === "INTERNAL" && !baseUrl) {
      throw new IntegrationValidationError("INTERNAL_SOURCE_API_BASE_URL is not configured");
    }

    return { apiKey, baseUrl };
  }

  private async ensureOrganization() {
    const slug = this.config.get<string>("DEFAULT_ORGANIZATION_SLUG", "default");
    return this.prisma.tenant.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  private async resolveConnection(type: IntegrationConnectionType) {
    const org = await this.ensureOrganization();
    const existing = await this.prisma.integrationConnection.findFirst({
      where: {
        tenantId: org.id,
        type: type as IntegrationType,
        status: IntegrationConnectionStatus.ACTIVE,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!existing) return null;
    return {
      ...existing,
      apiKey: this.crypto.decrypt(existing.encryptedCredential),
    };
  }

  private async ensureConnection(type: IntegrationConnectionType) {
    const existing = await this.resolveConnection(type);
    if (!existing) {
      const defaults = this.resolveCredentials(type, {});
      const created = await this.upsertConnection({
        type,
        name: this.defaultConnectionName(type),
        apiKey: defaults.apiKey,
        baseUrl: defaults.baseUrl,
      });
      return {
        id: created.id,
        apiKey: defaults.apiKey,
        baseUrl: defaults.baseUrl,
      };
    }

    const existingBaseUrl = this.baseUrlFromSettings(existing.settings);
    const credentials = this.resolveCredentials(type, {
      apiKey: existing.apiKey,
      baseUrl: existingBaseUrl,
    });

    if (existing.apiKey !== credentials.apiKey || existingBaseUrl !== credentials.baseUrl) {
      await this.upsertConnection({
        type,
        name: existing.name,
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
      });
    }

    return {
      id: existing.id,
      apiKey: credentials.apiKey,
      baseUrl: credentials.baseUrl,
    };
  }

  async upsertConnection(dto: UpsertIntegrationConnectionDto) {
    const org = await this.ensureOrganization();
    const credentials = this.resolveCredentials(dto.type, {
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
    });
    const encrypted = this.crypto.encrypt(credentials.apiKey);
    const row = await this.prisma.integrationConnection.upsert({
      where: {
        id: (
          await this.prisma.integrationConnection.findFirst({
            where: {
              tenantId: org.id,
              type: dto.type as IntegrationType,
            },
            select: { id: true },
          })
        )?.id || "missing",
      },
      create: {
        tenantId: org.id,
        type: dto.type as IntegrationType,
        name: dto.name,
        encryptedCredential: encrypted,
        status: IntegrationConnectionStatus.ACTIVE,
        settings: credentials.baseUrl ? { baseUrl: credentials.baseUrl } : undefined,
      },
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
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  async testConnection(dto: TestIntegrationConnectionDto) {
    const connector = this.connector(dto.type);
    const credentials = this.resolveCredentials(dto.type, {
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl,
    });
    const result = await connector.testConnection(credentials.apiKey, credentials.baseUrl);
    return { ...result, type: dto.type };
  }

  async searchLists(dto: SearchIntegrationListsDto) {
    const connection = await this.ensureConnection(dto.type);
    const lists = await this.connector(dto.type).searchLists(
      connection.apiKey,
      { query: dto.query, limit: 25 },
      connection.baseUrl,
    );
    return { lists };
  }

  async sampleList(dto: SampleIntegrationListDto) {
    const connection = await this.ensureConnection(dto.type);
    const sample = await this.connector(dto.type).sampleListContacts(
      connection.apiKey,
      dto.listId,
      connection.baseUrl,
    );
    return { contacts: sample };
  }

  private mapExternalContact(type: "ACTION_NETWORK" | "INTERNAL", contact: any): MappedExternalContact {
    const source = type === "ACTION_NETWORK" ? AudienceSource.ACTION_NETWORK : AudienceSource.INTERNAL;
    const rawMetadata =
      contact?.metadata && typeof contact.metadata === "object"
        ? (contact.metadata as Record<string, unknown>)
        : {};
    if (type === "ACTION_NETWORK") {
      const externalId = String(contact.externalId || "").trim() || null;
      const requestedContactable = rawMetadata.contactable !== false;
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
      return {
        source,
        phoneE164,
        fullName: contact.name || null,
        email: this.emailFromActionNetwork(rawMetadata),
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

  /** Provenance source-system key for a connection type (drives ContactSourceRecord). */
  private sourceSystemFor(type: IntegrationConnectionType): string {
    return type === "ACTION_NETWORK" ? "action_network" : "internal_source";
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
    if (dto.type === "ACTION_NETWORK") {
      const candidate = dto.listName?.trim() || dto.audienceName?.trim() || dto.listId;
      const cleaned = candidate.replace(/^Action Network:\s*/i, "").trim() || dto.listId;
      return `Action Network: ${cleaned}`;
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
    raw: string | null | undefined,
    fallbackPayload: IntegrationSyncJobPayload,
  ): SyncCheckpointState {
    const fallback = this.createInitialCheckpointState(fallbackPayload);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as Partial<SyncCheckpointState>;
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

  async syncList(dto: SyncIntegrationListDto) {
    return this.requestSyncList(dto);
  }

  async requestSyncList(dto: SyncIntegrationListDto) {
    const org = await this.ensureOrganization();
    const connection = await this.ensureConnection(dto.type);
    const audienceName = this.buildAudienceName({
      type: dto.type,
      listId: dto.listId,
      listName: dto.listName,
      audienceName: dto.audienceName,
    });

    const initialPayload: IntegrationSyncJobPayload = {
      syncJobId: "",
      type: dto.type,
      listId: dto.listId,
      audienceName,
      listName: dto.listName,
      query: dto.query,
      run: 1,
    };
    const initialState = this.createInitialCheckpointState(initialPayload);

    const syncJob = await this.prisma.integrationSyncJob.create({
      data: {
        tenantId: org.id,
        integrationConnectionId: connection.id,
        status: IntegrationJobStatus.QUEUED,
        query: dto.query,
        remoteListId: dto.listId,
        errorSummary: JSON.stringify(initialState),
      },
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
      queued: queued.queued,
      queueJobId: queued.jobId,
      status: IntegrationJobStatus.QUEUED,
      audienceName,
      listId: dto.listId,
      type: dto.type,
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
    const baseUrl = this.baseUrlFromSettings(syncJob.connection.settings) || this.envCredentials(connectionType).baseUrl;
    const apiKey = this.crypto.decrypt(syncJob.connection.encryptedCredential);
    const checkpoint = this.parseCheckpointState(syncJob.errorSummary, payload);
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

    const audienceId = syncJob.audienceId;
    let ensuredAudienceId = audienceId;
    try {
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
            source:
              connectionType === "ACTION_NETWORK"
                ? AudienceSource.ACTION_NETWORK
                : AudienceSource.INTERNAL,
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
      for (const contact of remoteContacts) {
        try {
          const mapped = this.mapExternalContact(connectionType, contact);
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
            );
            resolvedContactId = spine.id;
          }

          await this.prisma.audienceContact.upsert({
            where: {
              audienceId_phoneE164: {
                audienceId: ensuredAudienceId,
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
              audienceId: ensuredAudienceId,
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
                sourceSystem: this.sourceSystemFor(connectionType),
                externalId: mapped.externalId,
              });
            }
            if (mapped.email) {
              await this.contacts.resolveIdentity(syncJob.tenantId, {
                email: mapped.email,
                phoneE164: mapped.phoneE164,
              });
            }
          }
          syncedDelta += 1;
        } catch (error) {
          failedDelta += 1;
          const reason = this.classifySyncError(error);
          this.bumpReason(reasonCounts, reason);
          if (reason === "invalid_phone_format") skippedInvalidPhone += 1;
          else failedPersist += 1;
          errors.push(String(error));
        }
      }

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
      throw error;
    }
  }

  async getSyncJobs(limit = 20) {
    const org = await this.ensureOrganization();
    return this.prisma.integrationSyncJob.findMany({
      where: { tenantId: org.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
    });
  }

  /** Configured connections for the settings/integrations surface. Never returns the credential. */
  async listConnections() {
    const org = await this.ensureOrganization();
    return this.prisma.integrationConnection.findMany({
      where: { tenantId: org.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
