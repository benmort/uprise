import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import {
  AudienceSource,
  IntegrationConnectionStatus,
  IntegrationJobStatus,
  IntegrationType,
  Prisma,
} from "../../src/generated/prisma";
import { PrismaService } from "../prisma/prisma.service";
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

type IntegrationConnectionType = "ACTION_NETWORK" | "INTERNAL";
type SyncReasonCounts = Record<string, number>;
type MappedExternalContact = {
  source: AudienceSource;
  phoneE164: string;
  fullName: string | null;
  externalId: string | null;
  metadata: Prisma.InputJsonValue;
  contactable: boolean;
  nonContactableReason: string | null;
};

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CredentialCryptoService,
    private readonly actionNetwork: ActionNetworkConnector,
    private readonly internalSource: InternalSourceConnector,
    private readonly logger: DomainLogger,
  ) {}

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
    return this.prisma.organization.upsert({
      where: { slug },
      create: { slug, name: "Default Organization" },
      update: {},
    });
  }

  private async resolveConnection(type: IntegrationConnectionType) {
    const org = await this.ensureOrganization();
    const existing = await this.prisma.integrationConnection.findFirst({
      where: {
        organizationId: org.id,
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
              organizationId: org.id,
              type: dto.type as IntegrationType,
            },
            select: { id: true },
          })
        )?.id || "missing",
      },
      create: {
        organizationId: org.id,
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
      externalId: contact.externalId || null,
      contactable: true,
      nonContactableReason: null,
      metadata:
        withDefaultContactable(sanitizeMetadata(rawMetadata)) as Prisma.InputJsonValue,
    };
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

  async syncList(dto: SyncIntegrationListDto) {
    const org = await this.ensureOrganization();
    const connection = await this.ensureConnection(dto.type);

    const syncJob = await this.prisma.integrationSyncJob.create({
      data: {
        organizationId: org.id,
        integrationConnectionId: connection.id,
        status: IntegrationJobStatus.RUNNING,
        query: dto.query,
        remoteListId: dto.listId,
        startedAt: new Date(),
      },
    });

    try {
      const remoteSync = await this.connector(dto.type).syncList(
        connection.apiKey,
        { listId: dto.listId, query: dto.query, listName: dto.listName },
        connection.baseUrl,
      );
      const remoteContacts = remoteSync.contacts;
      const reasonCounts: SyncReasonCounts = {
        ...(remoteSync.stats.reasonCounts || {}),
      };

      const audienceName = (() => {
        if (dto.type === "ACTION_NETWORK") {
          const candidate = dto.listName?.trim() || dto.audienceName?.trim() || dto.listId;
          const cleaned = candidate.replace(/^Action Network:\s*/i, "").trim() || dto.listId;
          return `Action Network: ${cleaned}`;
        }
        return (
          dto.audienceName?.trim() ||
          dto.listName?.trim() ||
          `Internal: ${dto.listId}`
        );
      })();
      const audience = await this.prisma.audience.create({
        data: {
          organizationId: org.id,
          name: audienceName,
          source:
            dto.type === "ACTION_NETWORK" ? AudienceSource.ACTION_NETWORK : AudienceSource.INTERNAL,
          externalListId: dto.listId,
          status: "ACTIVE",
          syncedAt: new Date(),
        },
      });

      let syncedCount = 0;
      let failedCount = 0;
      let skippedInvalidPhone = 0;
      let failedPersist = 0;
      const errors: string[] = [];
      for (const contact of remoteContacts) {
        try {
          const mapped = this.mapExternalContact(dto.type, contact);
          if (!mapped.contactable && mapped.nonContactableReason) {
            if (mapped.nonContactableReason === "invalid_phone_format") {
              this.bumpReason(reasonCounts, mapped.nonContactableReason);
              skippedInvalidPhone += 1;
            }
          }
          await this.prisma.audienceContact.upsert({
            where: {
              audienceId_phoneE164: {
                audienceId: audience.id,
                phoneE164: mapped.phoneE164,
              },
            },
            update: {
              fullName: mapped.fullName,
              metadata: mapped.metadata,
              externalId: mapped.externalId,
              source: mapped.source,
            },
            create: {
              organizationId: org.id,
              audienceId: audience.id,
              phoneE164: mapped.phoneE164,
              fullName: mapped.fullName,
              metadata: mapped.metadata,
              externalId: mapped.externalId,
              source: mapped.source,
            },
          });
          syncedCount += 1;
        } catch (error) {
          failedCount += 1;
          const reason = this.classifySyncError(error);
          this.bumpReason(reasonCounts, reason);
          if (reason === "invalid_phone_format") skippedInvalidPhone += 1;
          else failedPersist += 1;
          errors.push(String(error));
        }
      }

      const stats = {
        provider: dto.type,
        listId: dto.listId,
        listName: dto.listName || remoteSync.stats.listName || audienceName,
        pagesFetched: remoteSync.stats.pagesFetched,
        processedItems: remoteSync.stats.processedItems,
        returnedContacts: remoteSync.stats.returnedContacts,
        skippedNoPhone: remoteSync.stats.skippedNoPhone,
        skippedInvalidPhone,
        failedPersist,
        syncedCount,
        failedCount,
        reasonCounts,
        sampleErrors: errors.slice(0, 5),
      };

      await this.prisma.integrationSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: failedCount > 0 ? IntegrationJobStatus.SUCCEEDED : IntegrationJobStatus.SUCCEEDED,
          syncedCount,
          failedCount,
          errorSummary: JSON.stringify(stats),
          completedAt: new Date(),
          audienceId: audience.id,
        },
      });

      this.logger.log("integrations", "Sync finished", {
        type: dto.type,
        listId: dto.listId,
        syncedCount,
        failedCount,
      });

      return {
        audienceId: audience.id,
        syncedCount,
        failedCount,
        stats,
      };
    } catch (error) {
      await this.prisma.integrationSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: IntegrationJobStatus.FAILED,
          completedAt: new Date(),
          errorSummary: String(error),
        },
      });
      throw error;
    }
  }

  async getSyncJobs(limit = 20) {
    const org = await this.ensureOrganization();
    return this.prisma.integrationSyncJob.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(1, limit), 100),
    });
  }
}
