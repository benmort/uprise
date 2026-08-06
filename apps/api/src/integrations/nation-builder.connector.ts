import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IntegrationConnectionError } from "./integration.errors";
import { NationBuilderClient } from "./nation-builder.client";
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
 *
 * Two ways to pull an audience, because NationBuilder organisers live in tags as much
 * as lists: a LIST (`listId` = the numeric list id) or a TAG (`listId` = `tag:<name>`,
 * paging `/api/v1/tags/:tag/people`). The `tag:` prefix threads tag pulls through the
 * whole existing pipeline — payloads, checkpoints, `Audience.externalListId` — with no
 * schema change, and keys re-syncs of the same tag onto the same audience.
 */

/** How many 100-row pages of `/lists` (or `/tags`) the picker will walk. */
const LIST_SEARCH_MAX_PAGES = 10;
/** NationBuilder's `limit` cap. */
const PER_PAGE = 100;
/** `listId` prefix marking a tag pull (the remainder is the tag name, un-encoded). */
export const NB_TAG_LIST_PREFIX = "tag:";

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
  constructor(
    private readonly config: ConfigService,
    private readonly client: NationBuilderClient,
  ) {}

  private maxSyncPages(): number {
    const raw = Number(this.config.get<string>("NATION_BUILDER_SYNC_MAX_PAGES") ?? 50);
    if (!Number.isFinite(raw)) return 50;
    return Math.min(200, Math.max(1, Math.trunc(raw)));
  }

  /** All HTTP goes through the shared throttled/retrying client — one rate budget per nation. */
  private requestJson<T>(url: string, apiKey: string, failure: string): Promise<T> {
    return this.client.requestJson<T>(url, apiKey, failure);
  }

  async testConnection(apiKey: string, baseUrl?: string): Promise<{ ok: boolean; message?: string }> {
    const root = mustBaseUrl(baseUrl);
    await this.requestJson(`${root}/api/v1/lists?limit=1`, apiKey, "NationBuilder connection failed");
    return { ok: true };
  }

  /**
   * Pages through `/lists` (or `/tags`, when asked), filtering by name client-side —
   * NationBuilder has no server-side search for either. Bounded so a nation with
   * thousands of lists can't turn one picker render into a full crawl.
   */
  async searchLists(apiKey: string, input: SearchListsInput, baseUrl?: string): Promise<RemoteAudienceList[]> {
    const root = mustBaseUrl(baseUrl);
    const query = (input.query ?? "").trim().toLowerCase();
    const limit = Math.min(250, input.limit ?? 25);
    const out: RemoteAudienceList[] = [];
    const browsingTags = input.kind === "tags";
    let url: string | undefined = browsingTags
      ? `${root}/api/v1/tags?limit=${PER_PAGE}`
      : `${root}/api/v1/lists?limit=${PER_PAGE}`;
    for (let page = 0; page < LIST_SEARCH_MAX_PAGES && url && out.length < limit; page += 1) {
      const body: NationBuilderPage<Record<string, unknown>> = await this.requestJson(
        url,
        apiKey,
        browsingTags ? "NationBuilder tag search failed" : "NationBuilder list search failed",
      );
      for (const row of body.results ?? []) {
        const name = String(row.name ?? row.slug ?? "").trim();
        if (!name || (query && !name.toLowerCase().includes(query))) continue;
        out.push({
          // A tag row's id carries the `tag:` prefix so the sync path knows which
          // people endpoint to page — and so Audience.externalListId can never
          // collide with a numeric list id.
          id: browsingTags ? `${NB_TAG_LIST_PREFIX}${name}` : String(row.id),
          name,
          count:
            typeof row.count === "number"
              ? row.count
              : typeof row.taggings_count === "number"
                ? row.taggings_count
                : undefined,
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

  /** First page URL for a list id or a `tag:<name>` pseudo-id. */
  private firstPageUrl(root: string, listId: string): string {
    if (listId.startsWith(NB_TAG_LIST_PREFIX)) {
      const tag = listId.slice(NB_TAG_LIST_PREFIX.length);
      return `${root}/api/v1/tags/${encodeURIComponent(tag)}/people?limit=${PER_PAGE}`;
    }
    return `${root}/api/v1/lists/${encodeURIComponent(listId)}/people?limit=${PER_PAGE}`;
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
    let url: string | undefined = input.cursorUrl?.trim() || this.firstPageUrl(root, input.listId);

    while (url && pagesFetched < maxPages) {
      const body: NationBuilderPage<Record<string, unknown>> = await this.requestJson(
        url,
        apiKey,
        "NationBuilder list import failed",
      );
      pagesFetched += 1;
      for (const person of body.results ?? []) {
        processedItems += 1;
        const phone = personPhone(person);
        if (!phone) {
          // Email-only people are KEPT (phone: "") — the service imports them as
          // non-contactable rows so an email-only nation doesn't sync to zero.
          // Still counted, so the sync stats can say how many can't be texted.
          skippedNoPhone += 1;
          reasonCounts.missing_phone_number = (reasonCounts.missing_phone_number ?? 0) + 1;
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
              // Contactability flags ride along so the import can mirror an
              // NB-side opt-out into uprise consent (never the other way).
              do_not_call: person.do_not_call,
              do_not_contact: person.do_not_contact,
              mobile_opt_in: person.mobile_opt_in,
              email_opt_in: person.email_opt_in,
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
