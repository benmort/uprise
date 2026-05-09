import { Injectable } from "@nestjs/common";
import {
  IntegrationAuthError,
  IntegrationConnectionError,
} from "./integration.errors";
import {
  IntegrationConnector,
  RemoteAudienceList,
  RemoteContact,
  SearchListsInput,
  SyncListResult,
  SyncListInput,
} from "./connectors.types";

function mustBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    throw new IntegrationConnectionError("INTERNAL_SOURCE_API_BASE_URL is required");
  }
  return baseUrl.trim().replace(/\/$/, "");
}

@Injectable()
export class InternalSourceConnector implements IntegrationConnector {
  async testConnection(apiKey: string, baseUrl?: string): Promise<{ ok: boolean; message?: string }> {
    const root = mustBaseUrl(baseUrl);
    const res = await fetch(`${root}/health`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationAuthError("Internal source API key rejected");
    }
    if (!res.ok) {
      throw new IntegrationConnectionError("Internal source connectivity failed", {
        status: res.status,
      });
    }
    return { ok: true };
  }

  async searchLists(apiKey: string, input: SearchListsInput, baseUrl?: string): Promise<RemoteAudienceList[]> {
    const root = mustBaseUrl(baseUrl);
    const query = encodeURIComponent(input.query || "");
    const res = await fetch(`${root}/lists/search?q=${query}&limit=${Math.min(50, input.limit ?? 20)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) throw new IntegrationAuthError("Internal source API key rejected");
    if (!res.ok) throw new IntegrationConnectionError("Internal source list search failed", { status: res.status });
    const rows = (await res.json()) as Array<{ id: string; name: string; count?: number }>;
    return (rows || []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      count: typeof row.count === "number" ? row.count : undefined,
      source: "INTERNAL",
    }));
  }

  async sampleListContacts(apiKey: string, listId: string, baseUrl?: string): Promise<RemoteContact[]> {
    return this.syncList(apiKey, { listId }, baseUrl).then((rows) => rows.contacts.slice(0, 10));
  }

  async syncList(apiKey: string, input: SyncListInput, baseUrl?: string): Promise<SyncListResult> {
    const root = mustBaseUrl(baseUrl);
    const query = input.query ? `?q=${encodeURIComponent(input.query)}` : "";
    const res = await fetch(`${root}/lists/${encodeURIComponent(input.listId)}/contacts${query}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) throw new IntegrationAuthError("Internal source API key rejected");
    if (!res.ok) throw new IntegrationConnectionError("Internal source sync failed", { status: res.status });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const contacts = (rows || [])
      .map((row) => {
        const phone = typeof row.phone === "string" ? row.phone : "";
        if (!phone) return null;
        return {
          externalId: typeof row.id === "string" ? row.id : undefined,
          name: typeof row.name === "string" ? row.name : undefined,
          phone,
          metadata: row,
        } as RemoteContact;
      })
      .filter((v): v is RemoteContact => !!v);
    const skippedNoPhone = Math.max(0, (rows || []).length - contacts.length);
    const reasonCounts: Record<string, number> = {};
    if (skippedNoPhone > 0) {
      reasonCounts.missing_phone_number = skippedNoPhone;
    }
    return {
      contacts,
      stats: {
        provider: "INTERNAL",
        listId: input.listId,
        listName: input.listName,
        pagesFetched: 1,
        processedItems: (rows || []).length,
        returnedContacts: contacts.length,
        skippedNoPhone,
        reasonCounts,
      },
    };
  }
}
