import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationAuthError, IntegrationConnectionError } from "./integration.errors";
import {
  IntegrationConnector,
  RemoteAudienceList,
  RemoteContact,
  SearchListsInput,
  SyncListInput,
  SyncListResult,
} from "./connectors.types";

/**
 * NationBuilder (classic v1 API). A NATION is the group analogue: every nation has its
 * own endpoint (`https://<slug>.nationbuilder.com`) and its own token, mirroring Action
 * Network's key-per-group — so the connection's baseUrl is derived from the nation slug
 * and there is no platform-wide default. Pagination is by opaque `next` URLs.
 */

/** How many 100-row pages of `/lists` the picker will walk. */
const LIST_SEARCH_MAX_PAGES = 10;
/** NationBuilder's `limit` cap. */
const PER_PAGE = 100;

function mustBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    throw new IntegrationConnectionError("A NationBuilder nation URL is required");
  }
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Resolve NationBuilder's relative `next` paths against the nation's base URL. */
export function resolveNextUrl(baseUrl: string, next: string | null | undefined): string | undefined {
  const trimmed = String(next ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed, `${baseUrl}/`).toString();
  } catch {
    return undefined;
  }
}

/** A person's callable number — mobile first (that is what canvassing texts/dials). */
export function personPhone(person: Record<string, unknown>): string {
  const mobile = typeof person.mobile === "string" ? person.mobile.trim() : "";
  const phone = typeof person.phone === "string" ? person.phone.trim() : "";
  return mobile || phone;
}

export function personName(person: Record<string, unknown>): string | undefined {
  const first = typeof person.first_name === "string" ? person.first_name.trim() : "";
  const last = typeof person.last_name === "string" ? person.last_name.trim() : "";
  const joined = `${first} ${last}`.trim();
  return joined || undefined;
}

type NationBuilderPage<T> = { results?: T[]; next?: string | null };

@Injectable()
export class NationBuilderConnector implements IntegrationConnector {
  constructor(private readonly config: ConfigService) {}

  private maxSyncPages(): number {
    const raw = Number(this.config.get<string>("NATION_BUILDER_SYNC_MAX_PAGES") ?? 50);
    if (!Number.isFinite(raw)) return 50;
    return Math.min(200, Math.max(1, Math.trunc(raw)));
  }

  private async requestJson<T>(url: string, apiKey: string, failure: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
    } catch (error) {
      throw new IntegrationConnectionError(failure, { cause: String(error) });
    }
    if (res.status === 401 || res.status === 403) {
      throw new IntegrationAuthError("NationBuilder token rejected");
    }
    if (!res.ok) {
      throw new IntegrationConnectionError(failure, { status: res.status });
    }
    return (await res.json()) as T;
  }

  async testConnection(apiKey: string, baseUrl?: string): Promise<{ ok: boolean; message?: string }> {
    const root = mustBaseUrl(baseUrl);
    await this.requestJson(`${root}/api/v1/lists?limit=1`, apiKey, "NationBuilder connection failed");
    return { ok: true };
  }

  /**
   * Pages through `/lists`, filtering by name client-side — NationBuilder has no
   * server-side list search. Bounded so a nation with thousands of lists can't turn
   * one picker render into a full crawl.
   */
  async searchLists(apiKey: string, input: SearchListsInput, baseUrl?: string): Promise<RemoteAudienceList[]> {
    const root = mustBaseUrl(baseUrl);
    const query = (input.query ?? "").trim().toLowerCase();
    const limit = Math.min(250, input.limit ?? 25);
    const out: RemoteAudienceList[] = [];
    let url: string | undefined = `${root}/api/v1/lists?limit=${PER_PAGE}`;
    for (let page = 0; page < LIST_SEARCH_MAX_PAGES && url && out.length < limit; page += 1) {
      const body: NationBuilderPage<Record<string, unknown>> = await this.requestJson(
        url,
        apiKey,
        "NationBuilder list search failed",
      );
      for (const row of body.results ?? []) {
        const name = String(row.name ?? row.slug ?? "").trim();
        if (!name || (query && !name.toLowerCase().includes(query))) continue;
        out.push({
          id: String(row.id),
          name,
          count: typeof row.count === "number" ? row.count : undefined,
          source: "NATION_BUILDER",
        });
        if (out.length >= limit) break;
      }
      url = resolveNextUrl(root, body.next);
    }
    return out;
  }

  async sampleListContacts(apiKey: string, listId: string, baseUrl?: string): Promise<RemoteContact[]> {
    const result = await this.syncList(apiKey, { listId, maxPages: 1 }, baseUrl);
    return result.contacts.slice(0, 10);
  }

  async syncList(apiKey: string, input: SyncListInput, baseUrl?: string): Promise<SyncListResult> {
    const root = mustBaseUrl(baseUrl);
    const startedAt = Date.now();
    const maxPages = Math.min(this.maxSyncPages(), Math.max(1, input.maxPages ?? this.maxSyncPages()));
    const contacts: RemoteContact[] = [];
    const reasonCounts: Record<string, number> = {};
    let processedItems = 0;
    let skippedNoPhone = 0;
    let pagesFetched = 0;
    let url: string | undefined =
      input.cursorUrl?.trim() ||
      `${root}/api/v1/lists/${encodeURIComponent(input.listId)}/people?limit=${PER_PAGE}`;

    while (url && pagesFetched < maxPages) {
      const body: NationBuilderPage<Record<string, unknown>> = await this.requestJson(
        url,
        apiKey,
        "NationBuilder list sync failed",
      );
      pagesFetched += 1;
      for (const person of body.results ?? []) {
        processedItems += 1;
        const phone = personPhone(person);
        if (!phone) {
          skippedNoPhone += 1;
          reasonCounts.missing_phone_number = (reasonCounts.missing_phone_number ?? 0) + 1;
          continue;
        }
        contacts.push({
          externalId: person.id != null ? String(person.id) : undefined,
          name: personName(person),
          phone,
          metadata: {
            email: typeof person.email === "string" ? person.email : undefined,
            nationBuilder: {
              id: person.id,
              first_name: person.first_name,
              last_name: person.last_name,
              email: person.email,
              tags: person.tags,
            },
          },
        });
      }
      url = resolveNextUrl(root, body.next);
    }

    return {
      contacts,
      stats: {
        provider: "NATION_BUILDER",
        listId: input.listId,
        listName: input.listName,
        pagesFetched,
        processedItems,
        returnedContacts: contacts.length,
        skippedNoPhone,
        reasonCounts,
        nextCursorUrl: url ?? null,
        fetchDurationMs: Date.now() - startedAt,
      },
    };
  }
}
